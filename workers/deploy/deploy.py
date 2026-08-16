"""Déploiement rejouable du worker YATCO vers ubuntu@51.44.220.145:~/moana.

Deux modes :
- dry-run (défaut) : construit un plan JSON déterministe, aucun accès réseau,
  aucune mutation locale ou distante, aucune dépendance à une exécution
  précédente.
- ``--apply`` : synchronise les artefacts puis recharge les unités systemd
  via ssh/scp. La clé privée est lue exclusivement depuis ``MOANA_SSH_KEY``
  (jamais un chemin en dur, jamais journalisée), écrite dans un fichier
  temporaire 0600 supprimé en fin d'exécution.

Stdlib uniquement, comme ``yatco_ingest_worker.py``.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import random
import subprocess
import sys
import tempfile
import time
from collections.abc import Callable
from dataclasses import dataclass, field

LOGGER = logging.getLogger("moana.deploy")

REMOTE_USER = "ubuntu"
REMOTE_HOST = "51.44.220.145"
REMOTE_PATH = "~/moana"

# Liste figée en code (pas de scan de répertoire) pour garantir un plan
# dry-run strictement identique d'une exécution à l'autre.
DEPLOY_ARTIFACTS: tuple[str, ...] = (
    "scripts/yatco_collector.py",
    "workers/yatco_ingest_worker.py",
    "workers/docker/Dockerfile.yatco-worker",
    "workers/docker/Dockerfile.yatco-collector",
    "workers/docker/docker-compose.yatco.yml",
    "workers/deploy/moana-yatco-collect.service",
    "workers/deploy/moana-yatco-ingest.service",
    "workers/deploy/moana-yatco-ingest.timer",
)

REMOTE_COMMANDS: tuple[str, ...] = (
    "sudo cp workers/deploy/moana-yatco-collect.service /etc/systemd/system/moana-yatco-collect.service",
    "sudo cp workers/deploy/moana-yatco-ingest.service /etc/systemd/system/moana-yatco-ingest.service",
    "sudo cp workers/deploy/moana-yatco-ingest.timer /etc/systemd/system/moana-yatco-ingest.timer",
    "sudo systemctl daemon-reload",
    "sudo systemctl enable --now moana-yatco-ingest.timer",
)


class ConfigurationError(RuntimeError):
    """Configuration manquante ou non sûre."""


class DeploymentError(RuntimeError):
    """Échec définitif d'une étape de déploiement distant."""


def env_int(name: str, default: int, minimum: int, maximum: int) -> int:
    try:
        value = int(os.getenv(name, str(default)))
    except ValueError as exc:
        raise ConfigurationError(f"{name} must be an integer") from exc
    if not minimum <= value <= maximum:
        raise ConfigurationError(f"{name} must be between {minimum} and {maximum}")
    return value


def env_float(name: str, default: float, minimum: float, maximum: float) -> float:
    try:
        value = float(os.getenv(name, str(default)))
    except ValueError as exc:
        raise ConfigurationError(f"{name} must be a number") from exc
    if not minimum <= value <= maximum:
        raise ConfigurationError(f"{name} must be between {minimum} and {maximum}")
    return value


@dataclass(frozen=True)
class Settings:
    timeout_s: float = field(default_factory=lambda: env_float("MOANA_DEPLOY_TIMEOUT_S", 30.0, 1.0, 300.0))
    max_retries: int = field(default_factory=lambda: env_int("MOANA_DEPLOY_MAX_RETRIES", 3, 0, 10))
    backoff_base_s: float = field(default_factory=lambda: env_float("MOANA_DEPLOY_BACKOFF_BASE_S", 1.0, 0.1, 60.0))
    backoff_cap_s: float = field(default_factory=lambda: env_float("MOANA_DEPLOY_BACKOFF_CAP_S", 20.0, 1.0, 300.0))


def build_plan(repo_root: str) -> dict:
    """Construit le plan de déploiement déterministe (aucun accès réseau)."""
    return {
        "target": f"{REMOTE_USER}@{REMOTE_HOST}:{REMOTE_PATH}",
        "artifacts": [
            {"local": path, "exists": os.path.isfile(os.path.join(repo_root, path))}
            for path in DEPLOY_ARTIFACTS
        ],
        "remote_commands": list(REMOTE_COMMANDS),
    }


def load_ssh_key() -> str:
    key = os.environ.get("MOANA_SSH_KEY", "")
    if not key.strip():
        raise ConfigurationError("Missing configuration: MOANA_SSH_KEY")
    return key


def write_key_file(key_content: str) -> str:
    fd, path = tempfile.mkstemp(prefix="moana-deploy-key-")
    os.chmod(path, 0o600)
    with os.fdopen(fd, "w") as fh:
        fh.write(key_content if key_content.endswith("\n") else key_content + "\n")
    return path


def run_with_retry(command: list[str], settings: Settings, run: Callable = subprocess.run) -> None:
    attempt = 0
    while True:
        try:
            result = run(command, timeout=settings.timeout_s, capture_output=True, text=True, check=False)
            if result.returncode == 0:
                return
            raise DeploymentError(f"command exited with {result.returncode}: {command[0]}")
        except (subprocess.TimeoutExpired, DeploymentError) as exc:
            attempt += 1
            if attempt > settings.max_retries:
                raise DeploymentError(f"step failed after {attempt} attempt(s): {command[0]}") from exc
            delay = min(settings.backoff_cap_s, settings.backoff_base_s * (2 ** (attempt - 1)))
            delay = min(settings.backoff_cap_s, delay + random.uniform(0, delay * 0.1))
            LOGGER.warning("retrying step in %.2fs (attempt %d/%d): %s", delay, attempt, settings.max_retries, command[0])
            time.sleep(delay)


def apply_deploy(repo_root: str, settings: Settings, run: Callable = subprocess.run) -> None:
    key_content = load_ssh_key()
    key_path = write_key_file(key_content)
    try:
        ssh_target = f"{REMOTE_USER}@{REMOTE_HOST}"
        ssh_opts = ["-i", key_path, "-o", "StrictHostKeyChecking=accept-new", "-o", "BatchMode=yes"]
        ssh_base = ["ssh", *ssh_opts, ssh_target]
        scp_base = ["scp", *ssh_opts]

        run_with_retry(
            ssh_base + [f"mkdir -p {REMOTE_PATH}/workers/deploy {REMOTE_PATH}/workers/docker {REMOTE_PATH}/scripts"],
            settings,
            run,
        )
        for artifact in DEPLOY_ARTIFACTS:
            local_path = os.path.join(repo_root, artifact)
            run_with_retry(scp_base + [local_path, f"{ssh_target}:{REMOTE_PATH}/{artifact}"], settings, run)
        for command in REMOTE_COMMANDS:
            run_with_retry(ssh_base + [f"cd {REMOTE_PATH} && {command}"], settings, run)
    finally:
        os.remove(key_path)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Déploiement du worker YATCO")
    parser.add_argument("--apply", action="store_true", help="Exécute le déploiement réel (défaut : dry-run)")
    parser.add_argument("--repo-root", default=os.getcwd())
    args = parser.parse_args(argv)

    logging.basicConfig(level=logging.INFO)

    if not args.apply:
        print(json.dumps(build_plan(args.repo_root), indent=2, sort_keys=True))
        return 0

    try:
        apply_deploy(args.repo_root, Settings())
    except (ConfigurationError, DeploymentError) as exc:
        LOGGER.error("deployment failed: %s", exc)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
