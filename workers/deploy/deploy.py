"""Déploiement rejouable du worker YATCO vers ubuntu@51.44.220.145:~/moana.

Deux modes :
- dry-run (défaut) : construit un plan JSON déterministe, aucun accès réseau,
  aucune mutation locale ou distante, aucune dépendance à une exécution
  précédente.
- ``--apply`` : synchronise les artefacts puis recharge les unités systemd
  via ssh/scp. La clé privée est lue exclusivement depuis ``MOANA_SSH_KEY``
  (jamais un chemin en dur, jamais journalisée), écrite dans un fichier
  temporaire 0600 supprimé en fin d'exécution. De même, ``NEXT_PUBLIC_SUPABASE_URL``
  et ``SUPABASE_SERVICE_ROLE_KEY`` sont lues depuis ``os.environ``, écrites dans un
  .env Compose temporaire 0600 transféré vers ``~/moana/workers/docker/.env`` puis
  supprimé localement (succès ou échec).

Stdlib uniquement, comme ``yatco_ingest_worker.py``.
"""

from __future__ import annotations

import argparse
import dataclasses
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
    ".dockerignore",
    "scripts/yatco_collector.py",
    "workers/yatco_ingest_worker.py",
    "workers/docker/Dockerfile.yatco-worker",
    "workers/docker/Dockerfile.yatco-collector",
    "workers/docker/docker-compose.yatco.yml",
    "workers/deploy/moana-yatco-collect.service",
    "workers/deploy/moana-yatco-ingest.service",
    "workers/deploy/moana-yatco-ingest.timer",
)

REQUIRED_UNITS: tuple[str, ...] = (
    "moana-yatco-collect.service",
    "moana-yatco-ingest.service",
    "moana-yatco-ingest.timer",
)

# Variables Supabase consommées par le service worker via le .env colocalisé
# (docker-compose.yatco.yml). Lues exclusivement depuis os.environ, jamais
# journalisées ni committées.
ENV_FILE_VARIABLES: tuple[str, ...] = (
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
)

# Destination exacte du .env Compose distant.
ENV_FILE_REMOTE_PATH = f"{REMOTE_PATH}/workers/docker/.env"

