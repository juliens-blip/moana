"""Remote smoke test for the YATCO Global pipeline.

Skipped unless ``MOANA_SSH_KEY``, ``SUPABASE_URL``, ``SUPABASE_SERVICE_ROLE_KEY``
and ``SUPABASE_DB_URL`` are all set (and ``psql``/``ssh`` are on the PATH).
``remote_access_or_skip`` reads the environment and calls ``pytest.skip``
before any SSH or database subprocess is spawned when a variable is missing.

When access is available, the test triggers the canonical remote pipeline
via SSH (``systemctl start moana-yatco-ingest.service``, which chains
through the collect unit -- see workers/deploy/moana-yatco-ingest.service),
captures exactly the row ids that cycle produced by diffing an id snapshot
taken before and after the run, verifies each is genuinely persisted through
the Supabase REST API, and deletes exactly those captured ids in a
``finally`` block -- never a ``created_at`` time window, which cannot be
attributed to a single run with certainty under concurrent writes.

No secret is ever logged: the SSH private key lives in a 0600 temp file
removed in ``finally``, the connection string only ever travels through the
subprocess environment as ``PG*`` variables (never argv), and the Supabase
service role key only ever travels in request headers built at call time.
"""

from __future__ import annotations

import importlib.util
import json
import os
import shutil
import subprocess
import tempfile
import urllib.error
import urllib.request
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
APPLIER = REPO_ROOT / "supabase" / "apply_migration.py"

REMOTE_USER = "ubuntu"
REMOTE_HOST = "51.44.220.145"
SSH_REACHABILITY_TIMEOUT_S = 30.0
INGEST_UNIT = "moana-yatco-ingest.service"
# Bounds the canonical collect->ingest chain: collect's TimeoutStartSec=600 +
# ingest's TimeoutStartSec=1200 (workers/deploy/moana-yatco-*.service), plus margin.
INGEST_CYCLE_TIMEOUT_S = 2000.0

