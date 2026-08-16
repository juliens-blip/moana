"""Read-only Supabase connectivity check for the backend tables.

Covers ``public.listings`` plus the YATCO pipeline tables
``public.yatco_global_listings`` and ``public.yatco_scrape_runs``.

The script issues one GET per table against PostgREST with
``Prefer: count=exact`` and ``Range: 0-0``: the server answers with an empty
body and the exact row count in the ``Content-Range`` header. Nothing is ever
written back.

Configuration comes from the environment only (``NEXT_PUBLIC_SUPABASE_URL``
and ``SUPABASE_SERVICE_ROLE_KEY``); the service-role key never leaves the
process and is redacted from every message.

Exit codes: 0 every table answered, 1 at least one network or HTTP failure,
2 missing configuration.
"""

from __future__ import annotations

import logging
import os
import random
import time
import urllib.error
import urllib.request
from typing import Callable

LOGGER = logging.getLogger("moana.supabase.check")
USER_AGENT = "MoanaSupabaseCheck/1.0"
TABLES = ("listings", "yatco_global_listings", "yatco_scrape_runs")
REQUEST_TIMEOUT = 15.0
MAX_ATTEMPTS = 3
BACKOFF_BASE_SECONDS = 1.0
BACKOFF_CAP_SECONDS = 8.0
MAX_ERROR_BODY_CHARS = 500


class ConfigurationError(RuntimeError):
    """Configuration is missing or unsafe."""


class CheckError(RuntimeError):
    """The connectivity check could not be completed."""


def load_config() -> tuple[str, str]:
    """Return ``(base_url, service_key)`` validated from the environment."""
    supabase_url = os.getenv("NEXT_PUBLIC_SUPABASE_URL", "").strip()
    service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()

    missing = []
    if not supabase_url:
        missing.append("NEXT_PUBLIC_SUPABASE_URL")
    if not service_key:
        missing.append("SUPABASE_SERVICE_ROLE_KEY")
    if missing:
        raise ConfigurationError("Missing configuration: " + ", ".join(missing))

    return supabase_url.rstrip("/"), service_key


def redact(message: str, secret: str) -> str:
    """Hide every occurrence of ``secret`` in ``message``."""
    if not secret:
        return message
    return message.replace(secret, "***")


def build_count_request(
    base_url: str, service_key: str, table: str
) -> urllib.request.Request:
    """Build the read request used by the check for one table."""
    endpoint = f"{base_url}/rest/v1/{table}?select=id"
    return urllib.request.Request(
        endpoint,
        method="GET",
        headers={
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
            "Accept": "application/json",
            # count=exact makes PostgREST report the total in Content-Range.
            "Prefer": "count=exact",
            # 0-0 keeps the body empty: only the header matters here.
            "Range": "0-0",
            "User-Agent": USER_AGENT,
        },
    )


def parse_content_range(header: str | None) -> int:
    """Extract the total row count from a ``Content-Range`` header."""
    if not header or "/" not in header:
        raise CheckError(f"Unusable Content-Range header: {header!r}")
    total = header.rsplit("/", 1)[1].strip()
    if not total.isdigit():
        raise CheckError(f"Unusable Content-Range header: {header!r}")
    return int(total)


def _backoff_seconds(attempt: int) -> float:
    """Exponential backoff capped at 8 s, with jitter to spread retries."""
    ceiling = min(BACKOFF_BASE_SECONDS * (2 ** (attempt - 1)), BACKOFF_CAP_SECONDS)
    return round(ceiling * (0.5 + random.random() * 0.5), 3)


def _read_error_body(error: urllib.error.HTTPError) -> str:
    try:
        body = error.read().decode("utf-8", errors="replace")
    except Exception:  # noqa: BLE001 - the body is best effort only.
        return ""
    return body.strip()[:MAX_ERROR_BODY_CHARS]


def fetch_table_count(
    base_url: str,
    service_key: str,
    table: str,
    *,
    opener: Callable[..., object] | None = None,
    sleeper: Callable[[float], None] | None = None,
) -> int:
    """Return the exact number of rows in ``public.<table>``.

    Retries at most ``MAX_ATTEMPTS`` times on transport errors and HTTP 5xx;
    a 4xx answer is final and raises immediately.
    """
    send = opener or urllib.request.urlopen
    wait = sleeper or time.sleep
    request = build_count_request(base_url, service_key, table)
    last_error: CheckError | None = None

    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            with send(request, timeout=REQUEST_TIMEOUT) as response:
                return parse_content_range(response.headers.get("Content-Range"))
        except urllib.error.HTTPError as exc:
            detail = _read_error_body(exc)
            message = redact(
                f"Supabase answered HTTP {exc.code} for {table}: {detail}".strip(),
                service_key,
            )
            if exc.code < 500:
                raise CheckError(message) from None
            last_error = CheckError(message)
        except (urllib.error.URLError, OSError) as exc:
            last_error = CheckError(
                redact(f"Supabase request failed for {table}: {exc}", service_key)
            )

        if attempt < MAX_ATTEMPTS:
            delay = _backoff_seconds(attempt)
            LOGGER.warning(
                "table=%s attempt=%d/%d failed, retrying in %.3fs: %s",
                table,
                attempt,
                MAX_ATTEMPTS,
                delay,
                last_error,
            )
            wait(delay)

    raise last_error or CheckError(
        f"Supabase request failed for {table} for an unknown reason"
    )


def main(argv: list[str] | None = None) -> int:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )

    try:
        base_url, service_key = load_config()
    except ConfigurationError as exc:
        LOGGER.error("%s", exc)
        return 2

    # Every table is probed even when one fails, so a single run reports the
    # complete picture instead of stopping at the first error.
    failures = 0
    for table in TABLES:
        try:
            count = fetch_table_count(base_url, service_key, table)
        except CheckError as exc:
            LOGGER.error("%s", redact(str(exc), service_key))
            failures += 1
            continue
        print(f"public.{table}: {count} rows")

    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
