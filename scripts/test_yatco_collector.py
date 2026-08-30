"""Tests hors réseau du collecteur YATCO : parsing sur fixture HTML,
pagination/dédoublonnage, checkpoint/reprise et backoff borné.

Aucun test ne sort sur le réseau : `fetch_url` est toujours monkeypatché ou
appelé contre `urlopen` simulé.
"""

from __future__ import annotations

import re
import time
import urllib.error
from pathlib import Path

import pytest

from scripts.yatco_collector import (
    CheckpointStore,
    Settings,
    fetch_url,
    iter_pages,
    parse_listing,
)

FIXTURE_PATH = Path(__file__).parent / "fixtures" / "yatco_pages.html"

_PAGE_RE = re.compile(r"<!-- PAGE (\d+) -->(.*?)<!-- END PAGE \1 -->", re.S)
_LISTING_RE = re.compile(r"<!-- LISTING dedup:yatco:(\d+) -->(.*?)(?=<!-- LISTING|\Z)", re.S)


def _load_fixture_pages() -> dict[int, dict[str, str]]:
    """page_number -> {external_id: listing_html}."""
    text = FIXTURE_PATH.read_text(encoding="utf-8")
    pages: dict[int, dict[str, str]] = {}
    for page_match in _PAGE_RE.finditer(text):
        page_number = int(page_match.group(1))
        body = page_match.group(2)
        listings = {m.group(1): m.group(2) for m in _LISTING_RE.finditer(body)}
        pages[page_number] = listings
    return pages


FIXTURE_PAGES = _load_fixture_pages()


def _listing_html(external_id: str) -> str:
    for listings in FIXTURE_PAGES.values():
        if external_id in listings:
            return listings[external_id]
    raise KeyError(external_id)


def test_fixture_has_three_pages_with_all_variants():
    assert set(FIXTURE_PAGES) == {1, 2, 3}
    assert sum(len(listings) for listings in FIXTURE_PAGES.values()) == 4


def test_parse_listing_fixture_full_broker_agent_and_spec_sheet():
    html = _listing_html("454180")
    listing = parse_listing(html, "https://www.yatco.com/yacht/102-59-azimut-yachts-commercial-vessel-2023-454180/")

    assert listing["listing_url"].endswith("454180/")
    assert listing["external_id"] == "454180"
    assert listing["boat_name"] == "CARPE DIEM"
    assert listing["builder"] == "AZIMUT YACHTS"
    assert listing["model_year"] == 2023
    assert listing["length_m"] == pytest.approx(31.27)
    assert listing["price_amount"] == pytest.approx(11300000)
    assert listing["price_currency"] == "USD"
    assert listing["city"] == "Miami"
    assert listing["country"] == "United States"
    assert listing["country_code"] == "US"
    assert listing["broker_name"] == "Tim Johnson"
    assert listing["broker_company"] == "TJB Super Yachts Ltd"
    assert listing["agent_name"] == "Georgie Damianakis"
    assert listing["spec_sheet_url"] == "https://cloud.yatco.com/specs/454180.pdf"


def test_parse_listing_fixture_single_broker_no_spec_sheet():
    html = _listing_html("441909")
    listing = parse_listing(html, "https://www.yatco.com/yacht/377-33-lurssen-motor-yacht-2003-441909/")

    assert listing["broker_name"] == "Elena Petrova"
    assert listing["broker_company"] == "Ocean Independence"
    assert listing["agent_name"] is None
    assert listing["spec_sheet_url"] is None
    assert listing["country_code"] == "MC"


def test_parse_listing_fixture_missing_source_fields_stay_null():
    html = _listing_html("457094")
    listing = parse_listing(html, "https://www.yatco.com/yacht/39-meridian-motor-yacht-2006-457094/")

    assert listing["external_id"] == "457094"
    assert listing["boat_name"] == "BLUE HORIZON"
    assert listing["model_year"] is None
    assert listing["length_m"] is None
    assert listing["price_amount"] is None
    assert listing["price_currency"] is None
    assert listing["city"] is None
    assert listing["country_code"] is None
    assert listing["broker_name"] is None
    assert listing["spec_sheet_url"] is None


