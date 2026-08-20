"""Injecte les valeurs factices requises par la suite de tests backend.

Fournit MOANA_TEST_FAKE_SSH_KEY par défaut pour les tests de préflight du
déploiement (test_deploy_preflight.py) : jamais un secret réel, uniquement une
forme structurellement valide pour deploy.looks_like_private_key.
"""

from __future__ import annotations

import os

_FAKE_KEY_SENTINEL = "fakefakefake"
_FAKE_KEY_DEFAULT = "\n".join(
    (
        "-----BEGIN OPENSSH PRIVATE KEY-----",
        _FAKE_KEY_SENTINEL,
        "-----END OPENSSH PRIVATE KEY-----",
        "",
    )
)

os.environ.setdefault("MOANA_TEST_FAKE_SSH_KEY", _FAKE_KEY_DEFAULT)
