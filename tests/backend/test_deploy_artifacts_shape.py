"""Test unitaire pur vérifiant la forme de DEPLOY_ARTIFACTS."""

from __future__ import annotations

import sys
from pathlib import Path

DEPLOY_DIR = Path(__file__).resolve().parent.parent.parent / "workers" / "deploy"
sys.path.insert(0, str(DEPLOY_DIR))

import deploy  # noqa: E402


def test_deploy_artifacts_is_nonempty_tuple_of_nonempty_strings() -> None:
    """Vérifie que DEPLOY_ARTIFACTS est un tuple non vide de chaînes non vides."""
    artifacts = deploy.DEPLOY_ARTIFACTS
    assert isinstance(artifacts, tuple), "DEPLOY_ARTIFACTS doit être un tuple"
    assert len(artifacts) > 0, "DEPLOY_ARTIFACTS ne doit pas être vide"
    for item in artifacts:
        assert isinstance(item, str), f"Chaque élément doit être une str, reçu: {type(item)}"
        assert len(item) > 0, "Chaque élément de DEPLOY_ARTIFACTS doit être une str non vide"
