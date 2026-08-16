"""Offline contract test for the YATCO migration pair.

Reads the .sql files as text: no database, no network. It pins the schema
contract (dedup, price normalisation, source freshness, RLS) and guards
against a secret or a destructive statement slipping into the up migration.
"""

from __future__ import annotations

import importlib.util
import os
import re
import shutil
import subprocess
import sys
import uuid
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
MIGRATIONS = REPO_ROOT / "supabase" / "migrations"
UP_PATH = MIGRATIONS / "20260814T0031__yatco_global_listings.sql"
DOWN_PATH = MIGRATIONS / "20260814T0031__yatco_global_listings.down.sql"
NEW_UP_PATH = (
    MIGRATIONS / "20260814T1330__extend_yatco_listings_and_add_price_history.sql"
)
NEW_DOWN_PATH = (
    MIGRATIONS
    / "20260814T1330__extend_yatco_listings_and_add_price_history.down.sql"
)
SELECTION_UP_PATH = (
    MIGRATIONS / "20260814T1930__replace_yatco_selection_criteria.sql"
)
SELECTION_DOWN_PATH = (
    MIGRATIONS / "20260814T1930__replace_yatco_selection_criteria.down.sql"
)
APPLIER = REPO_ROOT / "supabase" / "apply_migration.py"

TABLES = ("public.yatco_global_listings", "public.yatco_scrape_runs")
NEW_COLUMNS = (
    "broker_name",
    "broker_company",
    "agent_name",
    "agent_email",
    "spec_sheet_url",
    "source_created_at",
)

# Markers used to detect a credential left in the SQL. They are configuration,
# not test data: SECRET_MARKERS_ENV holds a comma-separated list of regexes so
# no credential-shaped literal is stored in the repo. The fallback below stays
# generic on purpose (shapes, never values).
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


@pytest.fixture(scope="module")
def price_up_sql() -> str:
    return NEW_UP_PATH.read_text(encoding="utf-8")


@pytest.fixture(scope="module")
def price_down_sql() -> str:
    return NEW_DOWN_PATH.read_text(encoding="utf-8")


@pytest.fixture(scope="module")
def selection_up_sql() -> str:
    return SELECTION_UP_PATH.read_text(encoding="utf-8")


@pytest.fixture(scope="module")
def selection_down_sql() -> str:
    return SELECTION_DOWN_PATH.read_text(encoding="utf-8")


def _statements(sql: str) -> list[str]:
    """Split on semicolons, dropping comment-only lines."""
    stripped = "\n".join(
        line for line in sql.splitlines() if not line.lstrip().startswith("--")
    )
    return [s.strip() for s in stripped.split(";") if s.strip()]


def test_both_tables_created_idempotently(up_sql: str) -> None:
    for table in TABLES:
        assert f"CREATE TABLE IF NOT EXISTS {table}" in up_sql


def test_dedup_key_is_generated_and_not_null(up_sql: str) -> None:
    assert re.search(
        r"dedup_key\s+TEXT\s+GENERATED\s+ALWAYS\s+AS\s*"
        r"\(\s*lower\(source\)\s*\|\|\s*':'\s*\|\|\s*lower\(external_id\)\s*\)\s*STORED",
        up_sql,
    ), "dedup_key must be a STORED generated column over source/external_id"
    # A generated column is NULL-free only if both of its inputs are NOT NULL.
    assert re.search(r"source\s+TEXT\s+NOT NULL", up_sql)
    assert re.search(r"external_id\s+TEXT\s+NOT NULL", up_sql)


def test_dedup_is_enforced_by_a_unique_index(up_sql: str) -> None:
    assert (
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_yatco_global_listings_dedup" in up_sql
    )


def test_original_price_and_usd_coexist(up_sql: str) -> None:
    for column in ("price_amount", "price_currency", "price_usd"):
        assert re.search(rf"^\s*{column}\s+", up_sql, re.MULTILINE), column


def test_source_freshness_is_distinct_from_technical_updated_at(up_sql: str) -> None:
    assert re.search(r"^\s*source_updated_at\s+TIMESTAMPTZ", up_sql, re.MULTILINE)
    assert re.search(r"^\s*updated_at\s+TIMESTAMPTZ", up_sql, re.MULTILINE)


