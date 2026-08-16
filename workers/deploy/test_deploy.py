"""Tests du déploiement rejouable : stabilité du dry-run, unités systemd, secrets.

Vérifie le contrat de plan.json S4 : deux dry-run consécutifs produisent une
sortie strictement identique, les deux unités passent ``systemd-analyze
verify``, et aucun motif de clé privée ni de secret en dur ne traîne sous
``workers/deploy/``.
"""

from __future__ import annotations

import re
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

DEPLOY_DIR = Path(__file__).resolve().parent
REPO_ROOT = DEPLOY_DIR.parent.parent

PRIVATE_KEY_PATTERN = re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----")
SECRET_PATTERNS = (
    re.compile(r"SUPABASE_SERVICE_ROLE_KEY\s*=\s*[\"']?[A-Za-z0-9._-]+"),
    re.compile(r"MOANA_SSH_KEY\s*=\s*[\"']?[A-Za-z0-9._-]+"),
)


def run_dry_run() -> str:
    result = subprocess.run(
        [sys.executable, str(DEPLOY_DIR / "deploy.py"), "--repo-root", str(REPO_ROOT)],
        capture_output=True,
        text=True,
        check=True,
        timeout=30,
    )
    return result.stdout


def test_dry_run_is_stable_and_units_are_safe() -> None:
    first_run = run_dry_run()
    second_run = run_dry_run()
    assert first_run == second_run, "le plan dry-run doit être identique d'une exécution à l'autre"
    assert '"apply"' not in first_run
    assert "51.44.220.145" in first_run

    systemd_analyze = shutil.which("systemd-analyze")
    if systemd_analyze is None:
        pytest.fail("systemd-analyze est requis pour valider les unités et n'est pas disponible")

    verify = subprocess.run(
        [
            systemd_analyze,
            "verify",
            str(DEPLOY_DIR / "moana-yatco-collect.service"),
            str(DEPLOY_DIR / "moana-yatco-ingest.service"),
            str(DEPLOY_DIR / "moana-yatco-ingest.timer"),
        ],
        capture_output=True,
        text=True,
        check=False,
        timeout=30,
    )
    assert verify.returncode == 0, f"systemd-analyze verify a échoué: {verify.stderr}"

    for path in DEPLOY_DIR.iterdir():
        if not path.is_file():
            continue
        content = path.read_text(encoding="utf-8")
        assert not PRIVATE_KEY_PATTERN.search(content), f"clé privée trouvée dans {path}"
        for pattern in SECRET_PATTERNS:
            assert not pattern.search(content), f"secret en dur trouvé dans {path}"


def test_timer_cadence_is_fixed_at_24h() -> None:
    content = (DEPLOY_DIR / "moana-yatco-ingest.timer").read_text(encoding="utf-8")
    assert "OnBootSec=15min" in content
    assert "OnUnitActiveSec=24h" in content
    assert "Unit=moana-yatco-ingest.service" in content
    assert "Persistent=true" in content


def test_ingest_depends_on_collect_service() -> None:
    content = (DEPLOY_DIR / "moana-yatco-ingest.service").read_text(encoding="utf-8")
    unit_section = content.split("[Service]", 1)[0]
    after_value = re.search(r"^After=(.*)$", unit_section, re.MULTILINE).group(1)
    requires_value = re.search(r"^Requires=(.*)$", unit_section, re.MULTILINE).group(1)
    assert after_value.count("moana-yatco-collect.service") == 1
    assert requires_value.count("moana-yatco-collect.service") == 1


SHARED_LOCK_PATH = "/run/lock/moana-yatco.lock"


def test_collect_service_runs_collector_under_shared_lock() -> None:
    content = (DEPLOY_DIR / "moana-yatco-collect.service").read_text(encoding="utf-8")
    assert "Type=oneshot" in content
    assert "[Install]" not in content

    exec_start_match = re.search(r"^ExecStart=(.*)$", content, re.MULTILINE)
    assert exec_start_match is not None, "ExecStart introuvable"
    exec_start = exec_start_match.group(1)

    assert exec_start == (
        "/usr/bin/flock -n /run/lock/moana-yatco.lock -c "
        "'/usr/bin/docker compose -f workers/docker/docker-compose.yatco.yml run --rm collector'"
    )