REQUIRED_ENV_VARS = (
    "MOANA_SSH_KEY",
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
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
    return env


@pytest.fixture
def remote_env() -> dict[str, str]:
    return remote_access_or_skip()


def _load_applier():
    spec = importlib.util.spec_from_file_location("moana_apply_migration_smoke", APPLIER)
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
    """Fail clearly if the parent table is missing, instead of a confusing REST 404."""
    result = _psql(database_url, "SELECT to_regclass('public.yatco_global_listings')")
    assert result.returncode == 0, result.stderr[-2000:]
    assert "yatco_global_listings" in result.stdout, (
        "public.yatco_global_listings is missing; apply the YATCO migration first"
    )


def _write_ssh_key(key_content: str) -> str:
    fd, path = tempfile.mkstemp(prefix="moana-smoke-key-")
    os.chmod(path, 0o600)
    with os.fdopen(fd, "w") as fh:
        fh.write(key_content if key_content.endswith("\n") else key_content + "\n")
    return path


def _assert_remote_host_reachable(ssh_key: str) -> None:
    """Bounded-timeout SSH reachability check; never leaks the key on failure."""
    key_path = _write_ssh_key(ssh_key)
    try:
        ssh_target = f"{REMOTE_USER}@{REMOTE_HOST}"
        ssh_opts = [
            "-i",
            key_path,
            "-o",
            "StrictHostKeyChecking=accept-new",
            "-o",
            "BatchMode=yes",
        ]
        result = subprocess.run(
            ["ssh", *ssh_opts, ssh_target, "true"],
            capture_output=True,
            text=True,
            timeout=SSH_REACHABILITY_TIMEOUT_S,
            check=False,
        )
    finally:
        os.remove(key_path)
    assert ssh_key not in (result.stdout + result.stderr)
    assert result.returncode == 0, (
        f"remote host {REMOTE_HOST} unreachable over SSH (exit {result.returncode})"
    )


def _trigger_ingest_cycle(ssh_key: str) -> None:
    """Runs the canonical remote pipeline: ``systemctl start`` on the oneshot
    ingest unit, which ``Requires=`` (and therefore chains through) the collect
    unit -- see workers/deploy/moana-yatco-ingest.service. ``systemctl start``
    on a oneshot unit blocks until the unit finishes, so this only returns once
    collection and ingestion have actually run.
    """
    key_path = _write_ssh_key(ssh_key)
    try:
        ssh_target = f"{REMOTE_USER}@{REMOTE_HOST}"
        ssh_opts = [
            "-i",
            key_path,
            "-o",
            "StrictHostKeyChecking=accept-new",
            "-o",
            "BatchMode=yes",
        ]
        result = subprocess.run(
            ["ssh", *ssh_opts, ssh_target, "sudo", "systemctl", "start", INGEST_UNIT],
            capture_output=True,
            text=True,
            timeout=INGEST_CYCLE_TIMEOUT_S,
            check=False,
        )
    finally:
        os.remove(key_path)
    assert ssh_key not in (result.stdout + result.stderr)
    assert result.returncode == 0, (
        f"{INGEST_UNIT} failed on {REMOTE_HOST} (exit {result.returncode}): "
        f"{result.stderr[-2000:]}"
    )


def _rest_headers(service_role_key: str) -> dict[str, str]:
    return {
        "apikey": service_role_key,
        "Authorization": f"Bearer {service_role_key}",
        "Content-Type": "application/json",
    }


def _fetch_all_ids(supabase_url: str, service_role_key: str) -> set[str]:
    """Snapshot of every row id currently in the table -- the controlled marker
    used to isolate exactly what a single ingest cycle produces: everything
    present after the run that was absent from the snapshot taken before it.
    """
    url = f"{supabase_url}/rest/v1/yatco_global_listings?select=id"
    request = urllib.request.Request(
        url, headers=_rest_headers(service_role_key), method="GET"
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            body = response.read()
    except urllib.error.HTTPError as exc:
        raise AssertionError(f"id snapshot failed: HTTP {exc.code}") from exc
    return {row["id"] for row in json.loads(body)}


def _row_exists_via_rest(supabase_url: str, service_role_key: str, row_id: str) -> bool:
    url = f"{supabase_url}/rest/v1/yatco_global_listings?select=id&id=eq.{row_id}"
    request = urllib.request.Request(
        url, headers=_rest_headers(service_role_key), method="GET"
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            body = response.read()
    except urllib.error.HTTPError as exc:
        raise AssertionError(f"control row lookup failed: HTTP {exc.code}") from exc
    rows = json.loads(body) if body else []
    return len(rows) == 1


def _delete_control_row(supabase_url: str, service_role_key: str, row_id: str) -> None:
    """Bounded, filtered cleanup: only the exact id captured by this run's INSERT."""
    url = f"{supabase_url}/rest/v1/yatco_global_listings?id=eq.{row_id}"
    request = urllib.request.Request(
        url,
        headers={**_rest_headers(service_role_key), "Prefer": "return=representation"},
        method="DELETE",
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            response.read()
    except urllib.error.HTTPError as exc:
        raise AssertionError(f"cleanup delete failed: HTTP {exc.code}") from exc


def _run_ingest_cycle_and_cleanup(env: dict[str, str]) -> set[str]:
    """One full remote-ingest lifecycle: snapshot ids, trigger the real
    moana-yatco-ingest.service cycle, verify the ids it actually produced via
    REST, then delete exactly those captured ids in finally. Never a
    ``created_at`` time window, which cannot be attributed to a single run
    with certainty under concurrent writes.
    """
    before_ids = _fetch_all_ids(env["SUPABASE_URL"], env["SUPABASE_SERVICE_ROLE_KEY"])
    _trigger_ingest_cycle(env["MOANA_SSH_KEY"])
    after_ids = _fetch_all_ids(env["SUPABASE_URL"], env["SUPABASE_SERVICE_ROLE_KEY"])
    new_ids = after_ids - before_ids
    assert new_ids, f"{INGEST_UNIT} ran but produced no new rows to verify"
    try:
        for row_id in new_ids:
            assert _row_exists_via_rest(
                env["SUPABASE_URL"], env["SUPABASE_SERVICE_ROLE_KEY"], row_id
            ), f"row {row_id} produced by this cycle is not visible via REST"
    finally:
        for row_id in new_ids:
            _delete_control_row(env["SUPABASE_URL"], env["SUPABASE_SERVICE_ROLE_KEY"], row_id)
    for row_id in new_ids:
        assert not _row_exists_via_rest(
            env["SUPABASE_URL"], env["SUPABASE_SERVICE_ROLE_KEY"], row_id
        ), f"row {row_id} survived cleanup"
    return new_ids


def test_yatco_remote_write_and_cleanup(remote_env: dict[str, str]) -> None:
    _assert_target_table_exists(remote_env["SUPABASE_DB_URL"])
    _assert_remote_host_reachable(remote_env["MOANA_SSH_KEY"])
    _run_ingest_cycle_and_cleanup(remote_env)


def test_remote_smoke_replay_contract(
    remote_env: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    # Skip contract: any missing var must skip before touching SSH or the database.
    monkeypatch.delenv("SUPABASE_DB_URL", raising=False)
    with pytest.raises(pytest.skip.Exception):
        remote_access_or_skip()
    monkeypatch.undo()

    # Immediate replay: two independent cycles, each snapshotting its own
    # baseline, neither depending on state left by the other or by a previous
    # run -- the prior cycle's cleanup makes the second run's ids fresh again.
    first_ids = _run_ingest_cycle_and_cleanup(remote_env)
    second_ids = _run_ingest_cycle_and_cleanup(remote_env)
    assert first_ids.isdisjoint(second_ids)
    for row_id in first_ids | second_ids:
        assert not _row_exists_via_rest(
            remote_env["SUPABASE_URL"], remote_env["SUPABASE_SERVICE_ROLE_KEY"], row_id
        )
