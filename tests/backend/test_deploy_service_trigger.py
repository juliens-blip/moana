"""Tests déterministes du déclenchement post-relais (.env) et du verdict frais
du service systemd moana-yatco-ingest (plan T1 : capture avant/après trigger,
reset-failed -> start -> is-failed).

Isole apply_deploy du réseau : subprocess, SSH et fichiers temporaires sont
simulés via le paramètre ``run``. Vérifie que l'état (InvocationID,
ExecMainStartTimestamp) est capturé avant tout déclenchement puis de nouveau après, qu'un
état inchangé bloque le verdict, qu'un returncode SSH non nul sur la sonde
is-failed est rejeté indépendamment de son stdout, que seul
moana-yatco-ingest.service est visé par le cycle, et qu'aucun secret (clé SSH,
valeurs .env) ne fuit dans les commandes ou les messages d'erreur.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

import pytest

DEPLOY_DIR = Path(__file__).resolve().parent.parent.parent / "workers" / "deploy"
REPO_ROOT = DEPLOY_DIR.parent.parent

sys.path.insert(0, str(DEPLOY_DIR))
import deploy  # noqa: E402  (import différé après ajustement de sys.path)

FAKE_URL = "https://fake-project.supabase.co"
FAKE_SERVICE_KEY = "fake-service-role-jwt-token-value"
FAKE_SSH_KEY = "-----BEGIN TEST KEY-----sentinel-----END TEST KEY-----"

TARGET_UNIT = "moana-yatco-ingest.service"
SHOW_CMD = f"systemctl show {TARGET_UNIT} --property=InvocationID,ExecMainStartTimestamp"
IS_FAILED_CMD = f"systemctl is-failed {TARGET_UNIT}"
RESET_CMD = f"sudo systemctl reset-failed {TARGET_UNIT}"
START_CMD = f"sudo systemctl start {TARGET_UNIT}"

STALE_STATE = "InvocationID=11111111-1111-1111-1111-111111111111\nExecMainStartTimestamp=Wed 2026-08-19 10:00:00 UTC\n"
FRESH_STATE = "InvocationID=22222222-2222-2222-2222-222222222222\nExecMainStartTimestamp=Wed 2026-08-19 18:00:00 UTC\n"


def _settings() -> deploy.Settings:
    return deploy.Settings(timeout_s=1.0, max_retries=0, backoff_base_s=0.1, backoff_cap_s=0.1)


def _set_fake_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MOANA_SSH_KEY", FAKE_SSH_KEY)
    monkeypatch.setenv("NEXT_PUBLIC_SUPABASE_URL", FAKE_URL)
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", FAKE_SERVICE_KEY)


def _ok(command, returncode: int = 0, stdout: str = "", stderr: str = "") -> subprocess.CompletedProcess:
    return subprocess.CompletedProcess(command, returncode, stdout=stdout, stderr=stderr)


class _FreshStateRecorder:
    """Simule un état "failed" résiduel qui ne redevient sain qu'après ``start``.

    La première sonde ``systemctl show`` (avant tout déclenchement) renvoie un
    état périmé (stale) ; la seconde (après ``start``) renvoie un état frais et
    changé. ``is-failed`` ne redevient "active" qu'une fois ``start`` exécuté.
    """

    def __init__(self) -> None:
        self.commands: list[list[str]] = []
        self.reset_done = False
        self.started = False
        self.show_calls = 0

    def __call__(self, command, timeout, capture_output, text, check):
        self.commands.append(list(command))
        remote_cmd = command[-1] if command else ""
        if remote_cmd == RESET_CMD:
            self.reset_done = True
            return _ok(command)
        if remote_cmd == START_CMD:
            assert self.reset_done, "start doit suivre reset-failed"
            self.started = True
            return _ok(command)
        if remote_cmd == SHOW_CMD:
            self.show_calls += 1
            if self.started:
                return _ok(command, stdout=FRESH_STATE)
            return _ok(command, stdout=STALE_STATE)
        if remote_cmd == IS_FAILED_CMD:
            if self.started:
                return _ok(command, returncode=0, stdout="active\n")
            return _ok(command, returncode=1, stdout="failed\n")
        return _ok(command)


def test_reset_failed_precedes_start_precedes_is_failed(monkeypatch: pytest.MonkeyPatch) -> None:
    _set_fake_env(monkeypatch)
    recorder = _FreshStateRecorder()

    deploy.apply_deploy(str(REPO_ROOT), _settings(), run=recorder)

    remote_cmds = [cmd[-1] for cmd in recorder.commands if cmd and isinstance(cmd[-1], str)]
    reset_idx = remote_cmds.index(RESET_CMD)
    start_idx = remote_cmds.index(START_CMD)
    is_failed_idx = remote_cmds.index(IS_FAILED_CMD)
    assert reset_idx < start_idx < is_failed_idx
    assert recorder.show_calls == 2, "l'état doit être capturé avant et après le trigger"


def test_only_ingest_service_is_targeted(monkeypatch: pytest.MonkeyPatch) -> None:
    """apply_deploy ne doit piloter que moana-yatco-ingest.service dans le cycle trigger/verdict."""
    _set_fake_env(monkeypatch)
    recorder = _FreshStateRecorder()

    deploy.apply_deploy(str(REPO_ROOT), _settings(), run=recorder)

    trigger_cmds = [
        cmd[-1]
        for cmd in recorder.commands
        if cmd
        and isinstance(cmd[-1], str)
        and (
            cmd[-1].startswith("sudo systemctl reset-failed ")
            or cmd[-1].startswith("sudo systemctl start ")
            or cmd[-1].startswith("systemctl show ")
            or cmd[-1].startswith("systemctl is-failed ")
        )
    ]
    assert trigger_cmds, "les commandes de déclenchement doivent avoir été émises"
    assert all("moana-yatco-collect.service" not in cmd for cmd in trigger_cmds)
    assert all(TARGET_UNIT in cmd for cmd in trigger_cmds)


def test_unchanged_state_after_trigger_blocks_verdict(monkeypatch: pytest.MonkeyPatch) -> None:
    """Si InvocationID/ExecMainStartTimestamp sont identiques avant et après, le verdict doit échouer."""
    _set_fake_env(monkeypatch)

    def unchanged_state_run(command, timeout, capture_output, text, check):
        remote_cmd = command[-1] if command else ""
        if remote_cmd == SHOW_CMD:
            return _ok(command, stdout=FRESH_STATE)
        if remote_cmd == IS_FAILED_CMD:
            return _ok(command, returncode=1, stdout="active\n")
        return _ok(command)

    with pytest.raises(deploy.DeploymentError) as excinfo:
        deploy.apply_deploy(str(REPO_ROOT), _settings(), run=unchanged_state_run)

    message = str(excinfo.value)
    assert TARGET_UNIT in message
    assert "did not change" in message.lower()


def test_is_failed_still_fails_deployment_on_post_trigger_failure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _set_fake_env(monkeypatch)
    recorder = _FreshStateRecorder()

    def always_failed_run(command, timeout, capture_output, text, check):
        remote_cmd = command[-1] if command else ""
        if remote_cmd == SHOW_CMD:
            recorder.show_calls += 1
            return _ok(command, stdout=STALE_STATE if recorder.show_calls == 1 else FRESH_STATE)
        if remote_cmd == IS_FAILED_CMD:
            return _ok(command, returncode=0, stdout="failed\n")
        if remote_cmd == f"sudo systemctl status --no-pager {TARGET_UNIT}":
            return _ok(command, stdout="Active: failed (Result: exit-code)\n")
        if remote_cmd == f"sudo journalctl -u {TARGET_UNIT} -n 80 --no-pager":
            return _ok(command, stdout="fatal: worker crashed\n")
        return _ok(command)

    with pytest.raises(deploy.DeploymentError) as excinfo:
        deploy.apply_deploy(str(REPO_ROOT), _settings(), run=always_failed_run)

    message = str(excinfo.value)
    assert TARGET_UNIT in message
    assert "fatal: worker crashed" in message, "le diagnostic status/journalctl doit rester dans l'erreur"
    assert FAKE_SSH_KEY not in message
    assert FAKE_URL not in message and FAKE_SERVICE_KEY not in message


def test_trigger_uses_key_file_via_dash_i_option(monkeypatch: pytest.MonkeyPatch) -> None:
    """reset-failed/start/is-failed doivent réutiliser la sonde SSH existante (-i <fichier 0600>)."""
    _set_fake_env(monkeypatch)
    recorder = _FreshStateRecorder()

    deploy.apply_deploy(str(REPO_ROOT), _settings(), run=recorder)

    trigger_suffixes = (RESET_CMD, START_CMD, IS_FAILED_CMD)
    trigger_commands = [cmd for cmd in recorder.commands if cmd and cmd[-1] in trigger_suffixes]
    assert trigger_commands, "les commandes de déclenchement doivent avoir été émises"
    for cmd in trigger_commands:
        assert cmd[0] == "ssh"
        assert "-i" in cmd
        key_path = cmd[cmd.index("-i") + 1]
        assert key_path.startswith(__import__("tempfile").gettempdir())


def test_no_secret_leaks_across_trigger_commands_or_errors(monkeypatch: pytest.MonkeyPatch) -> None:
    _set_fake_env(monkeypatch)

    def failing_run(command, timeout, capture_output, text, check):
        remote_cmd = command[-1] if command else ""
        if remote_cmd == SHOW_CMD:
            return _ok(command, stdout=FRESH_STATE)
        if remote_cmd == IS_FAILED_CMD:
            return _ok(command, returncode=0, stdout="failed\n")
        return _ok(command)

    with pytest.raises(deploy.DeploymentError) as excinfo:
        deploy.apply_deploy(str(REPO_ROOT), _settings(), run=failing_run)

    message = str(excinfo.value)
    assert FAKE_SSH_KEY not in message
    assert FAKE_URL not in message and FAKE_SERVICE_KEY not in message


def test_missing_fresh_timestamp_and_pid_blocks_verdict(monkeypatch: pytest.MonkeyPatch) -> None:
    """Sans InvocationID/ExecMainStartTimestamp frais après start, le service n'est jamais déclaré sain."""
    _set_fake_env(monkeypatch)

    def no_fresh_state_run(command, timeout, capture_output, text, check):
        remote_cmd = command[-1] if command else ""
        if remote_cmd == SHOW_CMD:
            return _ok(command, stdout="InvocationID=\nExecMainStartTimestamp=\n")
        if remote_cmd == IS_FAILED_CMD:
            # Même si is-failed répondait "active", l'absence de preuve fraîche doit bloquer.
            return _ok(command, returncode=1, stdout="active\n")
        return _ok(command)

    with pytest.raises(deploy.DeploymentError) as excinfo:
        deploy.apply_deploy(str(REPO_ROOT), _settings(), run=no_fresh_state_run)

    assert TARGET_UNIT in str(excinfo.value)
    assert "invocationid" in str(excinfo.value).lower() or "timestamp" in str(excinfo.value).lower() or "pid" in str(excinfo.value).lower()