def test_rls_is_enabled_and_forced_on_both_tables(up_sql: str) -> None:
    for table in TABLES:
        assert f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY" in up_sql
        assert f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY" in up_sql


def test_browser_roles_are_revoked_and_service_role_granted(up_sql: str) -> None:
    for table in TABLES:
        assert (
            f"REVOKE ALL PRIVILEGES ON TABLE {table} FROM anon, authenticated"
            in up_sql
        )
        assert re.search(
            rf"GRANT[^;]*ON TABLE {re.escape(table)} TO service_role", up_sql
        ), table


def test_up_migration_has_no_destructive_statement(up_sql: str) -> None:
    # DROP/TRUNCATE/DELETE are only forbidden as statements; the substring
    # "DELETE" legitimately appears in GRANT ... DELETE and ON DELETE SET NULL.
    offenders = [
        s.splitlines()[0]
        for s in _statements(up_sql)
        if re.match(r"(?i)^(DROP|TRUNCATE|DELETE)\b", s)
    ]
    assert offenders == [], offenders


def test_migration_wraps_everything_in_one_transaction(up_sql: str) -> None:
    assert up_sql.lstrip().startswith("--") or up_sql.lstrip().startswith("BEGIN;")
    assert "BEGIN;" in up_sql
    assert up_sql.rstrip().endswith("COMMIT;")


@pytest.mark.parametrize(
    "path",
    [UP_PATH, DOWN_PATH, NEW_UP_PATH, NEW_DOWN_PATH, SELECTION_UP_PATH, SELECTION_DOWN_PATH],
    ids=["up", "down", "new_up", "new_down", "selection_up", "selection_down"],
)
def test_no_secret_or_environment_value_in_sql(path: Path) -> None:
    text = path.read_text(encoding="utf-8")
    # pg_dump "$SUPABASE_DB_URL" in the rollback header is a shell variable
    # reference, not a value; only literal secrets are forbidden.
    for pattern in SECRET_PATTERNS:
        assert re.search(pattern, text) is None, f"{pattern!r} matched in {path.name}"


def test_down_drops_every_table_created_by_up(up_sql: str, down_sql: str) -> None:
    created = set(re.findall(r"CREATE TABLE IF NOT EXISTS (public\.\w+)", up_sql))
    dropped = set(re.findall(r"DROP TABLE IF EXISTS (public\.\w+)", down_sql))
    assert created == dropped


def test_down_touches_nothing_outside_the_two_tables(down_sql: str) -> None:
    referenced = set(re.findall(r"public\.\w+", down_sql))
    assert referenced <= {*TABLES, "public.update_yatco_updated_at"}


# ================================================================
# Extension migration: broker/agent columns + price history + deltas.
# Offline, same contract-pinning approach as above.
# ================================================================


def test_new_columns_are_added_idempotently(price_up_sql: str) -> None:
    for column in NEW_COLUMNS:
        assert re.search(
            rf"ADD COLUMN IF NOT EXISTS {column}\b", price_up_sql
        ), column


def test_price_history_table_created_idempotently(price_up_sql: str) -> None:
    assert (
        "CREATE TABLE IF NOT EXISTS public.yatco_listing_price_history"
        in price_up_sql
    )


def test_price_history_allows_two_points_for_same_dedup_key(price_up_sql: str) -> None:
    # A bare UNIQUE(dedup_key) would forbid a second price point; the
    # idempotency key must include observed_at.
    assert re.search(r"UNIQUE\s*\(dedup_key\)", price_up_sql) is None
    assert re.search(
        r"UNIQUE\s*\(dedup_key,\s*observed_at\)", price_up_sql
    )


def test_source_created_at_index_exists(price_up_sql: str) -> None:
    assert re.search(
        r"CREATE INDEX IF NOT EXISTS idx_yatco_global_listings_source_created_at\s+"
        r"ON public\.yatco_global_listings \(source_created_at DESC\)",
        price_up_sql,
    )


