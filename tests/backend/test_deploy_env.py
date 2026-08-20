"""Tests déterministes de l'extension .env Compose de apply_deploy (plan T1 S2).

Isole apply_deploy du réseau et du déploiement réel : les commandes locales et
distantes sont simulées via le paramètre ``run``. Vérifie que
``NEXT_PUBLIC_SUPABASE_URL`` et ``SUPABASE_SERVICE_ROLE_KEY`` proviennent
exclusivement de ``os.environ``, que le fichier temporaire est en 0600 au format
KEY=VALUE, transféré vers ``~/moana/workers/docker/.env``, qu'aucune valeur ne
fuit et que le temporaire est supprimé après succès comme après échec du scp.
"""

from __future__ import annotations

import re
import stat
import subprocess
import sys
import tempfile
from pathlib import Path

import pytest

DEPLOY_DIR = Path(__file__).resolve().parent.parent.parent / "workers" / "deploy"
REPO_ROOT = DEPLOY_DIR.parent.parent

sys.path.insert(0, str(DEPLOY_DIR))
import deploy  # noqa: E402  (import différé après ajustement de sys.path)

FAKE_URL = "https://fake-project.supabase.co"
FAKE_SERVICE_KEY = "fake-service-role-jwt-token-value"
FAKE_SSH_KEY = "-----BEGIN TEST KEY-----sentinel-----END TEST KEY-----"

ENV_FILE_TEMP_PREFIX = "moana-deploy-env-"
KEY_FILE_TEMP_PREFIX = "moana-deploy-key-"


def _settings() -> deploy.Settings:
    return deploy.Settings(timeout_s=1.0, max_retries=0, backoff_base_s=0.1, backoff_cap_s=0.1)


def _ok_run(command, timeout, capture_output, text, check):
    return subprocess.CompletedProcess(command, 0, stdout="", stderr="")


def _set_fake_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MOANA_SSH_KEY", FAKE_SSH_KEY)
    monkeypatch.setenv("NEXT_PUBLIC_SUPABASE_URL", FAKE_URL)
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", FAKE_SERVICE_KEY)


def _temp_files() -> set[str]:
    """Chemins des temporaires moana encore présents dans <tmp> (sonde booléenne)."""
    tmp = tempfile.gettempdir()
    return {
        str(p)
        for p in (*Path(tmp).glob(f"{ENV_FILE_TEMP_PREFIX}*"), *Path(tmp).glob(f"{KEY_FILE_TEMP_PREFIX}*"))
    }


class _Recorder:
    """Simule ``run`` en capturant les commandes et le .env lors de son scp.

    Le cycle de trigger (S1) exige un ``ActiveEnterTimestamp``/``MainPID`` qui
    change réellement entre la capture pré- et post-``start``, et un
    ``is-failed`` dont le returncode SSH est strictement 0 : ce mock simule un
    état périmé avant ``sudo systemctl start`` puis un état frais et changé
    ensuite, pour rester un test valide du contrat .env sans se faire bloquer
    par le verdict du trigger.
    """

    def __init__(self) -> None:
        self.commands: list[list[str]] = []
        self.env_local_path: str | None = None
        self.env_content: str | None = None
        self.env_mode: int | None = None
        self.started = False

    def __call__(self, command, timeout, capture_output, text, check):
        self.commands.append(list(command))
        remote_cmd = command[-1] if command else ""
        if command[0] == "scp" and command[-1].endswith("workers/docker/.env"):
            self.env_local_path = command[-2]
            with open(self.env_local_path, encoding="utf-8") as fh:
                self.env_content = fh.read()
            self.env_mode = stat.S_IMODE(Path(self.env_local_path).stat().st_mode)
        if isinstance(remote_cmd, str) and remote_cmd.startswith("sudo systemctl start "):
            self.started = True
            return subprocess.CompletedProcess(command, 0, stdout="", stderr="")
        if isinstance(remote_cmd, str) and remote_cmd.startswith("systemctl show "):
            if self.started:
                return subprocess.CompletedProcess(
                    command, 0, stdout="ActiveEnterTimestamp=Wed 2026-08-19 18:00:00 UTC\nMainPID=1234\n", stderr=""
                )
            return subprocess.CompletedProcess(command, 0, stdout="ActiveEnterTimestamp=\nMainPID=0\n", stderr="")
        if isinstance(remote_cmd, str) and remote_cmd.startswith("systemctl is-failed "):
            return subprocess.CompletedProcess(command, 0, stdout="active\n", stderr="")
        return subprocess.CompletedProcess(command, 0, stdout="", stderr="")


