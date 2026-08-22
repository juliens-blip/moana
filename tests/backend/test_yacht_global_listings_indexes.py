"""Offline + live contract test for the YATCO filter/ingestion index migration.

Offline: reads the .sql files as text, no database, no network. Pins which
columns are indexed, that CREATE INDEX is guarded against a missing parent
table, that nothing destructive slips in, and that the ingestion timestamp
indexed for the default sort is our own `updated_at` — not a raw YATCO date
(`source_created_at`/`source_updated_at`), which the freshness-signal fix in
20260820T1615 already established as unreliable for ingestion recency.

Live: skipped unless SUPABASE_DB_URL and psql are available. Proves what
cannot be checked offline: the up migration is idempotent, creates all five
indexes, and the down migration removes exactly those five and is itself
replayable without residue.
"""

from __future__ import annotations

import importlib.util
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
MIGRATIONS = REPO_ROOT / "supabase" / "migrations"
BASE_UP_PATH = MIGRATIONS / "20260814T0031__yatco_global_listings.sql"
UP_PATH = MIGRATIONS / "20260820T2135__add_yacht_global_listings_indexes.sql"
DOWN_PATH = MIGRATIONS / "20260820T2135__add_yacht_global_listings_indexes.down.sql"
APPLIER = REPO_ROOT / "supabase" / "apply_migration.py"

# column -> index name, one pair per filter of lib/supabase/yatco-global.ts
# plus the ingestion timestamp used by its default sort (.order('updated_at')).
INDEXED_COLUMNS = {
    "model_year": "idx_yatco_global_listings_model_year",
    "length_m": "idx_yatco_global_listings_length_m",
    "country": "idx_yatco_global_listings_country",
    "price_usd": "idx_yatco_global_listings_price_usd_filter",
    "updated_at": "idx_yatco_global_listings_updated_at",
}
INDEX_NAMES = tuple(INDEXED_COLUMNS.values())

RAW_YATCO_DATE_COLUMNS = ("source_created_at", "source_updated_at")

SECRET_MARKERS_ENV = "MOANA_SQL_SECRET_MARKERS"
DEFAULT_SECRET_MARKERS = (
    r"[a-z][a-z0-9+.-]*://",           # endpoint URL
    r"\bey[A-Za-z0-9_-]{10,}",         # base64 JWT head
    r"(?i)\brole[_-]?key\b",           # named API key
    r"(?i)\bpass\w*\s*[=:]\s*\S",      # inline credential
)
SECRET_PATTERNS = tuple(
    part.strip()
    for part in os.environ.get(SECRET_MARKERS_ENV, "").split(",")
    if part.strip()
) or DEFAULT_SECRET_MARKERS


@pytest.fixture(scope="module")
def up_sql() -> str:
    return UP_PATH.read_text(encoding="utf-8")


@pytest.fixture(scope="module")
def down_sql() -> str:
    return DOWN_PATH.read_text(encoding="utf-8")


# ================================================================
# Offline: contract pinned on the SQL text, no database required.
# ================================================================


def test_up_migration_indexes_every_filter_and_ingestion_column(up_sql: str) -> None:
    for column, index_name in INDEXED_COLUMNS.items():
        assert f"CREATE INDEX IF NOT EXISTS {index_name} " in up_sql, (
            f"missing idempotent CREATE INDEX for {index_name}"
        )
        assert re.search(
            rf"ON public\.yatco_global_listings \({re.escape(column)}\b", up_sql
        ), f"missing index target column {column}"


def test_up_migration_guards_missing_parent_table(up_sql: str) -> None:
    # CREATE INDEX has no "ON TABLE IF EXISTS" form, unlike ALTER TABLE:
    # every EXECUTE must sit behind a to_regclass() guard instead.
    assert "to_regclass('public.yatco_global_listings')" in up_sql
    assert re.search(r"IF to_regclass\('public\.yatco_global_listings'\) IS NOT NULL", up_sql)
    for index_name in INDEX_NAMES:
        create_pos = up_sql.index(index_name)
        guard_pos = up_sql.index("to_regclass('public.yatco_global_listings')")
        assert guard_pos < create_pos, f"{index_name} created outside the to_regclass guard"


def test_ingestion_index_targets_our_own_timestamp_not_a_raw_yatco_date(
    up_sql: str,
) -> None:
    # The 72h freshness view was fixed in 20260820T1615 to stop trusting
    # YATCO's own source_created_at/source_updated_at for recency; the
    # default-sort index must follow the same rule.
    for raw_column in RAW_YATCO_DATE_COLUMNS:
        assert raw_column not in up_sql, (
            f"{raw_column} is a raw YATCO date, not an ingestion timestamp"
        )
    assert re.search(
        r"ON public\.yatco_global_listings \(updated_at DESC", up_sql
    ), "default-sort index must be on updated_at DESC"