def test_price_delta_view_avoids_division_by_zero(price_up_sql: str) -> None:
    assert "CREATE OR REPLACE VIEW public.yatco_listing_price_deltas" in price_up_sql
    assert re.search(
        r"WHEN LAG\(h\.price_usd\) OVER w IS NULL OR LAG\(h\.price_usd\) OVER w = 0\s*"
        r"\n\s*THEN NULL",
        price_up_sql,
    ), "the view must return NULL instead of dividing by a zero/absent previous price"


def test_price_history_rls_is_enabled_and_forced(price_up_sql: str) -> None:
    table = "public.yatco_listing_price_history"
    assert f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY" in price_up_sql
    assert f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY" in price_up_sql
    assert f"REVOKE ALL PRIVILEGES ON TABLE {table} FROM anon, authenticated" in price_up_sql
    assert re.search(
        rf"GRANT[^;]*ON TABLE {re.escape(table)} TO service_role", price_up_sql
    )


def test_new_migration_has_no_destructive_statement(price_up_sql: str) -> None:
    offenders = [
        s.splitlines()[0]
        for s in _statements(price_up_sql)
        if re.match(r"(?i)^(DROP|TRUNCATE|DELETE)\b", s)
    ]
    assert offenders == [], offenders


def test_new_migration_wraps_everything_in_one_transaction(price_up_sql: str) -> None:
    assert "BEGIN;" in price_up_sql
    assert price_up_sql.rstrip().endswith("COMMIT;")


def test_new_down_drops_price_history_objects(price_down_sql: str) -> None:
    assert "DROP VIEW IF EXISTS public.yatco_listing_price_deltas" in price_down_sql
    assert (
        "DROP TABLE IF EXISTS public.yatco_listing_price_history" in price_down_sql
    )


def test_new_down_removes_exactly_the_columns_added(
    price_up_sql: str, price_down_sql: str
) -> None:
    added = set(re.findall(r"ADD COLUMN IF NOT EXISTS (\w+)", price_up_sql))
    removed = set(re.findall(r"DROP COLUMN IF EXISTS (\w+)", price_down_sql))
    assert added == removed == set(NEW_COLUMNS)


def test_new_down_does_not_touch_prior_migration_objects(price_down_sql: str) -> None:
    # Scope symmetry: this down only undoes what this migration's up added.
    assert "yatco_scrape_runs" not in price_down_sql
    assert "idx_yatco_global_listings_source_updated_at" not in price_down_sql
    assert "DROP TABLE IF EXISTS public.yatco_global_listings" not in price_down_sql


# ================================================================
# Selection-criteria migration: drop the 2M-USD price floor, add freshness
# (created OR updated <72h) + length_m > 26 + model_year >= 2010 instead.
# Offline, same contract-pinning approach as above.
# ================================================================


def test_selection_migration_drops_old_price_index_with_if_exists(
    selection_up_sql: str,
) -> None:
    assert (
        "DROP INDEX IF EXISTS public.idx_yatco_global_listings_price_usd"
        in selection_up_sql
    )


def test_selection_migration_adds_criteria_index_idempotently(
    selection_up_sql: str,
) -> None:
    assert re.search(
        r"CREATE INDEX IF NOT EXISTS idx_yatco_global_listings_selection_criteria\s+"
        r"ON public\.yatco_global_listings \(length_m, model_year\)\s+"
        r"WHERE length_m > 26 AND model_year >= 2010",
        selection_up_sql,
    )


def test_selection_view_created_idempotently(selection_up_sql: str) -> None:
    assert (
        "CREATE OR REPLACE VIEW public.yatco_selection_candidates"
        in selection_up_sql
    )


def test_selection_view_encodes_freshness_length_and_year(
    selection_up_sql: str,
) -> None:
    assert re.search(
        r"source_created_at >= now\(\) - INTERVAL '72 hours'\s*"
        r"\n\s*OR l\.source_updated_at >= now\(\) - INTERVAL '72 hours'",
        selection_up_sql,
    )
    assert "AND l.length_m > 26" in selection_up_sql
    assert "AND l.model_year >= 2010" in selection_up_sql


def test_selection_view_has_no_price_floor(selection_up_sql: str) -> None:
    # No comparison against price_usd anywhere in the up migration: the
    # dropped index's identifier contains the substring "price_usd", but no
    # filter expression (price_usd <op> <value>) may appear.
    assert re.search(r"price_usd\s*(>=|>|<=|<)\s*\d", selection_up_sql) is None


