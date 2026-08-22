"""Ingestion server-side des annonces YATCO dans public.yatco_global_listings.

Séparé du collecteur (``scripts/yatco_collector.py``) : ce worker ne parle
qu'à Supabase, jamais au réseau YATCO. Chaque écriture est un upsert
PostgREST sur la clé générée ``dedup_key`` (``lower(source):lower(external_id)``,
voir supabase/migrations/20260814T0031__yatco_global_listings.sql) — la valeur
n'est jamais envoyée, Postgres la calcule. Rejouer la même fixture met donc à
jour ``last_seen_at``/``raw_payload`` de la ligne existante sans doublon.

Stdlib uniquement (``urllib``), comme ``yatco_collector.py`` : pas de nouvelle
dépendance hors de celles déjà requises par le plan. ``post`` est injectable
pour les tests hors réseau.
"""

from __future__ import annotations

import json
import logging
import os
import random
import time
import urllib.error
import urllib.request
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, NamedTuple

LOGGER = logging.getLogger("moana.yatco_ingest")

# Colonnes acceptées par public.yatco_global_listings, à l'exclusion de
# id/dedup_key/created_at/updated_at (générées ou gérées par la base) et de
# first_seen_at (laissée à son défaut ``now()`` : un upsert ne doit jamais
# écraser la première observation d'une annonce déjà connue).
MAPPED_LISTING_FIELDS = (
    "source",
    "external_id",
    "listing_url",
    "boat_name",
    "builder",
    "model",
    "model_year",
    "length_m",
    "cabins",
    "listing_status",
    "price_amount",
    "price_currency",
    "price_usd",
    "price_usd_rate",
    "price_converted_at",
    "country",
    "country_code",
    "city",
    "source_updated_at",
    "source_created_at",
    "broker_name",
    "broker_company",
    "agent_name",
    "agent_email",
    "spec_sheet_url",
)

# (status_code, response_body_bytes)
PostFn = Callable[[str, dict[str, str], bytes, float], tuple[int, bytes]]


class ConfigurationError(RuntimeError):
    """Configuration manquante ou non sûre."""


def env_int(name: str, default: int, minimum: int, maximum: int) -> int:
    try:
        value = int(os.getenv(name, str(default)))
    except ValueError as exc:
        raise ConfigurationError(f"{name} must be an integer") from exc
    if not minimum <= value <= maximum:
        raise ConfigurationError(f"{name} must be between {minimum} and {maximum}")
    return value


def env_float(name: str, default: float, minimum: float, maximum: float) -> float:
    try:
        value = float(os.getenv(name, str(default)))
    except ValueError as exc:
        raise ConfigurationError(f"{name} must be a number") from exc
    if not minimum <= value <= maximum:
        raise ConfigurationError(f"{name} must be between {minimum} and {maximum}")
    return value


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass(frozen=True)
class Settings:
    supabase_url: str
    supabase_service_key: str
    timeout_s: float = field(default_factory=lambda: env_float("YATCO_INGEST_TIMEOUT_S", 20.0, 1.0, 120.0))
    max_retries: int = field(default_factory=lambda: env_int("YATCO_INGEST_MAX_RETRIES", 3, 0, 10))
    backoff_base_s: float = field(default_factory=lambda: env_float("YATCO_INGEST_BACKOFF_BASE_S", 1.0, 0.1, 60.0))
    backoff_cap_s: float = field(default_factory=lambda: env_float("YATCO_INGEST_BACKOFF_CAP_S", 20.0, 1.0, 300.0))
    request_delay_s: float = field(default_factory=lambda: env_float("YATCO_INGEST_REQUEST_DELAY_S", 0.0, 0.0, 10.0))

    @classmethod
    def from_env(cls) -> Settings:
        supabase_url = os.getenv("NEXT_PUBLIC_SUPABASE_URL", "").strip()
        service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
        missing = [
            name
            for name, value in (
                ("NEXT_PUBLIC_SUPABASE_URL", supabase_url),
                ("SUPABASE_SERVICE_ROLE_KEY", service_key),
            )
            if not value
        ]
        if missing:
            raise ConfigurationError("Missing configuration: " + ", ".join(missing))
        return cls(supabase_url=supabase_url.rstrip("/"), supabase_service_key=service_key)


class DeadLetter(NamedTuple):
    listing: Any
    reason: str