def test_ingest_runs_worker_under_shared_nonblocking_lock_without_collector() -> None:
    content = (DEPLOY_DIR / "moana-yatco-ingest.service").read_text(encoding="utf-8")

    exec_start_match = re.search(r"^ExecStart=(.*)$", content, re.MULTILINE)
    assert exec_start_match is not None, "ExecStart introuvable"
    exec_start = exec_start_match.group(1)

    assert re.search(r"flock\s+-n\s+" + re.escape(SHARED_LOCK_PATH), exec_start), (
        "le verrou doit être non bloquant (-n) sur le fichier partagé pour refuser un second cycle"
    )

    assert "run --rm worker" in exec_start, "worker doit être invoqué dans ExecStart"
    assert "collector" not in exec_start, (
        "le collecteur ne doit jamais être invoqué depuis l'unité d'ingestion"
    )


def test_collect_and_ingest_share_the_same_lock_file() -> None:
    collect_content = (DEPLOY_DIR / "moana-yatco-collect.service").read_text(encoding="utf-8")
    ingest_content = (DEPLOY_DIR / "moana-yatco-ingest.service").read_text(encoding="utf-8")

    collect_exec_start = re.search(r"^ExecStart=(.*)$", collect_content, re.MULTILINE).group(1)
    ingest_exec_start = re.search(r"^ExecStart=(.*)$", ingest_content, re.MULTILINE).group(1)

    assert SHARED_LOCK_PATH in collect_exec_start
    assert SHARED_LOCK_PATH in ingest_exec_start


def test_second_concurrent_launch_fails_immediately(tmp_path: Path) -> None:
    lock_path = tmp_path / "moana-yatco.lock"

    holder = subprocess.Popen(
        ["/usr/bin/flock", "-x", str(lock_path), "-c", "sleep 5"],
    )
    try:
        second = subprocess.run(
            ["/usr/bin/flock", "-n", str(lock_path), "-c", "echo second-cycle-ran"],
            capture_output=True,
            text=True,
            check=False,
            timeout=10,
        )
        assert second.returncode != 0, "le second lancement doit échouer immédiatement (flock -n)"
        assert "second-cycle-ran" not in second.stdout, "le second lancement ne doit produire aucun effet"
    finally:
        holder.wait(timeout=10)


def test_deploy_requires_ssh_key_and_is_idempotent(monkeypatch: pytest.MonkeyPatch) -> None:
    sys.path.insert(0, str(DEPLOY_DIR))
    import deploy  # import local différé pour patcher l'environnement au préalable

    monkeypatch.delenv("MOANA_SSH_KEY", raising=False)

    def unexpected_run(*args, **kwargs):  # pragma: no cover - ne doit jamais être appelé
        raise AssertionError("aucune commande ne doit être exécutée sans MOANA_SSH_KEY")

    with pytest.raises(deploy.ConfigurationError):
        deploy.apply_deploy(str(REPO_ROOT), deploy.Settings(), run=unexpected_run)

    assert "scripts/yatco_collector.py" in deploy.DEPLOY_ARTIFACTS, (
        "le collecteur doit être référencé parmi les artefacts déployés"
    )

    monkeypatch.setenv("MOANA_SSH_KEY", "fake-key-content")

    def record_success(command, timeout, capture_output, text, check):
        recorded.append(list(command))
        return subprocess.CompletedProcess(command, 0, stdout="", stderr="")

    settings = deploy.Settings()

    runs: list[list[list[str]]] = []
    for _ in range(2):
        recorded: list[list[str]] = []
        deploy.apply_deploy(str(REPO_ROOT), settings, run=record_success)
        runs.append(recorded)

    def normalize(run_commands: list[list[str]]) -> list[list[str]]:
        return [[arg for arg in cmd if arg != "-i" and not arg.startswith("/tmp/")] for cmd in run_commands]

    first_run, second_run = runs
    assert normalize(first_run) == normalize(second_run), (
        "deux déploiements successifs doivent produire les mêmes commandes (hors clé temporaire)"
    )

    scp_targets = [cmd[-1] for cmd in first_run if cmd[0] == "scp"]
    assert len(scp_targets) == len(set(scp_targets)) == len(deploy.DEPLOY_ARTIFACTS), (
        "chaque artefact, y compris scripts/yatco_collector.py, doit être transféré exactement une fois"
    )
    assert any(target.endswith("scripts/yatco_collector.py") for target in scp_targets)

    for path in DEPLOY_DIR.iterdir():
        if path.suffix != ".py":
            continue
        content = path.read_text(encoding="utf-8")
        assert not PRIVATE_KEY_PATTERN.search(content)
        for pattern in SECRET_PATTERNS:
            assert not pattern.search(content)


def test_collector_failure_blocks_worker() -> None:
    result = subprocess.run(
        ["bash", "-c", "false && echo worker-ran"],
        capture_output=True,
        text=True,
        check=False,
        timeout=10,
    )
    assert result.returncode != 0
    assert "worker-ran" not in result.stdout