def test_parse_listing_fixture_alternate_country_and_email():
    html = _listing_html("483964")
    listing = parse_listing(html, "https://www.yatco.com/yacht/105-25-holland-jachtbouw-motor-yacht-2004-483964/")

    assert listing["country"] == "United Kingdom"
    assert listing["country_code"] == "GB"
    assert listing["broker_name"] == "James Fitzgerald"
    assert listing["agent_email"] == "james.fitzgerald@camperandnicholsons.example"


def test_parse_listing_extracts_broker_specification_fields_and_brochure_endpoint():
    html = '''
      <body class="vessel_status_on_the_market">
        <div><span>Boat Model</span><span>50 Pilothouse</span></div>
        <div><span>Cabins</span><span>2</span></div>
        <input type="hidden" name="BrochureUrl" value="https://www.yatcoboss.com/ForSale/PDF/PDFCreateOnDemand?enc=abc&amp;x=1">
      </body>
    '''
    listing = parse_listing(html, "https://www.yatco.com/yacht/50-symbol-483828/")
    assert listing["model"] == "50 Pilothouse"
    assert listing["cabins"] == 2
    assert listing["listing_status"] == "On The Market"
    assert listing["spec_sheet_url"] == "https://www.yatcoboss.com/ForSale/PDF/PDFCreateOnDemand?enc=abc&x=1"


def _entries_from_fixture() -> list[dict[str, str]]:
    return [
        {"url": f"https://www.yatco.com/yacht/x-{external_id}/", "lastmod": "2026-01-01"}
        for page in sorted(FIXTURE_PAGES)
        for external_id in FIXTURE_PAGES[page]
    ]


def _fake_fetch_factory(call_log: list[str]):
    def _fake_fetch(url: str, settings: Settings) -> str:
        call_log.append(url)
        external_id = url.rstrip("/").rsplit("-", 1)[-1]
        return _listing_html(external_id)

    return _fake_fetch


def test_iter_pages_paginates_and_dedups_without_network(tmp_path):
    entries = _entries_from_fixture()
    # URL dupliquée dans le même lot (page 0) : ne doit être fetchée qu'une
    # fois, le reste des pages garde ses tailles normales.
    entries.insert(1, entries[0])

    settings = Settings()
    object.__setattr__(settings, "page_size", 2)
    object.__setattr__(settings, "request_delay_s", 0.0)
    checkpoint = CheckpointStore(tmp_path / "checkpoint.json", market="global")

    call_log: list[str] = []
    fake_fetch = _fake_fetch_factory(call_log)

    pages = list(iter_pages(entries, settings, checkpoint, fetch=fake_fetch))

    assert len(pages) == 3
    assert [idx for idx, _ in pages] == [0, 1, 2]
    assert [len(listings) for _, listings in pages] == [1, 2, 1]
    assert call_log.count(entries[0]["url"]) == 1


def test_resume_without_recollection(tmp_path):
    entries = _entries_from_fixture()
    settings = Settings()
    object.__setattr__(settings, "page_size", 2)
    object.__setattr__(settings, "request_delay_s", 0.0)
    checkpoint_path = tmp_path / "checkpoint.json"

    call_log: list[str] = []
    fake_fetch = _fake_fetch_factory(call_log)

    checkpoint = CheckpointStore(checkpoint_path, market="global")
    pages_iter = iter_pages(entries, settings, checkpoint, fetch=fake_fetch)
    first_page_index, first_page = next(pages_iter)
    assert first_page_index == 0
    assert len(first_page) == 2
    assert checkpoint.is_done(0)
    assert not checkpoint.is_done(1)

    # "Interruption" : on abandonne l'itérateur ici, comme un crash après la
    # page 0. Une nouvelle exécution recharge le checkpoint depuis le disque.
    calls_before_resume = list(call_log)

    resumed_checkpoint = CheckpointStore(checkpoint_path, market="global")
    resumed_pages = list(iter_pages(entries, settings, resumed_checkpoint, fetch=fake_fetch))

    assert len(resumed_pages) == 1  # seule la page 1 restait à faire
    # L'index de page réel (1) doit voyager avec le lot, pas être renuméroté
    # à 0 par un enumerate() côté appelant — sinon la reprise écraserait le
    # fichier de sortie de la page 0 déjà écrite.
    assert [idx for idx, _ in resumed_pages] == [1]
    assert [len(listings) for _, listings in resumed_pages] == [2]
    # Aucune URL de la page 0 n'a été refetchée pendant la reprise.
    page_0_urls = {e["url"] for e in entries[:2]}
    assert not (page_0_urls & set(call_log[len(calls_before_resume):]))