@dataclass(frozen=True)
class IngestSummary:
    written: list[dict[str, str]]
    dead_letters: list[DeadLetter]


def validate_external_id(listing: dict[str, Any]) -> str | None:
    """Retourne l'external_id normalisé, ou None si l'annonce est inutilisable."""
    external_id = listing.get("external_id")
    if external_id is None:
        return None
    normalized = str(external_id).strip()
    return normalized or None


def build_row(listing: dict[str, Any], external_id: str, observed_at: str) -> dict[str, Any]:
    """Mappe une annonce normalisée vers les colonnes de yatco_global_listings.

    ``dedup_key`` n'est jamais dans le payload : c'est une colonne générée.
    """
    row: dict[str, Any] = {
        field_name: listing.get(field_name)
        for field_name in MAPPED_LISTING_FIELDS
        if field_name in listing
    }
    row["source"] = str(listing.get("source") or "yatco")
    row["external_id"] = external_id
    row["last_seen_at"] = observed_at
    row["raw_payload"] = listing
    return row


def _endpoint(settings: Settings) -> str:
    return f"{settings.supabase_url}/rest/v1/yatco_global_listings?on_conflict=dedup_key"


def _headers(settings: Settings) -> dict[str, str]:
    return {
        "apikey": settings.supabase_service_key,
        "Authorization": f"Bearer {settings.supabase_service_key}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=representation",
    }


def default_post(url: str, headers: dict[str, str], body: bytes, timeout: float) -> tuple[int, bytes]:
    """POST bloquant réel via urllib. Jamais appelé depuis les tests."""
    request = urllib.request.Request(url, data=body, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.status, response.read()
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read()


def is_transient_status(status_code: int) -> bool:
    return status_code == 429 or 500 <= status_code < 600


def _upsert_with_retry(
    row: dict[str, Any],
    settings: Settings,
    post: PostFn,
) -> tuple[bool, str]:
    """Upsert borné : timeout par tentative, backoff exponentiel plafonné avec
    jitter sur les échecs transitoires (429/5xx/timeout/réseau). Toute autre
    réponse est un échec définitif immédiat, isolé sans nouvel essai.
    """
    url = _endpoint(settings)
    headers = _headers(settings)
    body = json.dumps([row]).encode("utf-8")

    attempt = 0
    while True:
        if settings.request_delay_s > 0:
            time.sleep(settings.request_delay_s)
        try:
            status_code, _payload = post(url, headers, body, settings.timeout_s)
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            if attempt >= settings.max_retries:
                return False, f"network_error:{exc.__class__.__name__}"
        else:
            if status_code in (200, 201):
                return True, ""
            if not is_transient_status(status_code) or attempt >= settings.max_retries:
                return False, f"http_{status_code}"

        attempt += 1
        sleep_s = min(settings.backoff_cap_s, settings.backoff_base_s * (2 ** (attempt - 1)))
        sleep_s += random.uniform(0, sleep_s * 0.1)
        LOGGER.warning("yatco upsert retry %s/%s in %.1fs", attempt, settings.max_retries, sleep_s)
        time.sleep(sleep_s)


def ingest_listings(
    listings: list[Any],
    settings: Settings,
    post: PostFn = default_post,
) -> IngestSummary:
    """Ingère un lot d'annonces normalisées, une écriture atomique par annonce.

    Rejouable : la même fixture appliquée deux fois ne produit qu'une ligne
    par couple source/external_id (upsert PostgREST sur dedup_key). Une
    annonce sans external_id, dont le type n'est pas un mapping, ou dont
    l'écriture échoue définitivement, va au dead-letter sans bloquer les
    annonces suivantes du lot.
    """
    written: list[dict[str, str]] = []
    dead_letters: list[DeadLetter] = []

    for listing in listings:
        if not isinstance(listing, dict):
            dead_letters.append(DeadLetter(listing=listing, reason="invalid_listing_type"))
            continue

        external_id = validate_external_id(listing)
        if external_id is None:
            dead_letters.append(DeadLetter(listing=listing, reason="missing_external_id"))
            continue

        row = build_row(listing, external_id, now_iso())
        ok, reason = _upsert_with_retry(row, settings, post)
        if ok:
            written.append({"source": row["source"], "external_id": external_id})
        else:
            dead_letters.append(DeadLetter(listing=listing, reason=reason))

    return IngestSummary(written=written, dead_letters=dead_letters)