REMOTE_COMMANDS: tuple[str, ...] = (
    "sudo cp workers/deploy/moana-yatco-collect.service /etc/systemd/system/moana-yatco-collect.service",
    "sudo cp workers/deploy/moana-yatco-ingest.service /etc/systemd/system/moana-yatco-ingest.service",
    "sudo cp workers/deploy/moana-yatco-ingest.timer /etc/systemd/system/moana-yatco-ingest.timer",
    "sudo systemctl daemon-reload",
    "docker compose -f workers/docker/docker-compose.yatco.yml build worker",
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
    # `systemctl start` sur moana-yatco-ingest.service (Type=oneshot) bloque jusqu'à la fin
    # réelle du worker (TimeoutStartSec=1200 côté unit) : ce step a besoin de son propre
    # budget, nettement plus long que les sondes courtes (status/journalctl/is-failed) qui
    # continuent d'utiliser `timeout_s`.
    unit_start_timeout_s: float = field(
        default_factory=lambda: env_float("MOANA_DEPLOY_UNIT_START_TIMEOUT_S", 1200.0, 30.0, 1200.0)
    )


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


def load_env_value(name: str) -> str:
    """Lecture EXCLUSIVE depuis os.environ : aucun fichier du dépôt n'est consulté."""
    value = os.environ.get(name, "")
    if not value.strip():
        raise ConfigurationError(f"Missing configuration: {name}")
    if "\n" in value or "\r" in value:
        raise ConfigurationError(f"{name} must not contain newline characters")
    return value


def write_env_file() -> str:
    """Écrit le .env Compose temporaire local (0600), sans jamais journaliser les valeurs."""
    pairs = {name: load_env_value(name) for name in ENV_FILE_VARIABLES}
    fd, path = tempfile.mkstemp(prefix="moana-deploy-env-")
    os.chmod(path, 0o600)
    with os.fdopen(fd, "w") as fh:
        for name in ENV_FILE_VARIABLES:
            fh.write(f"{name}={pairs[name]}\n")
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


def redact_secrets(text: str, secrets: tuple[str, ...]) -> str:
    """Retire toute occurrence littérale des secrets fournis d'un texte diagnostic distant."""
    for secret in secrets:
        if secret:
            text = text.replace(secret, "[REDACTED]")
    return text


def diagnose_unit(
    unit: str,
    ssh_base: list[str],
    settings: Settings,
    run: Callable = subprocess.run,
    secrets: tuple[str, ...] = (),
) -> str:
    """Sonde SSH en lecture seule (statut systemd + tail journal), sans mutation.

    Sert à révéler la cause réelle d'un échec distant avant toute nouvelle
    relance complète du déploiement. La sortie brute de ``systemctl status``
    et ``journalctl`` peut en théorie recopier un secret (ex. valeur visible
    dans un message d'erreur applicatif) : ``secrets`` est donc systématiquement
    passé pour l'assainir avant retour.
    """
    status = run(
        ssh_base + [f"sudo systemctl status --no-pager {unit}"],
        timeout=settings.timeout_s,
        capture_output=True,
        text=True,
        check=False,
    )
    logs = run(
        ssh_base + [f"sudo journalctl -u {unit} -n 80 --no-pager"],
        timeout=settings.timeout_s,
        capture_output=True,
        text=True,
        check=False,
    )
    diagnosis = (
        f"--- systemctl status {unit} ---\n{status.stdout}{status.stderr}\n"
        f"--- journalctl -u {unit} ---\n{logs.stdout}{logs.stderr}"
    )
    return redact_secrets(diagnosis, secrets)


# États reconnus en sortie de ``systemctl is-failed`` (hors "failed" lui-même).
# Toute autre valeur de stdout (ex. chaîne vide renvoyée par une connexion SSH
# rompue) est traitée comme un verdict non concluant, donc comme un échec.
_IS_FAILED_KNOWN_STATES = frozenset(
    {"active", "inactive", "activating", "deactivating", "reloading", "unknown"}
)


def _probe_state(
    unit: str, ssh_base: list[str], settings: Settings, run: Callable
) -> tuple[str, str]:
    """Retourne (InvocationID, ExecMainStartTimestamp).

    ``moana-yatco-ingest.service`` est ``Type=oneshot`` sans ``RemainAfterExit`` :
    dès que le worker termine, l'unité repasse à ``inactive`` et
    ``ActiveEnterTimestamp``/``MainPID`` sont remis à vide/0, y compris pour un
    run qui vient de réussir. ``InvocationID`` (identifiant unique par run) et
    ``ExecMainStartTimestamp`` restent renseignés après coup et sont donc les
    seuls signaux fiables de fraîcheur pour ce type d'unité.
    """
    state_probe = run(
        ssh_base + [f"systemctl show {unit} --property=InvocationID,ExecMainStartTimestamp"],
        timeout=settings.timeout_s,
        capture_output=True,
        text=True,
        check=False,
    )
    state = dict(line.partition("=")[::2] for line in state_probe.stdout.splitlines() if "=" in line)
    return state.get("InvocationID", "").strip(), state.get("ExecMainStartTimestamp", "").strip()


def trigger_and_verify_unit(
    unit: str,
    ssh_base: list[str],
    settings: Settings,
    run: Callable = subprocess.run,
    secrets: tuple[str, ...] = (),
) -> None:
    """Force un état frais (reset-failed puis start) et n'accepte le verdict que sur cet état post-déclenchement.

    Un ``is-failed`` lu avant tout déclenchement peut refléter un échec périmé
    d'une exécution précédente ; ``reset-failed`` efface ce cache et ``start``
    force un redémarrage. La preuve que le verdict porte bien sur cette nouvelle
    exécution est un ``InvocationID`` frais, lu avant tout déclenchement puis de
    nouveau après ``start`` (S2), qui doit avoir réellement changé ; sans ce
    changement, sans preuve fraîche, ou en cas de returncode de transport SSH
    hors {0, 1} sur la sonde ``is-failed`` (échec de la connexion elle-même,
    distinct du verdict systemd 0/1 propre à ``is-failed``), le service n'est
    jamais déclaré sain par défaut.
    """
    invocation_before, exec_start_before = _probe_state(unit, ssh_base, settings, run)

    run_with_retry(ssh_base + [f"sudo systemctl reset-failed {unit}"], settings, run)
    start_settings = dataclasses.replace(settings, timeout_s=settings.unit_start_timeout_s)
    run_with_retry(ssh_base + [f"sudo systemctl start {unit}"], start_settings, run)

    invocation_after, exec_start_after = _probe_state(unit, ssh_base, settings, run)
    if not invocation_after:
        diagnosis = diagnose_unit(unit, ssh_base, settings, run, secrets)
        raise DeploymentError(f"{unit} produced no InvocationID after trigger:\n{diagnosis}")
    if invocation_after == invocation_before and exec_start_after == exec_start_before:
        diagnosis = diagnose_unit(unit, ssh_base, settings, run, secrets)
        raise DeploymentError(
            f"{unit} state did not change after trigger "
            f"(invocation_id={invocation_after!r}, exec_start={exec_start_after!r}):\n{diagnosis}"
        )

    is_failed = run(
        ssh_base + [f"systemctl is-failed {unit}"],
        timeout=settings.timeout_s,
        capture_output=True,
        text=True,
        check=False,
    )
    # ``systemctl is-failed`` encode son verdict dans SON PROPRE code de sortie :
    # 0 = état "failed", 1 = tout état sain (active/inactive/...). Un healthy
    # "inactive" (cas normal d'un oneshot qui vient de terminer) renvoie donc
    # rc=1 en toute légitimité. Seuls des codes hors {0, 1} trahissent un échec
    # de transport SSH (ex. 255) distinct du verdict systemd lui-même.
    if is_failed.returncode not in (0, 1):
        diagnosis = diagnose_unit(unit, ssh_base, settings, run, secrets)
        raise DeploymentError(
            f"{unit} is-failed probe returned a non-zero SSH returncode "
            f"{is_failed.returncode}, rejected before parsing its stdout:\n{diagnosis}"
        )
    verdict = is_failed.stdout.strip()
    if verdict == "failed" or verdict not in _IS_FAILED_KNOWN_STATES:
        diagnosis = diagnose_unit(unit, ssh_base, settings, run, secrets)
        raise DeploymentError(
            f"{unit} verdict after trigger is failed or inconclusive "
            f"(state={verdict!r}, rc={is_failed.returncode}):\n{diagnosis}"
        )


def apply_deploy(repo_root: str, settings: Settings, run: Callable = subprocess.run) -> None:
    key_content = load_ssh_key()
    key_path = write_key_file(key_content)
    temp_paths: list[str] = [key_path]
    try:
        env_path = write_env_file()
        temp_paths.append(env_path)
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
        run_with_retry(scp_base + [env_path, f"{ssh_target}:{ENV_FILE_REMOTE_PATH}"], settings, run)
        for command in REMOTE_COMMANDS:
            run_with_retry(ssh_base + [f"cd {REMOTE_PATH} && {command}"], settings, run)

        secrets = (key_content, *(load_env_value(name) for name in ENV_FILE_VARIABLES))
        trigger_and_verify_unit("moana-yatco-ingest.service", ssh_base, settings, run, secrets)
    finally:
        for path in temp_paths:
            os.remove(path)


def looks_like_private_key(key_content: str) -> bool:
    """Validation de forme minimale, sans jamais journaliser la valeur."""
    return "PRIVATE KEY" in key_content and key_content.strip().startswith("-----BEGIN")


def check_local_units(repo_root: str) -> dict[str, bool]:
    return {
        unit: os.path.isfile(os.path.join(repo_root, "workers", "deploy", unit))
        for unit in REQUIRED_UNITS
    }


def check_ssh_connection(key_path: str, settings: Settings, run: Callable = subprocess.run) -> bool:
    ssh_target = f"{REMOTE_USER}@{REMOTE_HOST}"
    command = [
        "ssh",
        "-i", key_path,
        "-o", "StrictHostKeyChecking=accept-new",
        "-o", "BatchMode=yes",
        "-o", f"ConnectTimeout={max(1, int(settings.timeout_s))}",
        ssh_target,
        "true",
    ]
    try:
        result = run(command, timeout=settings.timeout_s, capture_output=True, text=True, check=False)
    except (subprocess.TimeoutExpired, OSError):
        return False
    return result.returncode == 0


def run_check(repo_root: str, settings: Settings, run: Callable = subprocess.run) -> tuple[int, dict]:
    """Contrôle check/dry-run : clé, connexion SSH, unités locales. Aucun secret en sortie."""
    try:
        key_content = load_ssh_key()
    except ConfigurationError as exc:
        return 1, {"ok": False, "failed_check": "ssh_key", "reason": str(exc)}

    if not looks_like_private_key(key_content):
        return 1, {
            "ok": False,
            "failed_check": "ssh_key",
            "reason": "MOANA_SSH_KEY is not a usable private key",
        }

    key_path = write_key_file(key_content)
    try:
        ssh_ok = check_ssh_connection(key_path, settings, run)
    finally:
        os.remove(key_path)

    if not ssh_ok:
        return 1, {
            "ok": False,
            "failed_check": "ssh_connection",
            "reason": f"unable to open SSH connection to {REMOTE_USER}@{REMOTE_HOST}",
        }

    units = check_local_units(repo_root)
    if not all(units.values()):
        missing = [name for name, present in units.items() if not present]
        return 1, {
            "ok": False,
            "failed_check": "systemd_units",
            "reason": f"missing local units: {', '.join(missing)}",
        }

    return 0, {
        "ok": True,
        "ssh_key": "usable",
        "ssh_connection": "open",
        "systemd_units": list(REQUIRED_UNITS),
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Déploiement du worker YATCO")
    parser.add_argument(
        "command",
        nargs="?",
        default=None,
        choices=["check"],
        help="Contrôle préflight (clé SSH, connexion, unités) sans mutation",
    )
    parser.add_argument("--apply", action="store_true", help="Exécute le déploiement réel (défaut : dry-run)")
    parser.add_argument("--repo-root", default=os.getcwd())
    args = parser.parse_args(argv)

    logging.basicConfig(level=logging.INFO)

    if args.command == "check":
        code, report = run_check(args.repo_root, Settings())
        print(json.dumps(report, indent=2, sort_keys=True))
        return code

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