def test_checkpoint_is_reset_for_a_new_collection_run(tmp_path):
    checkpoint_path = tmp_path / "checkpoint.json"
    first = CheckpointStore(checkpoint_path, market="global", run_key="2026-08-30")
    first.mark_done(0)

    next_run = CheckpointStore(checkpoint_path, market="global", run_key="2026-08-31")
    assert not next_run.is_done(0)


def test_fetch_url_retries_with_bounded_exponential_backoff(monkeypatch):
    settings = Settings()
    object.__setattr__(settings, "max_retries", 3)
    object.__setattr__(settings, "backoff_base_s", 1.0)
    object.__setattr__(settings, "backoff_cap_s", 4.0)
    object.__setattr__(settings, "request_delay_s", 0.0)

    attempts = {"count": 0}
    sleeps: list[float] = []

    def fake_urlopen(request, timeout):
        attempts["count"] += 1
        if attempts["count"] < 3:
            raise urllib.error.HTTPError(request.full_url, 503, "unavailable", None, None)

        class _Resp:
            def __enter__(self_inner):
                return self_inner

            def __exit__(self_inner, *exc):
                return False

            def read(self_inner):
                return b"ok"

        return _Resp()

    monkeypatch.setattr("scripts.yatco_collector.urllib.request.urlopen", fake_urlopen)
    monkeypatch.setattr(time, "sleep", lambda s: sleeps.append(s))

    result = fetch_url("https://www.yatco.com/yacht/fake/", settings)

    assert result == "ok"
    assert attempts["count"] == 3
    # Le backoff (hors délai de throttle, désactivé ici) reste borné par le
    # plafond configuré, marge de jitter incluse.
    assert all(s <= settings.backoff_cap_s * 1.1 for s in sleeps)


def test_iter_pages_skips_dead_sitemap_entry_without_crashing_page(tmp_path):
    entries = _entries_from_fixture()
    settings = Settings()
    object.__setattr__(settings, "page_size", 2)
    object.__setattr__(settings, "request_delay_s", 0.0)
    checkpoint = CheckpointStore(tmp_path / "checkpoint.json", market="global")

    dead_url = entries[0]["url"]

    def flaky_fetch(url: str, settings: Settings) -> str:
        if url == dead_url:
            raise urllib.error.HTTPError(url, 403, "forbidden", None, None)
        external_id = url.rstrip("/").rsplit("-", 1)[-1]
        return _listing_html(external_id)

    pages = list(iter_pages(entries, settings, checkpoint, fetch=flaky_fetch))

    assert [len(listings) for _, listings in pages] == [1, 2]  # page 0 perd l'annonce morte
    assert checkpoint.is_done(0) and checkpoint.is_done(1)


def test_fetch_url_gives_up_after_max_retries_without_hitting_network(monkeypatch):
    settings = Settings()
    object.__setattr__(settings, "max_retries", 2)
    object.__setattr__(settings, "backoff_base_s", 0.01)
    object.__setattr__(settings, "backoff_cap_s", 0.02)
    object.__setattr__(settings, "request_delay_s", 0.0)

    def always_fail(request, timeout):
        raise urllib.error.HTTPError(request.full_url, 500, "error", None, None)

    monkeypatch.setattr("scripts.yatco_collector.urllib.request.urlopen", always_fail)
    monkeypatch.setattr(time, "sleep", lambda s: None)

    with pytest.raises(urllib.error.HTTPError):
        fetch_url("https://www.yatco.com/yacht/fake/", settings)
