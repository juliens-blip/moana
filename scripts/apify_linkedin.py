"""Apify-backed LinkedIn profile search.

Replaces the self-hosted Playwright/session adapter, which stayed blocked by
LinkedIn (HTTP 999) even through a residential proxy — see
tasks/kyc-multi-source-screening/proxy.md. Apify's own infrastructure reaches
LinkedIn directly; this module only calls a name-search actor and normalizes
its output into the evidence-document shape the rest of the worker expects.

Common names return several LinkedIn homonyms (verified: "Gaetano Nicolosi"
alone resolves to at least 10 different people). ``search_profiles`` never
trusts Apify's top result blindly and never returns an anonymous homonym.
Selection order, per tasks/kyc-multi-source-screening/cahier-des-charges-linkedin.md:

1. Corroborated by the query's own context (company/country/city mentioned
   in the candidate's position or location text).
2. Failing that, rank the remaining candidates by an "apparent importance"
   score (seniority of the title, plus a yachting/maritime bonus) and keep
   the highest-scoring ones. A candidate with no seniority or yachting
   signal at all scores zero and is dropped — but there is no requirement to
   specifically be an owner/CEO; any senior-looking title outranks a junior
   one.

Lead sources (verified: a real Boats Group/YATCO webhook payload) sometimes
swap first/last name — a query for "Paturel David" finds nothing because the
real person is "David Paturel". If the first attempt yields nothing,
``search_profiles`` retries once with the two name tokens swapped.

Once a candidate is selected, it was only searched in ``mode`` (typically
"Short": name, headline, location only, no bio). A second, targeted Apify
call re-fetches the same name in "Full" mode and, if the same
``linkedinUrl`` reappears, swaps in the richer profile (about section, exact
city/country, current position) — this costs one extra Apify event only for
the actually-selected candidate(s), not the whole discovery pool.

YACHTING_TERMS mirrors the exact term set used by
scripts/kyc_worker.py::evidence_signals() ("proximité yachting" signal) to
keep one vocabulary across the KYC pipeline. It can't be imported from there
(kyc_worker.py already imports this module, so the reverse import would be
circular) — keep both copies in sync if the terms change.
"""

from __future__ import annotations

import logging
import unicodedata
from datetime import timedelta
from decimal import Decimal
from typing import Any

from apify_client import ApifyClientAsync

LOGGER = logging.getLogger("moana.kyc.linkedin")

MAX_CHARGE_USD = Decimal("0.20")
RUN_TIMEOUT = timedelta(seconds=180)
SHORT_MODE_POOL = 10  # "Short" mode bills per search page (<=10 profiles) at a flat rate.
FULL_MODE_ENRICH_POOL = 10  # Wide enough that the already-selected candidate is likely re-found.
RICH_MODES = {"Full", "Full + email search"}

YACHTING_TERMS = (
    "yacht",
    "yachting",
    "superyacht",
    "charter",
    "marina",
    "maritime",
    "naval",
    "vessel",
)
YACHTING_SCORE = 2

# Broad seniority ranking, not limited to owners/founders: any senior-looking
# title should be able to outrank a junior homonym. Highest tier wins when a
# title matches several (e.g. "founder and CEO" only counts once, at tier 3).
SENIORITY_TIERS: tuple[tuple[int, tuple[str, ...]], ...] = (
    (
        3,
        (
            "chief executive",
            "ceo",
            "founder",
            "owner",
            "chairman",
            "president",
            "presidente",
            "amministratore unico",
            "fondateur",
            "fondatore",
        ),
    ),
    (
        2,
        (
            "managing director",
            "general manager",
            "director",
            "administrateur",
            "amministratore",
            "dirigeant",
            "gérant",
            "gerant",
            "vice president",
            "vice-president",
            "partner",
            "entrepreneur",
            "investor",
            "investisseur",
        ),
    ),
    (
        1,
        (
            "head of",
            "senior",
            "responsable",
            "manager",
        ),
    ),
)


def split_name(full_name: str) -> tuple[str, str] | None:
    parts = full_name.split()
    if len(parts) < 2:
        return None
    return parts[0], " ".join(parts[1:])


def _comparable(value: str) -> str:
    decomposed = unicodedata.normalize("NFKD", value.casefold())
    return "".join(char for char in decomposed if not unicodedata.combining(char))


def _location_text(item: dict[str, Any]) -> str:
    location = item.get("location")
    if not isinstance(location, dict):
        return ""
    parsed = location.get("parsed")
    if isinstance(parsed, dict) and parsed.get("text"):
        return str(parsed["text"])
    return str(location.get("linkedinText") or "")


def _current_position_lines(item: dict[str, Any]) -> list[str]:
    positions = item.get("currentPosition")
    if not isinstance(positions, list):
        return []
    lines: list[str] = []
    for entry in positions[:2]:
        if not isinstance(entry, dict):
            continue
        title = str(entry.get("position") or "").strip()
        company = str(entry.get("companyName") or "").strip()
        line = " - ".join(part for part in (title, company) if part)
        if line:
            lines.append(line)
    return lines


def _about_excerpt(item: dict[str, Any]) -> str:
    about = item.get("about")
    if not isinstance(about, str) or not about.strip():
        return ""
    # Collapse to one line: downstream code (professional_statement) scans the
    # evidence text line by line looking for a role title, and a raw multi-
    # paragraph bio fragments into dozens of candidate lines that can win that
    # scan out of context (e.g. one unrelated sentence from a long essay).
    return " ".join(about.split())[:400].rstrip()


