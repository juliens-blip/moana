"""Remote, replayable smoke test for ``public.yatco_global_listings``.

Skipped unless ``YATCO_SMOKE_SSH_HOST``, ``YATCO_SMOKE_SSH_USER``,
``YATCO_SMOKE_SSH_KEY_FILE``, ``YATCO_SMOKE_SSH_PORT`` and ``SUPABASE_DB_URL``
are all set (and ``psql``/``ssh`` are on the PATH). ``remote_access_or_skip``
reads only these environment variables and calls ``pytest.skip`` before any
SSH or database subprocess is spawned when one is missing.

When access is available, the test proves the deployed host is reachable
over SSH within a bounded timeout, then writes one control row directly into
``public.yatco_global_listings`` (``source='pytest-smoke'``, a reserved key
that never collides with real listings), verifies it by exact id through a
plain SQL query -- not a time window, which cannot be attributed to a single
run with certainty under concurrent writes -- and deletes exactly that id in
a ``finally`` block, then re-queries by id to prove ``COUNT(*) = 0``. If the
parent table is missing, the test fails with an explicit message instead of
a confusing constraint or connection error.

No secret is ever logged: ``YATCO_SMOKE_SSH_KEY_FILE`` is a path already on
disk (never read into memory here), and the Postgres connection string only
ever travels through the subprocess environment as ``PG*`` variables, never
argv.
"""

from __future__ import annotations

import importlib.util
import os
import shutil
import subprocess
import uuid
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
APPLIER = REPO_ROOT / "supabase" / "apply_migration.py"

SSH_REACHABILITY_TIMEOUT_S = 30.0

REQUIRED_ENV_VARS = (
    "YATCO_SMOKE_SSH_HOST",
    "YATCO_SMOKE_SSH_USER",
    "YATCO_SMOKE_SSH_KEY_FILE",
    "YATCO_SMOKE_SSH_PORT",
    "SUPABASE_DB_URL",
)


def _read_remote_env() -> dict[str, str]:
    return {name: os.environ.get(name, "").strip() for name in REQUIRED_ENV_VARS}


def remote_access_or_skip() -> dict[str, str]:
    """Skip before any subprocess is spawned unless every access var and tool is present."""
    env = _read_remote_env()
    missing = [name for name, value in env.items() if not value]
    if missing:
        pytest.skip(f"missing required env vars: {', '.join(missing)}")
    if shutil.which("psql") is None:
        pytest.skip("psql is not installed")
    if shutil.which("ssh") is None:
        pytest.skip("ssh is not installed")
    if not Path(env["YATCO_SMOKE_SSH_KEY_FILE"]).is_file():
        pytest.skip(f"YATCO_SMOKE_SSH_KEY_FILE not found: {env['YATCO_SMOKE_SSH_KEY_FILE']}")
    return env


@pytest.fixture
def remote_env() -> dict[str, str]:
    return remote_access_or_skip()


def _load_applier():
    spec = importlib.util.spec_from_file_location("moana_apply_migration_smoke_v2", APPLIER)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _psql(database_url: str, sql: str) -> subprocess.CompletedProcess[str]:
    applier = _load_applier()
    env = {**os.environ, **applier.split_database_url(database_url)}
    return subprocess.run(
        [
            "psql",
            "--no-psqlrc",
            "--quiet",
            "--tuples-only",
            "--no-align",
            "--set=ON_ERROR_STOP=1",
            "--command",
            sql,
        ],
        env=env,
        capture_output=True,
        text=True,
        timeout=60,
        check=False,
    )


def _assert_target_table_exists(database_url: str) -> None:
    """Fail clearly if the parent table is missing, instead of a confusing insert error."""
    result = _psql(database_url, "SELECT to_regclass('public.yatco_global_listings')")
    assert result.returncode == 0, result.stderr[-2000:]
    assert "yatco_global_listings" in result.stdout, (
        "public.yatco_global_listings is missing; apply the YATCO migration first"
    )


def _assert_remote_host_reachable(host: str, user: str, key_file: str, port: str) -> None:
    """Bounded-timeout SSH reachability check against the caller-supplied target."""
    ssh_opts = [
        "-i",
        key_file,
        "-p",
        port,
        "-o",
        "StrictHostKeyChecking=accept-new",
        "-o",
        "BatchMode=yes",
    ]
    result = subprocess.run(
        ["ssh", *ssh_opts, f"{user}@{host}", "true"],
        capture_output=True,
        text=True,
        timeout=SSH_REACHABILITY_TIMEOUT_S,
        check=False,
    )
    assert result.returncode == 0, (
        f"remote host {host}:{port} unreachable over SSH (exit {result.returncode})"
    )


def _insert_control_row(database_url: str, marker: str) -> str:
    """Minimal INSERT under the reserved 'pytest-smoke' source; returns the row id."""
    assert marker.replace("-", "").isalnum(), "control marker must stay quote-free"
    insert = (
        "INSERT INTO public.yatco_global_listings (source, external_id) "
        f"VALUES ('pytest-smoke', '{marker}') RETURNING id"
    )
    result = _psql(database_url, insert)
    assert result.returncode == 0, result.stderr[-2000:]
    row_id = result.stdout.strip()
    assert row_id, "INSERT ... RETURNING id produced no id"
    return row_id


def _control_row_count(database_url: str, row_id: str) -> int:
    """Independent SQL count filtered strictly by id -- never a time window."""
    result = _psql(
        database_url,
        f"SELECT count(*) FROM public.yatco_global_listings WHERE id = '{row_id}'",
    )
    assert result.returncode == 0, result.stderr[-2000:]
    return int(result.stdout.strip())


def _delete_control_row(database_url: str, row_id: str) -> None:
    """Bounded, filtered cleanup: only the exact id captured by this run's INSERT."""
    result = _psql(
        database_url,
        f"DELETE FROM public.yatco_global_listings WHERE id = '{row_id}'",
    )
    assert result.returncode == 0, result.stderr[-2000:]


def test_remote_yatco_global_listings_smoke(remote_env: dict[str, str]) -> None:
    database_url = remote_env["SUPABASE_DB_URL"]
    _assert_target_table_exists(database_url)
    _assert_remote_host_reachable(
        remote_env["YATCO_SMOKE_SSH_HOST"],
        remote_env["YATCO_SMOKE_SSH_USER"],
        remote_env["YATCO_SMOKE_SSH_KEY_FILE"],
        remote_env["YATCO_SMOKE_SSH_PORT"],
    )

    marker = f"pytest-smoke-{uuid.uuid4().hex}"
    row_id = _insert_control_row(database_url, marker)
    try:
        assert _control_row_count(database_url, row_id) == 1, (
            "control row not visible via SQL after insert"
        )
    finally:
        _delete_control_row(database_url, row_id)
        assert _control_row_count(database_url, row_id) == 0, (
            "control row survived cleanup"
        )
