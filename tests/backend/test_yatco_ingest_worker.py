"""Tests hors réseau du worker d'ingestion YATCO : ``post`` est monkeypatché
par une table Supabase simulée en mémoire, aucune connexion réelle n'est
ouverte (même pattern que ``fetch_url`` monkeypatché dans
``scripts/test_yatco_collector.py``). Les annonces viennent de
``scripts.yatco_collector.parse_listing`` appliqué à la fixture HTML déjà
utilisée par ce module, pour une forme normalisée réelle plutôt qu'inventée.
"""

from __future__ import annotations

import json

import pytest

from scripts.test_yatco_collector import _listing_html
from scripts.yatco_collector import parse_listing
from workers.yatco_ingest_worker import (
    ConfigurationError,
    Settings,
    build_row,
    ingest_listings,
    validate_external_id,
)


def _settings(**overrides) -> Settings:
    values = {
        "supabase_url": "https://project.supabase.co",
        "supabase_service_key": "test-service-role-key",
        "timeout_s": 5.0,
        "max_retries": 2,
        "backoff_base_s": 0.0,
        "backoff_cap_s": 0.0,
    }
    values.update(overrides)
    return Settings(**values)


def _listing(external_id: str) -> dict:
    html = _listing_html(external_id)
    return parse_listing(html, f"https://www.yatco.com/yacht/x-{external_id}/")


class _FakeSupabase:
    """Table en mémoire répliquant l'upsert PostgREST sur dedup_key."""

    def __init__(self, fail_statuses: dict[str, int] | None = None, fail_times: int = 0) -> None:
        self.rows: dict[str, dict] = {}
        self.calls: list[tuple[str, dict[str, str]]] = []
        self.fail_statuses = fail_statuses or {}
        self.fail_times = fail_times
        self._attempts: dict[str, int] = {}

    def post(self, url: str, headers: dict[str, str], body: bytes, timeout: float) -> tuple[int, bytes]:
        assert "on_conflict=dedup_key" in url
        assert headers["Authorization"] == "Bearer test-service-role-key"
        payload = json.loads(body)[0]
        assert "dedup_key" not in payload
        self.calls.append((url, headers))

        external_id = payload["external_id"]
        if external_id in self.fail_statuses:
            self._attempts[external_id] = self._attempts.get(external_id, 0) + 1
            if self._attempts[external_id] <= self.fail_times:
                status = self.fail_statuses[external_id]
                return status, json.dumps({"message": "boom"}).encode("utf-8")

        dedup_key = f"{payload['source'].lower()}:{payload['external_id'].lower()}"
        self.rows[dedup_key] = payload
        return 201, json.dumps([payload]).encode("utf-8")


def test_validate_external_id_rejects_missing_or_blank():
    assert validate_external_id({"external_id": "457094"}) == "457094"
    assert validate_external_id({"external_id": None}) is None
    assert validate_external_id({"external_id": "  "}) is None
    assert validate_external_id({}) is None


def test_build_row_never_includes_dedup_key_and_maps_known_fields():
    listing = _listing("454180")
    row = build_row(listing, "454180", "2026-08-14T22:00:00+00:00")

    assert "dedup_key" not in row
    assert row["external_id"] == "454180"
    assert row["boat_name"] == "CARPE DIEM"
    assert row["broker_company"] == "TJB Super Yachts Ltd"
    assert row["last_seen_at"] == "2026-08-14T22:00:00+00:00"
    assert row["raw_payload"] == listing


def test_ingest_listings_maps_fields_and_stable_source_external_id_key():
    fake = _FakeSupabase()
    settings = _settings()
    listing = _listing("454180")

    summary = ingest_listings([listing], settings, post=fake.post)

    assert summary.written == [{"source": "yatco", "external_id": "454180"}]
    assert summary.dead_letters == []
    assert set(fake.rows) == {"yatco:454180"}
    assert fake.rows["yatco:454180"]["boat_name"] == "CARPE DIEM"


def test_ingest_listings_reinjection_is_idempotent_single_row_per_key():
    fake = _FakeSupabase()
    settings = _settings()
    listings = [_listing("454180"), _listing("441909")]

    first = ingest_listings(listings, settings, post=fake.post)
    second = ingest_listings(listings, settings, post=fake.post)

    assert len(first.written) == 2
    assert len(second.written) == 2
    assert len(fake.rows) == 2, "a second injection of the same fixture must not create duplicates"
    assert set(fake.rows) == {"yatco:454180", "yatco:441909"}


def test_ingest_listings_sends_no_dedup_key_across_the_whole_fixture():
    fake = _FakeSupabase()
    settings = _settings()
    listings = [_listing(eid) for eid in ("454180", "441909", "457094", "483964")]

    ingest_listings(listings, settings, post=fake.post)

    assert len(fake.calls) == 4


def test_ingest_listings_missing_external_id_goes_to_dead_letter_without_blocking():
    fake = _FakeSupabase()
    settings = _settings()
    broken = _listing("454180")
    broken["external_id"] = None
    healthy = _listing("441909")

    summary = ingest_listings([broken, healthy], settings, post=fake.post)

    assert summary.written == [{"source": "yatco", "external_id": "441909"}]
    assert len(summary.dead_letters) == 1
    assert summary.dead_letters[0].reason == "missing_external_id"
    assert summary.dead_letters[0].listing is broken


def test_ingest_listings_non_dict_goes_to_dead_letter_without_blocking():
    fake = _FakeSupabase()
    settings = _settings()
    broken = "not-a-listing"
    healthy = _listing("441909")

    summary = ingest_listings([broken, healthy], settings, post=fake.post)

    assert summary.written == [{"source": "yatco", "external_id": "441909"}]
    assert len(summary.dead_letters) == 1
    assert summary.dead_letters[0].reason == "invalid_listing_type"
    assert summary.dead_letters[0].listing is broken


def test_ingest_listings_retries_transient_error_then_succeeds():
    fake = _FakeSupabase(fail_statuses={"454180": 503}, fail_times=2)
    settings = _settings(max_retries=3)
    listing = _listing("454180")

    summary = ingest_listings([listing], settings, post=fake.post)

    assert summary.written == [{"source": "yatco", "external_id": "454180"}]
    assert summary.dead_letters == []
    assert fake._attempts["454180"] == 3


def test_ingest_listings_definitive_failure_goes_to_dead_letter_without_blocking_others():
    fake = _FakeSupabase(fail_statuses={"454180": 400}, fail_times=99)
    settings = _settings(max_retries=2)
    broken = _listing("454180")
    healthy = _listing("441909")

    summary = ingest_listings([broken, healthy], settings, post=fake.post)

    assert summary.written == [{"source": "yatco", "external_id": "441909"}]
    assert len(summary.dead_letters) == 1
    assert summary.dead_letters[0].reason == "http_400"
    # 400 is not transient: exactly one attempt, no retry burned on it.
    assert fake._attempts["454180"] == 1


def test_ingest_listings_bounded_retries_on_persistent_transient_error():
    fake = _FakeSupabase(fail_statuses={"454180": 503}, fail_times=99)
    settings = _settings(max_retries=2)
    listing = _listing("454180")

    summary = ingest_listings([listing], settings, post=fake.post)

    assert summary.written == []
    assert summary.dead_letters[0].reason == "http_503"
    assert fake._attempts["454180"] == settings.max_retries + 1


def test_settings_from_env_requires_supabase_credentials(monkeypatch):
    monkeypatch.delenv("NEXT_PUBLIC_SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)
    with pytest.raises(ConfigurationError):
        Settings.from_env()