def test_nonzero_ssh_returncode_fails_even_with_recognized_stdout(monkeypatch: pytest.MonkeyPatch) -> None:
    """Un returncode SSH non standard (ni 0 ni 1) doit échouer même si stdout ressemble à un état connu."""
    _set_fake_env(monkeypatch)
    recorder = _FreshStateRecorder()

    def broken_ssh_probe_run(command, timeout, capture_output, text, check):
        remote_cmd = command[-1] if command else ""
        if remote_cmd == SHOW_CMD:
            recorder.show_calls += 1
            return _ok(command, stdout=STALE_STATE if recorder.show_calls == 1 else FRESH_STATE)
        if remote_cmd == IS_FAILED_CMD:
            # Connexion SSH rompue : stdout ressemble à "active", mais le returncode est non standard.
            return _ok(command, returncode=255, stdout="active\n", stderr="ssh: connection reset by peer")
        return _ok(command)

    with pytest.raises(deploy.DeploymentError) as excinfo:
        deploy.apply_deploy(str(REPO_ROOT), _settings(), run=broken_ssh_probe_run)

    message = str(excinfo.value)
    assert TARGET_UNIT in message
    assert "returncode" in message.lower()


def test_returncode_one_on_is_failed_fails_even_with_active_stdout(monkeypatch: pytest.MonkeyPatch) -> None:
    """Le plan exige de rejeter TOUT returncode SSH non standard (hors 0 et 1) avant le parsing du stdout,
    y compris rc=255 dont le stdout ressemble à un état sain ("active\n")."""
    _set_fake_env(monkeypatch)
    recorder = _FreshStateRecorder()

    def rc_one_with_active_stdout_run(command, timeout, capture_output, text, check):
        remote_cmd = command[-1] if command else ""
        if remote_cmd == SHOW_CMD:
            recorder.show_calls += 1
            return _ok(command, stdout=STALE_STATE if recorder.show_calls == 1 else FRESH_STATE)
        if remote_cmd == IS_FAILED_CMD:
            return _ok(command, returncode=255, stdout="active\n")
        return _ok(command)

    with pytest.raises(deploy.DeploymentError) as excinfo:
        deploy.apply_deploy(str(REPO_ROOT), _settings(), run=rc_one_with_active_stdout_run)

    message = str(excinfo.value)
    assert TARGET_UNIT in message
    assert "returncode" in message.lower()


