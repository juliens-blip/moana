"""Apify-backed LinkedIn profile search.

Replaces the self-hosted Playwright/session adapter, which stayed blocked by
LinkedIn (HTTP 999) even through a residential proxy — see
tasks/kyc-multi-source-screening/proxy.md. Apify's own infrastructure reaches
LinkedIn directly; this module only calls a name-search actor and normalizes
its output into the evidence-document shape the rest of the worker expects.
"""

from __future__ import annotations

import logging
from datetime import timedelta
from decimal import Decimal
from typing import Any

from apify_client import ApifyClientAsync

LOGGER = logging.getLogger("moana.kyc.linkedin")

MAX_CHARGE_USD = Decimal("0.20")
RUN_TIMEOUT = timedelta(seconds=180)


def split_name(full_name: str) -> tuple[str, str] | None:
    parts = full_name.split()
    if len(parts) < 2:
        return None
    return parts[0], " ".join(parts[1:])


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


async def search_profiles(
    full_name: str,
    api_token: str,
    actor_id: str,
    mode: str,
    max_profiles: int,
) -> list[dict[str, Any]]:
    """Search LinkedIn by name via Apify; never raises on provider failures."""
    if max_profiles <= 0 or not api_token:
        return []
    parsed = split_name(full_name)
    if parsed is None:
        return []
    first_name, last_name = parsed

    client = ApifyClientAsync(api_token)
    run_input = {
        "profileScraperMode": mode,
        "firstName": first_name,
        "lastName": last_name,
        "maxItems": max_profiles,
    }
    try:
        run = await client.actor(actor_id).call(
            run_input=run_input,
            max_items=max_profiles,
            max_total_charge_usd=MAX_CHARGE_USD,
            timeout=RUN_TIMEOUT,
        )
    except Exception as exc:  # pragma: no cover - provider-specific network/API failures
        LOGGER.warning("Apify LinkedIn search failed: %s", exc.__class__.__name__)
        return []
    if run is None or not run.default_dataset_id:
        LOGGER.warning("Apify LinkedIn search returned no run")
        return []

    profiles: list[dict[str, Any]] = []
    try:
        async for item in client.dataset(run.default_dataset_id).iterate_items():
            profile = _to_profile(item)
            if profile:
                profiles.append(profile)
            if len(profiles) >= max_profiles:
                break
    except Exception as exc:  # pragma: no cover - provider-specific network/API failures
        LOGGER.warning("Apify LinkedIn dataset read failed: %s", exc.__class__.__name__)
    return profiles