def test_selection_up_migration_has_no_destructive_statement(
    selection_up_sql: str,
) -> None:
    # DROP INDEX is the one intentional exception: it removes the obsolete
    # price-floor index, not data. DROP TABLE/VIEW, TRUNCATE and DELETE stay
    # forbidden, as does any column drop.
    offenders = [
        s.splitlines()[0]
        for s in _statements(selection_up_sql)
        if re.match(r"(?i)^(DROP (TABLE|VIEW)|TRUNCATE|DELETE)\b", s)
    ]
    assert offenders == [], offenders
    assert "DROP COLUMN" not in selection_up_sql


def test_selection_up_does_not_recreate_price_history_objects(
    selection_up_sql: str,
) -> None:
    # Check the executable statements only: the header comment documenting
    # what this migration deliberately leaves untouched legitimately names
    # both objects.
    body = "\n".join(_statements(selection_up_sql))
    assert "yatco_listing_price_history" not in body
    assert "yatco_listing_price_deltas" not in body


def test_selection_migration_wraps_everything_in_one_transaction(
    selection_up_sql: str,
) -> None:
    assert "BEGIN;" in selection_up_sql
    assert selection_up_sql.rstrip().endswith("COMMIT;")


def test_selection_down_restores_price_index_and_drops_new_objects(
    selection_down_sql: str,
) -> None:
    assert "DROP VIEW IF EXISTS public.yatco_selection_candidates" in selection_down_sql
    assert (
        "DROP INDEX IF EXISTS public.idx_yatco_global_listings_selection_criteria"
        in selection_down_sql
    )
    assert re.search(
        r"CREATE INDEX IF NOT EXISTS idx_yatco_global_listings_price_usd\s+"
        r"ON public\.yatco_global_listings \(price_usd\)\s+"
        r"WHERE price_usd >= 2000000",
        selection_down_sql,
    )


def test_selection_down_does_not_touch_price_history_or_columns(
    selection_down_sql: str,
) -> None:
    body = "\n".join(_statements(selection_down_sql))
    assert "yatco_listing_price_history" not in body
    assert "yatco_listing_price_deltas" not in body
    assert "DROP COLUMN" not in body
    assert "DROP TABLE IF EXISTS public.yatco_global_listings" not in body


def test_selection_migration_wraps_down_in_one_transaction(
    selection_down_sql: str,
) -> None:
    assert "BEGIN;" in selection_down_sql
    assert selection_down_sql.rstrip().endswith("COMMIT;")


def test_apply_migration_reloads_schema_cache_after_success() -> None:
    source = APPLIER.read_text(encoding="utf-8")
    assert "reload_schema_cache(database_url" in source
    assert "NOTIFY pgrst" in source


# ================================================================
# Live integration test: skipped unless SUPABASE_DB_URL and psql are
# available. Proves what cannot be checked offline: the extension replays
# cleanly on top of the base migration, two price points coexist for one
# dedup_key, and the delta view computes the expected amount/percentage
# (with a verified NULL, not an error, when the previous price is zero).
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
        "moana_apply_migration_price_history", APPLIER
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


