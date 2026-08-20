"""Tests déterministes du contrôle check/dry-run (plan.json S1/S3).

Simule l'environnement, SSH et la découverte des unités : aucune clé réelle,
aucun accès réseau. Vérifie qu'aucune sortie ne contient la valeur de la clé
ou un secret simulé.
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

import pytest

DEPLOY_DIR = Path(__file__).resolve().parent.parent.parent / "workers" / "deploy"
REPO_ROOT = DEPLOY_DIR.parent.parent

sys.path.insert(0, str(DEPLOY_DIR))
import deploy  # noqa: E402  (import différé après ajustement de sys.path)

FAKE_KEY_SENTINEL = "fakefakefake"
# Clé factice pour les tests : jamais un secret réel, fournie exclusivement via
# l'environnement (MOANA_TEST_FAKE_SSH_KEY, injectée par conftest.py). Aucune
# valeur ressemblant à une clé privée n'est codée en dur dans ce fichier.
FAKE_KEY = os.environ["MOANA_TEST_FAKE_SSH_KEY"]
assert FAKE_KEY_SENTINEL in FAKE_KEY


def _settings() -> deploy.Settings:
    return deploy.Settings(timeout_s=1.0, max_retries=0, backoff_base_s=0.1, backoff_cap_s=0.1)


def _ok_run(command, timeout, capture_output, text, check):
    return subprocess.CompletedProcess(command, 0, stdout="", stderr="")


def _refused_run(command, timeout, capture_output, text, check):
    return subprocess.CompletedProcess(command, 255, stdout="", stderr="Connection refused")


def test_missing_key_fails_without_ssh_or_unit_checks(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("MOANA_SSH_KEY", raising=False)

    def unexpected_run(*args, **kwargs):  # pragma: no cover - ne doit jamais être appelé
        raise AssertionError("aucune connexion SSH ne doit être tentée sans clé")

    code, report = deploy.run_check(str(REPO_ROOT), _settings(), run=unexpected_run)

    assert code == 1
    assert report["ok"] is False
    assert report["failed_check"] == "ssh_key"


def test_unusable_key_fails_before_ssh_attempt(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MOANA_SSH_KEY", "not-a-private-key")

    def unexpected_run(*args, **kwargs):  # pragma: no cover
        raise AssertionError("aucune connexion SSH ne doit être tentée avec une clé inutilisable")

    code, report = deploy.run_check(str(REPO_ROOT), _settings(), run=unexpected_run)

    assert code == 1
    assert report["ok"] is False
    assert report["failed_check"] == "ssh_key"


def test_ssh_connection_refused_fails(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MOANA_SSH_KEY", FAKE_KEY)

    code, report = deploy.run_check(str(REPO_ROOT), _settings(), run=_refused_run)

    assert code == 1
    assert report["ok"] is False
    assert report["failed_check"] == "ssh_connection"


def test_incomplete_units_fail_after_successful_ssh(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setenv("MOANA_SSH_KEY", FAKE_KEY)
    (tmp_path / "workers" / "deploy").mkdir(parents=True)
    (tmp_path / "workers" / "deploy" / "moana-yatco-collect.service").write_text("x")

    code, report = deploy.run_check(str(tmp_path), _settings(), run=_ok_run)

    assert code == 1
    assert report["ok"] is False
    assert report["failed_check"] == "systemd_units"


def test_full_success_reports_all_three_units(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MOANA_SSH_KEY", FAKE_KEY)

    code, report = deploy.run_check(str(REPO_ROOT), _settings(), run=_ok_run)

    assert code == 0
    assert report["ok"] is True
    assert set(report["systemd_units"]) == set(deploy.REQUIRED_UNITS)


@pytest.mark.parametrize(
    "monkeypatch_env,run_fn",
    [
        (None, _refused_run),
        (FAKE_KEY, _ok_run),
    ],
)
def test_no_output_leaks_key_value_or_simulated_secret(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture, monkeypatch_env, run_fn
) -> None:
    if monkeypatch_env is None:
        monkeypatch.delenv("MOANA_SSH_KEY", raising=False)
    else:
        monkeypatch.setenv("MOANA_SSH_KEY", monkeypatch_env)

    code, report = deploy.run_check(str(REPO_ROOT), _settings(), run=run_fn)

    serialized = repr(report)
    assert FAKE_KEY_SENTINEL not in serialized
    assert FAKE_KEY not in serialized


def test_cli_check_subcommand_never_prints_key_value(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MOANA_SSH_KEY", "not-a-private-key")
    result = subprocess.run(
        [sys.executable, str(DEPLOY_DIR / "deploy.py"), "check", "--repo-root", str(REPO_ROOT)],
        capture_output=True,
        text=True,
        check=False,
        timeout=30,
        env={**__import__("os").environ, "MOANA_SSH_KEY": "not-a-private-key"},
    )
    assert result.returncode == 1
    assert "not-a-private-key" not in result.stdout
    assert "not-a-private-key" not in result.stderr
