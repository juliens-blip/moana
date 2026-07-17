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
2. Failing that, "notable" candidates only: a leadership/decision-maker role,
   or a yachting/maritime industry position. Everything else is dropped.

LEADERSHIP_TERMS and YACHTING_TERMS mirror the exact term sets used by
scripts/kyc_worker.py::evidence_signals() ("profil économique documenté" and
"proximité yachting" signals) to keep one vocabulary across the KYC
pipeline. They can't be imported from there (kyc_worker.py already imports
this module, so the reverse import would be circular) — keep both copies in
sync if the terms change.
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

LEADERSHIP_TERMS = (
    "chief executive",
    "ceo",
    "founder",
    "owner",
    "chairman",
    "managing director",
    "entrepreneur",
    "investor",
    "family office",
    "dirigeant",
    "fondateur",
    "investisseur",
)
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


def split_name(full_name: str) -> tuple[str, str] | None:
    parts = full_name.split()
    if len(parts) < 2:
        return None
    return parts[0], " ".join(parts[1:])


def _comparable(value: str) -> str:
    decomposed = unicodedata.normalize("NFKD", value.casefold())
    return "".join(char for char in decomposed if not unicodedata.combining(char))


def _profile_text(item: dict[str, Any]) -> str:
    location = item.get("location")
    location_text = location.get("linkedinText", "") if isinstance(location, dict) else ""
    lines = [str(item.get("name") or ""), str(item.get("position") or ""), location_text]
    about = item.get("about")
    if isinstance(about, str) and about:
        lines.extend(["About", about])
    return "\n".join(line for line in lines if line).strip()


def _to_profile(item: dict[str, Any]) -> dict[str, Any] | None:
    if not isinstance(item, dict):
        return None
    url = str(item.get("linkedinUrl") or "").strip()
    name = str(item.get("name") or "").strip()
    text = _profile_text(item)
    if not url or not name or len(text) < 5:
        return None
    return {"url": url, "name": name, "text": text}


def _is_corroborated(profile: dict[str, Any], context_terms: list[str]) -> bool:
    haystack = _comparable(profile["text"])
    return any(term in haystack for term in context_terms)


def _is_notable(profile: dict[str, Any]) -> bool:
    haystack = _comparable(profile["text"])
    return any(term in haystack for term in LEADERSHIP_TERMS) or any(
        term in haystack for term in YACHTING_TERMS
    )


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

    context_terms = [_comparable(value) for value in (company_name, country, city) if value.strip()]
    if context_terms:
        corroborated = [profile for profile in candidates if _is_corroborated(profile, context_terms)]
        if corroborated:
            return corroborated[:max_profiles]

    notable = [profile for profile in candidates if _is_notable(profile)]
    if not notable:
        LOGGER.info(
            "Apify LinkedIn search found %d candidate(s) for %r but none were corroborated or notable; skipping",
            len(candidates),
            full_name,
        )
    return notable[:max_profiles]