def _psql_rows(sql: str) -> list[list[str]]:
    """Run one statement, returning its rows as ``|``-split fields."""
    applier = _load_applier()
    env = {**os.environ, **applier.split_database_url(DATABASE_URL)}
    completed = subprocess.run(
        [
            "psql",
            "--no-psqlrc",
            "--quiet",
            "--tuples-only",
            "--no-align",
            "--field-separator=|",
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
    assert completed.returncode == 0, completed.stderr[-2000:]
    # Split on "\n" rather than filtering blank lines: a NULL single-column
    # row prints as an empty line and must stay aligned with its neighbours.
    # Only the trailing newline's artifact empty element is dropped.
    lines = completed.stdout.split("\n")
    if lines and lines[-1] == "":
        lines = lines[:-1]
    return [line.split("|") for line in lines]


@_live_db_available
@_psql_available
def test_yatco_migration_is_idempotent_and_computes_price_delta() -> None:
    # The extension depends on the base table; replay both, twice each.
    for sql_path in (UP_PATH, NEW_UP_PATH):
        first = _apply(sql_path)
        assert first.returncode == 0, first.stderr[-2000:]
        second = _apply(sql_path)
        assert second.returncode == 0, second.stderr[-2000:]
        combined = second.stderr + second.stdout
        assert "42701" not in combined  # duplicate_column
        assert "42P07" not in combined  # duplicate_table
        assert DATABASE_URL not in combined

    index_rows = _psql_rows(
        "SELECT indexname FROM pg_indexes WHERE schemaname = 'public' "
        "AND indexname = 'idx_yatco_global_listings_source_created_at'"
    )
    assert index_rows, "source_created_at index must exist after migration"

    external_id = f"pytest-price-{uuid.uuid4().hex}"
    assert external_id.replace("-", "").isalnum(), "external_id must stay quote-free"

    try:
        listing = _psql_rows(
            "INSERT INTO public.yatco_global_listings (source, external_id) "
            f"VALUES ('test', '{external_id}') RETURNING dedup_key"
        )
        dedup_key = listing[0][0]
        assert dedup_key, "dedup_key must be generated on insert"

        # Pin the timestamp so the replay below targets the exact same
        # (dedup_key, observed_at) row instead of a fresh now() evaluation.
        first_observed_at = _psql_rows(
            "SELECT (now() - interval '1 day')::timestamptz"
        )[0][0]
        insert_first_price_point = (
            "INSERT INTO public.yatco_listing_price_history "
            "(dedup_key, price_usd, observed_at) VALUES "
            f"('{dedup_key}', 1000000, '{first_observed_at}') "
            "ON CONFLICT (dedup_key, observed_at) DO NOTHING"
        )
        _psql_rows(insert_first_price_point)
        # Replaying the identical observation must be a no-op: this proves
        # operational idempotency (worker retries), not just the schema's
        # UNIQUE(dedup_key, observed_at) guard in isolation.
        _psql_rows(insert_first_price_point)
        replay_rows = _psql_rows(
            "SELECT count(*) FROM public.yatco_listing_price_history "
            f"WHERE dedup_key = '{dedup_key}' AND observed_at = '{first_observed_at}'"
        )
        assert replay_rows[0][0] == "1", "replaying the same observation must not duplicate it"

        _psql_rows(
            "INSERT INTO public.yatco_listing_price_history "
            "(dedup_key, price_usd, observed_at) VALUES "
            f"('{dedup_key}', 1100000, now())"
        )

        count_rows = _psql_rows(
            "SELECT count(*) FROM public.yatco_listing_price_history "
            f"WHERE dedup_key = '{dedup_key}'"
        )
        assert count_rows[0][0] == "2", "exactly two price points for one dedup_key"

        delta_rows = _psql_rows(
            "SELECT price_delta_usd, price_delta_pct "
            "FROM public.yatco_listing_price_deltas "
            f"WHERE dedup_key = '{dedup_key}' ORDER BY observed_at DESC LIMIT 1"
        )
        delta_usd, delta_pct = delta_rows[0]
        assert float(delta_usd) == pytest.approx(100000.0)
        assert float(delta_pct) == pytest.approx(10.0, rel=1e-3)

        # A previous price of zero must yield a NULL percentage, not a
        # division-by-zero error.
        _psql_rows(
            "INSERT INTO public.yatco_listing_price_history "
            "(dedup_key, price_usd, observed_at) VALUES "
            f"('{dedup_key}', 0, now() - interval '2 days')"
        )
        zero_delta_rows = _psql_rows(
            "SELECT price_delta_pct FROM public.yatco_listing_price_deltas "
            f"WHERE dedup_key = '{dedup_key}' ORDER BY observed_at ASC LIMIT 2"
        )
        assert zero_delta_rows[1][0] == "", zero_delta_rows

        # The selection-criteria migration (20260814T1930) adds a view that
        # depends on source_created_at, itself added by this migration: drop
        # it first so this migration's own down is free to drop that column,
        # then restore both afterwards, deepest dependency last.
        selection_predrop = _apply(SELECTION_DOWN_PATH)
        assert selection_predrop.returncode == 0, selection_predrop.stderr[-2000:]

        # Rollback must be idempotent too: replay the down migration twice,
        # then restore the schema (the up migration is itself idempotent)
        # so the live database is left clean for the next test run.
        first_down = _apply(NEW_DOWN_PATH)
        assert first_down.returncode == 0, first_down.stderr[-2000:]
        second_down = _apply(NEW_DOWN_PATH)
        assert second_down.returncode == 0, second_down.stderr[-2000:]
        down_combined = second_down.stderr + second_down.stdout
        assert "42703" not in down_combined  # undefined_column
        assert "42P01" not in down_combined  # undefined_table
        assert DATABASE_URL not in down_combined

        restore = _apply(NEW_UP_PATH)
        assert restore.returncode == 0, restore.stderr[-2000:]
        restore_selection = _apply(SELECTION_UP_PATH)
        assert restore_selection.returncode == 0, restore_selection.stderr[-2000:]
    finally:
        # ON DELETE CASCADE removes the associated price history rows too.
        _psql_rows(
            "DELETE FROM public.yatco_global_listings "
            f"WHERE source = 'test' AND external_id = '{external_id}'"
        )


@_live_db_available
@_psql_available
def test_selection_criteria_selects_reference_listing_without_price_floor() -> None:
    # Chain-apply every migration this one builds on, each replayed twice to
    # prove idempotence end to end.
    for sql_path in (UP_PATH, NEW_UP_PATH, SELECTION_UP_PATH):
        first = _apply(sql_path)
        assert first.returncode == 0, first.stderr[-2000:]
        second = _apply(sql_path)
        assert second.returncode == 0, second.stderr[-2000:]
        combined = second.stderr + second.stdout
        assert "42701" not in combined  # duplicate_column
        assert "42P07" not in combined  # duplicate_table
        assert DATABASE_URL not in combined

    index_rows = _psql_rows(
        "SELECT indexname FROM pg_indexes WHERE schemaname = 'public' "
        "AND indexname = 'idx_yatco_global_listings_price_usd'"
    )
    assert index_rows == [], "price-floor index must be gone after the migration"

    external_id = f"pytest-selection-{uuid.uuid4().hex}"
    assert external_id.replace("-", "").isalnum(), "external_id must stay quote-free"

    try:
        # Reference listing: 500,000 USD, 30 m, model year 2015, created 10h
        # ago. Below the removed 2M-USD floor on purpose, to prove the new
        # criteria carry no price condition.
        listing = _psql_rows(
            "INSERT INTO public.yatco_global_listings "
            "(source, external_id, price_usd, length_m, model_year, source_created_at) "
            "VALUES ("
            f"'test', '{external_id}', 500000, 30, 2015, "
            "now() - interval '10 hours'"
            ") RETURNING dedup_key"
        )
        dedup_key = listing[0][0]
        assert dedup_key, "dedup_key must be generated on insert"

        selected_rows = _psql_rows(
            "SELECT count(*) FROM public.yatco_selection_candidates "
            f"WHERE dedup_key = '{dedup_key}'"
        )
        assert selected_rows[0][0] == "1", (
            "a 500000 USD / 30 m / 2015 listing created 10h ago must be "
            "selected: no price floor applies"
        )

        # Rollback must be idempotent too, then restore so the live database
        # is left clean for the next test run.
        first_down = _apply(SELECTION_DOWN_PATH)
        assert first_down.returncode == 0, first_down.stderr[-2000:]
        second_down = _apply(SELECTION_DOWN_PATH)
        assert second_down.returncode == 0, second_down.stderr[-2000:]
        down_combined = second_down.stderr + second_down.stdout
        assert "42703" not in down_combined  # undefined_column
        assert "42P01" not in down_combined  # undefined_table
        assert DATABASE_URL not in down_combined

        restored_index_rows = _psql_rows(
            "SELECT indexname FROM pg_indexes WHERE schemaname = 'public' "
            "AND indexname = 'idx_yatco_global_listings_price_usd'"
        )
        assert restored_index_rows, "down migration must restore the price-floor index"

        restore = _apply(SELECTION_UP_PATH)
        assert restore.returncode == 0, restore.stderr[-2000:]
    finally:
        _psql_rows(
            "DELETE FROM public.yatco_global_listings "
            f"WHERE source = 'test' AND external_id = '{external_id}'"
        )