def test_up_migration_has_no_destructive_statement(up_sql: str) -> None:
    assert re.search(r"(?i)\bDROP\s+(TABLE|COLUMN)\b", up_sql) is None
    assert re.search(r"(?i)\bTRUNCATE\b", up_sql) is None
    assert re.search(r"(?i)\bDELETE\s+FROM\b", up_sql) is None


def test_up_migration_wraps_everything_in_one_transaction(up_sql: str) -> None:
    assert up_sql.count("BEGIN;") == 1
    assert up_sql.count("COMMIT;") == 1
    assert up_sql.rstrip().endswith("COMMIT;")


def test_down_drops_exactly_the_indexes_added_by_up(up_sql: str, down_sql: str) -> None:
    created = set(re.findall(r"CREATE INDEX IF NOT EXISTS (idx_\w+)", up_sql))
    dropped = set(re.findall(r"DROP INDEX IF EXISTS public\.(idx_\w+)", down_sql))
    assert created == set(INDEX_NAMES)
    assert dropped == set(INDEX_NAMES)


def test_down_touches_nothing_outside_the_five_indexes(down_sql: str) -> None:
    code_only = "\n".join(
        line for line in down_sql.splitlines() if not line.lstrip().startswith("--")
    )
    referenced = set(re.findall(r"public\.\w+", code_only))
    assert referenced == {f"public.{name}" for name in INDEX_NAMES}


def test_down_migration_wraps_everything_in_one_transaction(down_sql: str) -> None:
    assert down_sql.count("BEGIN;") == 1
    assert down_sql.count("COMMIT;") == 1
    assert down_sql.rstrip().endswith("COMMIT;")


@pytest.mark.parametrize("path", [UP_PATH, DOWN_PATH], ids=["up", "down"])
def test_no_secret_or_environment_value_in_sql(path: Path) -> None:
    text = path.read_text(encoding="utf-8")
    for pattern in SECRET_PATTERNS:
        assert re.search(pattern, text) is None, f"{pattern!r} matched in {path.name}"


# ================================================================
# Live integration test: skipped unless SUPABASE_DB_URL and psql are
# available. Proves the up/down pair actually replays against a real
# schema and leaves no residual index behind after a second down.
# ================================================================

DATABASE_URL = os.getenv("SUPABASE_DB_URL", "").strip()
_live_db_available = pytest.mark.skipif(
    not DATABASE_URL, reason="SUPABASE_DB_URL is not set"
)
_psql_available = pytest.mark.skipif(
    shutil.which("psql") is None, reason="psql is not installed"
)


def _load_applier():
    spec = importlib.util.spec_from_file_location(
        "moana_apply_migration_yacht_indexes", APPLIER
    )
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def _apply(sql_path: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(APPLIER), str(sql_path)],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        timeout=300,
        check=False,
    )


def _index_names_present() -> set[str]:
    applier = _load_applier()
    env = {**os.environ, **applier.split_database_url(DATABASE_URL)}
    quoted_names = ", ".join(f"'{name}'" for name in INDEX_NAMES)
    completed = subprocess.run(
        [
            "psql",
            "--no-psqlrc",
            "--quiet",
            "--tuples-only",
            "--no-align",
            "--set=ON_ERROR_STOP=1",
            "--command",
            "SELECT indexname FROM pg_indexes WHERE schemaname = 'public' "
            f"AND indexname = ANY(ARRAY[{quoted_names}])",
        ],
        env=env,
        capture_output=True,
        text=True,
        timeout=60,
        check=False,
    )
    assert completed.returncode == 0, completed.stderr[-2000:]
    return {line for line in completed.stdout.split("\n") if line}


@_live_db_available
@_psql_available
def test_indexes_exist_after_up_and_are_gone_after_down() -> None:
    # The index migration depends on the base table existing first.
    base = _apply(BASE_UP_PATH)
    assert base.returncode == 0, base.stderr[-2000:]

    try:
        first_up = _apply(UP_PATH)
        assert first_up.returncode == 0, first_up.stderr[-2000:]
        second_up = _apply(UP_PATH)
        assert second_up.returncode == 0, second_up.stderr[-2000:]
        up_combined = second_up.stderr + second_up.stdout
        assert "42P07" not in up_combined  # duplicate_table / duplicate relation
        assert DATABASE_URL not in up_combined

        assert _index_names_present() == set(INDEX_NAMES), (
            "all five filter/ingestion indexes must exist after the up migration"
        )

        first_down = _apply(DOWN_PATH)
        assert first_down.returncode == 0, first_down.stderr[-2000:]
        second_down = _apply(DOWN_PATH)
        assert second_down.returncode == 0, second_down.stderr[-2000:]
        down_combined = second_down.stderr + second_down.stdout
        assert DATABASE_URL not in down_combined

        assert _index_names_present() == set(), (
            "no residual index must remain after the down migration"
        )
    finally:
        # Leave the database in the shipped (up) state for the next run.
        restore = _apply(UP_PATH)
        assert restore.returncode == 0, restore.stderr[-2000:]