def test_missing_env_values_fail_before_any_command(monkeypatch: pytest.MonkeyPatch) -> None:
    """Les valeurs ne proviennent d'aucun fichier : sans os.environ, on s'arrête."""
    monkeypatch.setenv("MOANA_SSH_KEY", FAKE_SSH_KEY)
    monkeypatch.delenv("NEXT_PUBLIC_SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)

    def unexpected_run(*args, **kwargs):  # pragma: no cover - ne doit jamais être appelé
        raise AssertionError("aucune commande ne doit être exécutée sans les valeurs Supabase")

    with pytest.raises(deploy.ConfigurationError) as excinfo:
        deploy.apply_deploy(str(REPO_ROOT), _settings(), run=unexpected_run)

    message = str(excinfo.value)
    assert "NEXT_PUBLIC_SUPABASE_URL" in message or "SUPABASE_SERVICE_ROLE_KEY" in message
    assert FAKE_URL not in message and FAKE_SERVICE_KEY not in message


def test_env_file_is_0600_key_value_and_scp_to_remote_dotenv(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _set_fake_env(monkeypatch)

    recorder = _Recorder()
    deploy.apply_deploy(str(REPO_ROOT), _settings(), run=recorder)

    assert recorder.env_local_path is not None, "le .env doit transiter par scp"
    assert recorder.env_local_path.startswith(tempfile.gettempdir())

    # Mode 0600 et format strictement KEY=VALUE, une ligne par variable.
    assert recorder.env_mode == 0o600
    assert recorder.env_content == (
        f"NEXT_PUBLIC_SUPABASE_URL={FAKE_URL}\n"
        f"SUPABASE_SERVICE_ROLE_KEY={FAKE_SERVICE_KEY}\n"
    )
    for line in recorder.env_content.splitlines():
        assert re.match(r"^[A-Z_]+=.*$", line), f"format KEY=VALUE attendu: {line!r}"

    # Destination distante exacte, sans exposer les valeurs dans les commandes.
    scp_env = [
        cmd for cmd in recorder.commands if cmd[0] == "scp" and cmd[-1].endswith("workers/docker/.env")
    ]
    assert len(scp_env) == 1
    assert scp_env[0][-1].endswith(deploy.ENV_FILE_REMOTE_PATH)
    for cmd in recorder.commands:
        assert all(FAKE_URL not in arg and FAKE_SERVICE_KEY not in arg for arg in cmd)


def test_temp_files_removed_after_success(monkeypatch: pytest.MonkeyPatch) -> None:
    _set_fake_env(monkeypatch)

    recorder = _Recorder()
    deploy.apply_deploy(str(REPO_ROOT), _settings(), run=recorder)

    assert recorder.env_local_path is not None
    assert not Path(recorder.env_local_path).exists(), "le .env temporaire doit être supprimé"
    assert _temp_files() == set(), "aucun temporaire moana (env ou clé) ne doit subsister"


def _failing_env_scp_run(command, timeout, capture_output, text, check):
    """Simule un échec scp (RC != 0) sur le .env uniquement, après avoir tenté la clé."""
    if command[0] == "scp" and command[-1].endswith("workers/docker/.env"):
        return subprocess.CompletedProcess(command, 1, stdout="", stderr="scp: permission denied")
    return subprocess.CompletedProcess(command, 0, stdout="", stderr="")


def test_temp_files_removed_when_env_scp_fails(monkeypatch: pytest.MonkeyPatch) -> None:
    _set_fake_env(monkeypatch)

    with pytest.raises(deploy.DeploymentError):
        deploy.apply_deploy(str(REPO_ROOT), _settings(), run=_failing_env_scp_run)

    # Aucun temporaire moana-deploy-* (ni .env, ni clé) ne doit subsister.
    assert _temp_files() == set()


def test_newline_in_value_rejected_without_creating_temp_file(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _set_fake_env(monkeypatch)
    poisoned = "line1\nline2"
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", poisoned)

    def unexpected_run(*args, **kwargs):  # pragma: no cover - ne doit jamais être appelé
        raise AssertionError("aucune commande ne doit partir avec une valeur invalide")

    with pytest.raises(deploy.ConfigurationError) as excinfo:
        deploy.apply_deploy(str(REPO_ROOT), _settings(), run=unexpected_run)

    assert "SUPABASE_SERVICE_ROLE_KEY" in str(excinfo.value)
    assert poisoned not in str(excinfo.value), "l'erreur ne doit pas exposer la valeur"
    assert _temp_files() == set(), "aucun fichier temporaire ne doit être créé"


def test_dry_run_plan_does_not_mention_env_secrets(monkeypatch: pytest.MonkeyPatch) -> None:
    """Le plan dry-run ne remplace pas le fichier .env ni les valeurs."""
    _set_fake_env(monkeypatch)
    plan = deploy.build_plan(str(REPO_ROOT))
    serialized = str(plan)
    assert ".env" not in serialized
    assert FAKE_URL not in serialized and FAKE_SERVICE_KEY not in serialized