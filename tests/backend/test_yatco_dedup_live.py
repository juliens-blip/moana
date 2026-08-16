"""Live integration test for the YATCO migration.

Skipped unless ``SUPABASE_DB_URL`` is set and ``psql`` is on the PATH. It
proves the two acceptance points that cannot be checked offline: the
migration is replayable, and a duplicated dedup key is rejected by PostgreSQL
with SQLSTATE 23505.

The connection string is only ever passed through the subprocess environment
as ``PG*`` variables — it is never printed, never in ``argv``.
"""

from __future__ import annotations

import importlib.util
import os
import shutil
import subprocess
import sys
import uuid
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
MIGRATION = (
    REPO_ROOT / "supabase" / "migrations" / "20260814T0031__yatco_global_listings.sql"
)
APPLIER = REPO_ROOT / "supabase" / "apply_migration.py"

DATABASE_URL = os.getenv("SUPABASE_DB_URL", "").strip()

pytestmark = [
    pytest.mark.skipif(not DATABASE_URL, reason="SUPABASE_DB_URL is not set"),
    pytest.mark.skipif(shutil.which("psql") is None, reason="psql is not installed"),
]


def _load_applier():
    spec = importlib.util.spec_from_file_location("moana_apply_migration", APPLIER)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def _psql(sql: str) -> subprocess.CompletedProcess[str]:
    """Run one statement, returning stdout/stderr with the SQLSTATE visible."""
    applier = _load_applier()
    env = {**os.environ, **applier.split_database_url(DATABASE_URL)}
    return subprocess.run(
        [
            "psql",
            "--no-psqlrc",
            "--quiet",
            "--tuples-only",
            "--set=ON_ERROR_STOP=1",
            "--set=VERBOSITY=verbose",
            "--command",
            sql,
        ],
        env=env,
        capture_output=True,
        text=True,
        timeout=60,
        check=False,
    )


def _apply_migration() -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(APPLIER), str(MIGRATION)],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        timeout=300,
        check=False,
    )


def test_migration_is_idempotent_and_dedup_is_enforced() -> None:
    first = _apply_migration()
    assert first.returncode == 0, first.stderr[-2000:]
    second = _apply_migration()
    assert second.returncode == 0, second.stderr[-2000:]
    # 42P07 = relation already exists: replaying must not raise it.
    assert "42P07" not in (second.stderr + second.stdout)
    assert DATABASE_URL not in (second.stderr + second.stdout)

    external_id = f"pytest-{uuid.uuid4().hex}"
    assert external_id.replace("-", "").isalnum(), "external_id must stay quote-free"
    insert = (
        "INSERT INTO public.yatco_global_listings (source, external_id) "
        f"VALUES ('test', '{external_id}')"
    )

    try:
        created = _psql(insert)
        assert created.returncode == 0, created.stderr[-2000:]

        duplicate = _psql(insert)
        assert duplicate.returncode != 0, "the duplicated dedup key must be rejected"
        assert "23505" in duplicate.stderr, duplicate.stderr[-2000:]

        runs = _psql("SELECT count(*) FROM public.yatco_scrape_runs")
        assert runs.returncode == 0, runs.stderr[-2000:]
        assert runs.stdout.strip().isdigit()
    finally:
        cleanup = _psql(
            "DELETE FROM public.yatco_global_listings "
            f"WHERE source = 'test' AND external_id = '{external_id}'"
        )
        assert cleanup.returncode == 0, cleanup.stderr[-2000:]
