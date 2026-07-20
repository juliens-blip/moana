"""Apify-backed adverse-media (negative-news) screening.

Fills the KYC report's ``adverse_media`` array via the
``regdata/adverse-media-screener`` actor: it runs open-web news/web searches with
adverse-term expansion, de-duplicates candidate articles, and uses an LLM
classifier to triage genuine adverse hits. Each hit carries its own source URL,
so — unlike LLM-synthesised claims — adverse items are independently sourced and
do not need to match the worker's pre-collected evidence set.

Two anti-defamation guards live here (a third, the identity gate, lives in
kyc_worker.enrich_adverse_media):
1. ``entityRole`` — a hit where the subject is the victim/plaintiff/witness (not the
   party implicated) is dropped: we never present the lead as a wrongdoer for an
   article where they are the injured party.
2. ``entityMatchConfidence`` — the actor's own confidence that the article is about
   this entity; low-confidence hits (likely homonyms) are dropped.

This module is pure/normalisable and never raises: ``screen_adverse_media`` returns
``[]`` on any failure. Charge is hard-capped (PAY_PER_EVENT actor).
"""

from __future__ import annotations

import logging
from datetime import timedelta
from decimal import Decimal
from typing import Any

from apify_client import ApifyClientAsync

LOGGER = logging.getLogger("moana.kyc.adverse_media")

DEFAULT_ADVERSE_MEDIA_ACTOR_ID = "regdata/adverse-media-screener"
ADVERSE_MEDIA_MAX_CHARGE_USD = Decimal("0.50")
RUN_TIMEOUT = timedelta(seconds=280)

# Report's adverse_media.category enum.
_REPORT_CATEGORIES = {"fiscal", "civil", "commercial", "regulatory", "criminal", "reputational"}
# Actor riskCategory -> report category.
_CATEGORY_MAP = {
    "financial_crime": "criminal",
    "fraud": "criminal",
    "money_laundering": "criminal",
    "corruption": "criminal",
    "bribery": "criminal",
    "terrorism": "criminal",
    "organized_crime": "criminal",
    "sanctions": "regulatory",
    "regulatory_enforcement": "regulatory",
    "regulatory": "regulatory",
    "litigation": "civil",
    "tax": "fiscal",
    "fiscal": "fiscal",
    "environmental": "reputational",
    "reputational": "reputational",
    "other": "reputational",
}
_CONFIDENCE_LEVELS = {"high", "medium", "low"}
# entityRole values where the subject is NOT the implicated party -> drop (anti-defamation).
_NON_ADVERSE_ROLES = {"victim", "plaintiff", "complainant", "witness", "bystander", "unrelated"}


def _map_category(actor_category: Any) -> str:
    """Map an actor riskCategory onto the report's category enum (default reputational)."""
    key = str(actor_category or "").strip().lower().replace(" ", "_").replace("-", "_")
    return _CATEGORY_MAP.get(key, "reputational")


def _map_confidence(severity: Any) -> str:
    """Map an actor severity onto the report's confidence enum (default low)."""
    key = str(severity or "").strip().lower()
    return key if key in _CONFIDENCE_LEVELS else "low"


def _is_subject_adverse(entity_role: Any) -> bool:
    """False when the subject is the injured/uninvolved party (never frame as wrongdoer)."""
    return str(entity_role or "").strip().lower() not in _NON_ADVERSE_ROLES


def _normalize_hit(hit: Any, jurisdiction: str = "") -> dict[str, Any] | None:
    """Map one actor hit onto a report adverse_media item. Pure; unit-testable.

    Returns ``None`` when the hit has no source URL, when the subject is not the
    adverse party, or when the actor's entity-match confidence is low (homonym).
    """
    if not isinstance(hit, dict):
        return None
    url = str(hit.get("url") or "").strip()
    if not url:
        return None
    if not _is_subject_adverse(hit.get("entityRole")):
        return None
    if str(hit.get("entityMatchConfidence") or "").strip().lower() == "low":
        return None
    return {
        "category": _map_category(hit.get("riskCategory")),
        "title": str(hit.get("title") or "").strip()[:300],
        "summary": str(hit.get("snippet") or "").strip()[:1000],
        "date": str(hit.get("publishedDate") or "").strip()[:50],
        "jurisdiction": str(jurisdiction or "").strip()[:100],
        "confidence": _map_confidence(hit.get("severity")),
        "status_type": "media_report",
        "source_url": url,
    }


def _normalize_items(items: list[Any]) -> list[dict[str, Any]]:
    """Flatten actor per-entity items into de-duplicated report adverse_media items."""
    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    for item in items:
        if not isinstance(item, dict):
            continue
        jurisdiction = str(item.get("country") or "").strip()
        hits = item.get("hits")
        for hit in hits if isinstance(hits, list) else []:
            normalized = _normalize_hit(hit, jurisdiction)
            if not normalized:
                continue
            key = normalized["source_url"]
            if key in seen:
                continue
            seen.add(key)
            out.append(normalized)
    return out


async def screen_adverse_media(
    entity_names: list[str],
    entity_type: str,
    country: str,
    aliases: list[str],
    api_token: str,
    actor_id: str = DEFAULT_ADVERSE_MEDIA_ACTOR_ID,
    min_severity: str = "low",
    max_hits: int = 25,
) -> list[dict[str, Any]]:
    """Screen entities for adverse media via Apify; never raises. Returns [] on failure.

    The actor is self-contained (its own Serper/OpenRouter keys), PAY_PER_EVENT;
    charge is hard-capped by ADVERSE_MEDIA_MAX_CHARGE_USD.
    """
    if not api_token:
        return []
    names = [n.strip() for n in entity_names if isinstance(n, str) and n.strip()]
    if not names:
        return []
    run_input: dict[str, Any] = {
        "entityNames": names,
        "entityType": entity_type if entity_type in {"auto", "person", "company"} else "auto",
        "minSeverity": min_severity if min_severity in {"low", "medium", "high"} else "low",
        "maxHits": max_hits if isinstance(max_hits, int) and max_hits > 0 else 25,
    }
    clean_aliases = [a.strip() for a in aliases if isinstance(a, str) and a.strip()]
    if clean_aliases:
        run_input["aliases"] = clean_aliases
    if country.strip():
        run_input["country"] = country.strip()

    client = ApifyClientAsync(api_token)
    try:
        run = await client.actor(actor_id).call(
            run_input=run_input,
            max_total_charge_usd=ADVERSE_MEDIA_MAX_CHARGE_USD,
            timeout=RUN_TIMEOUT,
        )
    except Exception as exc:  # pragma: no cover - provider-specific network/API failures
        LOGGER.warning("Apify adverse-media screen failed: %s", exc.__class__.__name__)
        return []
    if run is None or not run.default_dataset_id:
        return []
    try:
        items = [item async for item in client.dataset(run.default_dataset_id).iterate_items()]
    except Exception as exc:  # pragma: no cover - provider-specific network/API failures
        LOGGER.warning("Apify adverse-media dataset read failed: %s", exc.__class__.__name__)
        return []
    return _normalize_items(items)