def _profile_name(item: dict[str, Any]) -> str:
    name = str(item.get("name") or "").strip()
    if name:
        return name
    return " ".join(part for part in (item.get("firstName"), item.get("lastName")) if part).strip()


def _profile_text(item: dict[str, Any]) -> str:
    headline = str(item.get("headline") or item.get("position") or "").strip()
    lines = [_profile_name(item), headline]
    location = _location_text(item)
    if location:
        lines.append(f"Location: {location}")
    about = _about_excerpt(item)
    if about:
        lines.append(f"About: {about}")
    lines.extend(_current_position_lines(item))
    return "\n".join(line for line in lines if line).strip()


def _to_profile(item: dict[str, Any]) -> dict[str, Any] | None:
    if not isinstance(item, dict):
        return None
    url = str(item.get("linkedinUrl") or "").strip()
    name = _profile_name(item)
    text = _profile_text(item)
    if not url or not name or len(text) < 5:
        return None
    return {"url": url, "name": name, "text": text}


def _is_corroborated(profile: dict[str, Any], context_terms: list[str]) -> bool:
    haystack = _comparable(profile["text"])
    return any(term in haystack for term in context_terms)


def _importance_score(profile: dict[str, Any]) -> int:
    haystack = _comparable(profile["text"])
    seniority = 0
    for tier_score, terms in SENIORITY_TIERS:
        if any(term in haystack for term in terms):
            seniority = tier_score
            break
    yachting = YACHTING_SCORE if any(term in haystack for term in YACHTING_TERMS) else 0
    return seniority + yachting


async def _run_actor(
    api_token: str,
    actor_id: str,
    mode: str,
    first_name: str,
    last_name: str,
    fetch_count: int,
) -> list[dict[str, Any]]:
    """One Apify actor call; returns raw candidate profiles, never raises."""
    client = ApifyClientAsync(api_token)
    run_input = {
        "profileScraperMode": mode,
        "firstName": first_name,
        "lastName": last_name,
        "maxItems": fetch_count,
    }
    try:
        run = await client.actor(actor_id).call(
            run_input=run_input,
            max_items=fetch_count,
            max_total_charge_usd=MAX_CHARGE_USD,
            timeout=RUN_TIMEOUT,
        )
    except Exception as exc:  # pragma: no cover - provider-specific network/API failures
        LOGGER.warning("Apify LinkedIn search failed: %s", exc.__class__.__name__)
        return []
    if run is None or not run.default_dataset_id:
        LOGGER.warning("Apify LinkedIn search returned no run")
        return []

    candidates: list[dict[str, Any]] = []
    try:
        async for item in client.dataset(run.default_dataset_id).iterate_items():
            profile = _to_profile(item)
            if profile:
                candidates.append(profile)
            if len(candidates) >= fetch_count:
                break
    except Exception as exc:  # pragma: no cover - provider-specific network/API failures
        LOGGER.warning("Apify LinkedIn dataset read failed: %s", exc.__class__.__name__)
        return []
    return candidates


def _select(
    candidates: list[dict[str, Any]],
    max_profiles: int,
    context_terms: list[str],
    full_name: str,
) -> list[dict[str, Any]]:
    if context_terms:
        corroborated = [profile for profile in candidates if _is_corroborated(profile, context_terms)]
        if corroborated:
            return corroborated[:max_profiles]

    ranked = sorted(candidates, key=_importance_score, reverse=True)
    most_important = [profile for profile in ranked if _importance_score(profile) > 0]
    if not most_important and candidates:
        LOGGER.info(
            "Apify LinkedIn search found %d candidate(s) for %r but none were corroborated or notable; skipping",
            len(candidates),
            full_name,
        )
    return most_important[:max_profiles]


async def _enrich(
    profile: dict[str, Any],
    first_name: str,
    last_name: str,
    api_token: str,
    actor_id: str,
) -> dict[str, Any]:
    """Best-effort re-fetch of one already-selected candidate in Full mode."""
    full_candidates = await _run_actor(api_token, actor_id, "Full", first_name, last_name, FULL_MODE_ENRICH_POOL)
    for candidate in full_candidates:
        if candidate["url"] == profile["url"]:
            return candidate
    return profile


async def search_profiles(
    full_name: str,
    api_token: str,
    actor_id: str,
    mode: str,
    max_profiles: int,
    company_name: str = "",
    country: str = "",
    city: str = "",
) -> list[dict[str, Any]]:
    """Search LinkedIn by name via Apify; never raises on provider failures."""
    if max_profiles <= 0 or not api_token:
        return []
    parsed = split_name(full_name)
    if parsed is None:
        return []
    first_name, last_name = parsed

    fetch_count = SHORT_MODE_POOL if mode == "Short" else max_profiles
    fetch_count = max(fetch_count, max_profiles)
    context_terms = [_comparable(value) for value in (company_name, country, city) if value.strip()]

    name_orders = [(first_name, last_name), (last_name, first_name)]
    selected: list[dict[str, Any]] = []
    for attempt_first, attempt_last in name_orders:
        candidates = await _run_actor(api_token, actor_id, mode, attempt_first, attempt_last, fetch_count)
        selected = _select(candidates, max_profiles, context_terms, full_name)
        if selected:
            first_name, last_name = attempt_first, attempt_last
            break

    if selected and mode not in RICH_MODES:
        selected = [await _enrich(profile, first_name, last_name, api_token, actor_id) for profile in selected]
    return selected
