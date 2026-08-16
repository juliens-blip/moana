"""Offline unit test for supabase/check_connection.py multi-table support.

No network: the opener and the sleeper are injected. The module is loaded by
path so the test never depends on the ``supabase`` name resolving to this
repository rather than to the PyPI client.
"""

from __future__ import annotations

import importlib.util
import io
import sys
import urllib.error
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
MODULE_PATH = REPO_ROOT / "supabase" / "check_connection.py"

BASE_URL = "https://example.invalid"
FAKE_KEY = "fake-service-role-key-do-not-use"


def _load_module():
    spec = importlib.util.spec_from_file_location(
        "moana_check_connection", MODULE_PATH
    )
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


check = _load_module()


class FakeResponse:
    """Minimal stand-in for the urlopen context manager."""

    def __init__(self, total: int) -> None:
        self.headers = {"Content-Range": f"0-0/{total}"}

    def __enter__(self):
        return self

    def __exit__(self, *exc_info: object) -> bool:
        return False


def _http_error(code: int, body: str) -> urllib.error.HTTPError:
    return urllib.error.HTTPError(
        url=f"{BASE_URL}/rest/v1/listings",
        code=code,
        msg="error",
        hdrs={},  # type: ignore[arg-type]
        fp=io.BytesIO(body.encode("utf-8")),
    )


def test_tables_cover_the_yatco_pipeline() -> None:
    assert "yatco_global_listings" in check.TABLES
    assert "yatco_scrape_runs" in check.TABLES


@pytest.mark.parametrize("table", ["listings", "yatco_global_listings", "yatco_scrape_runs"])
def test_build_count_request_targets_each_table(table: str) -> None:
    request = check.build_count_request(BASE_URL, FAKE_KEY, table)

    assert request.full_url == f"{BASE_URL}/rest/v1/{table}?select=id"
    assert request.get_method() == "GET"
    headers = {k.lower(): v for k, v in request.headers.items()}
    assert headers["prefer"] == "count=exact"
    assert headers["range"] == "0-0"
    assert headers["apikey"] == FAKE_KEY


def test_fetch_table_count_reads_total_from_content_range() -> None:
    calls: list[str] = []

    def opener(request, timeout=None):
        calls.append(request.full_url)
        return FakeResponse(1234)

    total = check.fetch_table_count(
        BASE_URL, FAKE_KEY, "yatco_global_listings", opener=opener
    )

    assert total == 1234
    assert calls == [f"{BASE_URL}/rest/v1/yatco_global_listings?select=id"]


def test_server_error_is_retried_then_succeeds() -> None:
    attempts: list[int] = []
    slept: list[float] = []

    def opener(request, timeout=None):
        attempts.append(1)
        if len(attempts) == 1:
            raise _http_error(500, "upstream boom")
        return FakeResponse(7)

    total = check.fetch_table_count(
        BASE_URL,
        FAKE_KEY,
        "yatco_scrape_runs",
        opener=opener,
        sleeper=slept.append,
    )

    assert total == 7
    assert len(attempts) == 2
    assert len(slept) == 1
    assert 0 < slept[0] <= check.BACKOFF_CAP_SECONDS


def test_client_error_fails_immediately_without_leaking_the_key() -> None:
    attempts: list[int] = []
    slept: list[float] = []

    def opener(request, timeout=None):
        attempts.append(1)
        raise _http_error(401, f"invalid key {FAKE_KEY}")

    with pytest.raises(check.CheckError) as excinfo:
        check.fetch_table_count(
            BASE_URL,
            FAKE_KEY,
            "yatco_global_listings",
            opener=opener,
            sleeper=slept.append,
        )

    message = str(excinfo.value)
    assert len(attempts) == 1, "a 4xx answer must not be retried"
    assert slept == []
    assert FAKE_KEY not in message
    assert "yatco_global_listings" in message