def test_inconclusive_is_failed_stdout_is_treated_as_failure(monkeypatch: pytest.MonkeyPatch) -> None:
    """Un stdout vide/inattendu, même avec un returncode nul (SSH exécuté avec succès),
    ne doit jamais valoir succès : le parsing du verdict reste une deuxième barrière."""
    _set_fake_env(monkeypatch)
    recorder = _FreshStateRecorder()

    def blank_stdout_run(command, timeout, capture_output, text, check):
        remote_cmd = command[-1] if command else ""
        if remote_cmd == SHOW_CMD:
            recorder.show_calls += 1
            return _ok(command, stdout=STALE_STATE if recorder.show_calls == 1 else FRESH_STATE)
        if remote_cmd == IS_FAILED_CMD:
            return _ok(command, returncode=0, stdout="")
        return _ok(command)

    with pytest.raises(deploy.DeploymentError) as excinfo:
        deploy.apply_deploy(str(REPO_ROOT), _settings(), run=blank_stdout_run)

    assert TARGET_UNIT in str(excinfo.value)


def test_diagnosis_redacts_secrets_found_in_remote_output(monkeypatch: pytest.MonkeyPatch) -> None:
    """Si status/journalctl recopient accidentellement un secret, le message d'erreur doit l'assainir."""
    _set_fake_env(monkeypatch)
    recorder = _FreshStateRecorder()

    def leaking_diagnosis_run(command, timeout, capture_output, text, check):
        remote_cmd = command[-1] if command else ""
        if remote_cmd == SHOW_CMD:
            recorder.show_calls += 1
            return _ok(command, stdout=STALE_STATE if recorder.show_calls == 1 else FRESH_STATE)
        if remote_cmd == IS_FAILED_CMD:
            return _ok(command, returncode=0, stdout="failed\n")
        if remote_cmd == f"sudo systemctl status --no-pager {TARGET_UNIT}":
            return _ok(command, stdout=f"env dump leaked: {FAKE_SERVICE_KEY}\n")
        if remote_cmd == f"sudo journalctl -u {TARGET_UNIT} -n 80 --no-pager":
            return _ok(command, stdout=f"used key: {FAKE_SSH_KEY}\n")
        return _ok(command)

    with pytest.raises(deploy.DeploymentError) as excinfo:
        deploy.apply_deploy(str(REPO_ROOT), _settings(), run=leaking_diagnosis_run)

    message = str(excinfo.value)
    assert FAKE_SERVICE_KEY not in message
    assert FAKE_SSH_KEY not in message
    assert "[REDACTED]" in message


def test_repeated_trigger_is_idempotent(monkeypatch: pytest.MonkeyPatch) -> None:
    """Deux exécutions successives du même cycle reset-failed/start/is-failed réussissent identiquement."""
    _set_fake_env(monkeypatch)

    first = _FreshStateRecorder()
    deploy.apply_deploy(str(REPO_ROOT), _settings(), run=first)

    second = _FreshStateRecorder()
    deploy.apply_deploy(str(REPO_ROOT), _settings(), run=second)

    first_shape = [cmd[-1] for cmd in first.commands if cmd]
    second_shape = [cmd[-1] for cmd in second.commands if cmd]
    assert first_shape == second_shape
