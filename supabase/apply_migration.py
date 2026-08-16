"""Apply a single SQL migration file to Supabase through ``psql``.

The connection string comes from the environment only (``SUPABASE_DB_URL``).
It is never passed on the command line: it is split into ``PG*`` variables
injected in the subprocess environment, so the password never appears in
``argv`` (visible in ``ps``) nor in any log line — every message goes through
``redact()``, same policy as ``supabase/check_connection.py``.

``psql`` runs with ``ON_ERROR_STOP=1``: the migration is a single BEGIN/COMMIT
block, so any statement failure rolls the whole file back.

Exit codes: 0 success, 1 execution failure, 2 missing configuration.
"""

from __future__ import annotations

import argparse
import logging
import os
import shutil
import subprocess
import sys
import urllib.parse
from pathlib import Path

LOGGER = logging.getLogger("moana.supabase.migrate")
PSQL_BINARY = "psql"
DEFAULT_PORT = "5432"
COMMAND_TIMEOUT = 300.0
MAX_ERROR_BODY_CHARS = 2000


class ConfigurationError(RuntimeError):
    """Configuration is missing or unsafe."""


class MigrationError(RuntimeError):
    """The migration could not be applied."""


def load_database_url() -> str:
    """Return ``SUPABASE_DB_URL`` validated from the environment."""
    database_url = os.getenv("SUPABASE_DB_URL", "").strip()
    if not database_url:
        raise ConfigurationError("Missing configuration: SUPABASE_DB_URL")
    return database_url


def redact(message: str, secret: str) -> str:
    """Hide every occurrence of ``secret`` in ``message``."""
    if not secret:
        return message
    return message.replace(secret, "***")


def split_database_url(database_url: str) -> dict[str, str]:
    """Split a postgres URL into the ``PG*`` variables ``psql`` understands.

    Nothing is returned as a CLI argument: the caller merges this mapping into
    the subprocess environment, which keeps the password out of ``argv``.
    """
    parsed = urllib.parse.urlsplit(database_url)
    if parsed.scheme not in ("postgres", "postgresql"):
        raise ConfigurationError(
            f"SUPABASE_DB_URL must use a postgres:// scheme, got {parsed.scheme!r}"
        )
    if not parsed.hostname:
        raise ConfigurationError("SUPABASE_DB_URL has no host")

    unquote = urllib.parse.unquote
    env = {
        "PGHOST": parsed.hostname,
        "PGPORT": str(parsed.port or DEFAULT_PORT),
        "PGDATABASE": unquote(parsed.path.lstrip("/")) or "postgres",
    }
    if parsed.username:
        env["PGUSER"] = unquote(parsed.username)
    if parsed.password:
        env["PGPASSWORD"] = unquote(parsed.password)

    # sslmode=require and friends travel in the query string, not in PG*.
    query = dict(urllib.parse.parse_qsl(parsed.query))
    env["PGSSLMODE"] = query.get("sslmode", "require")
    return env


def build_psql_argv(sql_path: Path) -> list[str]:
    """Build the ``psql`` command line — credentials excluded by design."""
    return [
        PSQL_BINARY,
        "--no-psqlrc",
        "--quiet",
        # A failing statement must abort the file instead of continuing.
        "--set=ON_ERROR_STOP=1",
        "--file",
        str(sql_path),
    ]


def build_reload_schema_argv() -> list[str]:
    """Build the ``psql`` command line that notifies PostgREST to reload."""
    return [
        PSQL_BINARY,
        "--no-psqlrc",
        "--quiet",
        "--set=ON_ERROR_STOP=1",
        "--command",
        "NOTIFY pgrst, 'reload schema';",
    ]


def reload_schema_cache(
    database_url: str,
    *,
    runner=None,
) -> None:
    """Notify PostgREST to reload its schema cache; raise on any failure.

    Without this, columns and tables added by the migration stay invisible
    to the REST API until PostgREST's cache expires on its own — the known
    trap for this pipeline (see state.md).
    """
    secret = split_database_url(database_url).get("PGPASSWORD", "")
    env = {**os.environ, **split_database_url(database_url)}
    execute = runner or subprocess.run

    LOGGER.info("reloading PostgREST schema cache")
    try:
        completed = execute(
            build_reload_schema_argv(),
            env=env,
            capture_output=True,
            text=True,
            timeout=COMMAND_TIMEOUT,
        )
    except subprocess.TimeoutExpired:
        raise MigrationError(
            f"psql timed out after {COMMAND_TIMEOUT:.0f}s reloading the schema cache"
        ) from None
    except OSError as exc:
        raise MigrationError(
            redact(f"psql could not be started for schema reload: {exc}", secret)
        ) from None

    if completed.returncode != 0:
        detail = (completed.stderr or "").strip()[:MAX_ERROR_BODY_CHARS]
        raise MigrationError(
            redact(
                f"schema cache reload failed (psql exited {completed.returncode}): {detail}",
                secret,
            ).strip()
        )


def apply_migration(
    sql_path: Path,
    database_url: str,
    *,
    runner=None,
) -> None:
    """Run ``sql_path`` against ``database_url``; raise on any failure.

    On success, notifies PostgREST to reload its schema cache so the new
    columns/tables are visible through the REST API without waiting for the
    cache's own refresh cycle.
    """
    if not sql_path.is_file():
        raise MigrationError(f"Migration file not found: {sql_path}")
    if shutil.which(PSQL_BINARY) is None:
        raise MigrationError(
            "psql binary not found in PATH; apply the migration through the "
            "Supabase SQL Editor instead"
        )

    secret = split_database_url(database_url).get("PGPASSWORD", "")
    env = {**os.environ, **split_database_url(database_url)}
    execute = runner or subprocess.run

    LOGGER.info("applying %s", sql_path)
    try:
        completed = execute(
            build_psql_argv(sql_path),
            env=env,
            capture_output=True,
            text=True,
            timeout=COMMAND_TIMEOUT,
        )
    except subprocess.TimeoutExpired:
        raise MigrationError(
            f"psql timed out after {COMMAND_TIMEOUT:.0f}s for {sql_path.name}"
        ) from None
    except OSError as exc:
        raise MigrationError(
            redact(f"psql could not be started: {exc}", secret)
        ) from None

    if completed.returncode != 0:
        detail = (completed.stderr or "").strip()[:MAX_ERROR_BODY_CHARS]
        raise MigrationError(
            redact(
                f"psql exited {completed.returncode} for {sql_path.name}: {detail}",
                secret,
            ).strip()
        )

    reload_schema_cache(database_url, runner=runner)


def parse_args(argv: list[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="apply_migration.py",
        description=(
            "Apply one SQL migration file to the database pointed at by "
            "SUPABASE_DB_URL. The connection string is read from the "
            "environment and never echoed."
        ),
    )
    parser.add_argument("sql_file", help="Path to the .sql migration to apply")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    args = parse_args(argv if argv is not None else sys.argv[1:])

    try:
        database_url = load_database_url()
    except ConfigurationError as exc:
        LOGGER.error("%s", exc)
        return 2

    try:
        apply_migration(Path(args.sql_file), database_url)
    except ConfigurationError as exc:
        LOGGER.error("%s", redact(str(exc), database_url))
        return 2
    except MigrationError as exc:
        LOGGER.error("%s", redact(str(exc), database_url))
        return 1

    print(f"applied: {Path(args.sql_file).name}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
