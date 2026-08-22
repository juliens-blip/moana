"""Synchronise le flux authentifié YATCO BOSS avec les annonces publiques.

Le scraper AWS produit ``new/modified/sold`` dans market-pulse.json. Le MLS
public est la clé de rapprochement : le vID BOSS ne doit jamais devenir le
lien affiché à l'utilisateur. Les champs BOSS non nuls complètent la ligne
publique et le JSON brut conserve l'événement pour le suivi des favoris.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def _env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError(f"Variable manquante: {name}")
    return value.rstrip("/")


def parse_number(value: str | None) -> float | None:
    if not value:
        return None
    match = re.search(r"\d[\d .,]*", value)
    if not match:
        return None
    raw = match.group(0).replace(" ", "")
    if "." in raw and "," in raw:
        raw = raw.replace(".", "").replace(",", ".")
    elif raw.count(",") == 1 and len(raw.rsplit(",", 1)[1]) != 3:
        raw = raw.replace(",", ".")
    else:
        raw = raw.replace(",", "") if raw.count(",") > 1 else raw
        raw = raw.replace(".", "") if raw.count(".") > 1 else raw
    try:
        return float(raw)
    except ValueError:
        return None


def split_location(value: str | None) -> tuple[str | None, str | None]:
    parts = [part.strip() for part in (value or "").split(",") if part.strip()]
    if not parts:
        return None, None
    return parts[0], parts[-1] if len(parts) > 1 else None


def parse_date(value: str | None) -> str | None:
    if not value:
        return None
    for fmt in ("%m/%d/%Y", "%d/%m/%Y", "%Y-%m-%d", "%b %d, %Y", "%B %d, %Y"):
        try:
            return datetime.strptime(value.strip(), fmt).replace(tzinfo=timezone.utc).isoformat()
        except ValueError:
            continue
    return None


def build_patch(row: dict[str, Any], observed_at: str) -> tuple[str | None, dict[str, Any]]:
    mls_id = str(row.get("mlsId") or "").strip()
    if not mls_id:
        return None, {}
    city, country = split_location(row.get("location"))
    feed_type = str(row.get("feedType") or "").lower()
    status = "Sold" if feed_type == "sold" else "Active"
    sold_at = parse_date(row.get("soldDate"))
    patch: dict[str, Any] = {
        "last_seen_at": observed_at,
        "listing_status": status,
        "raw_payload": {"yatco_boss": row, "boss_observed_at": observed_at},
    }
    mapping = {
        "boat_name": row.get("vesselName"),
        "builder": row.get("builder"),
        "model_year": int(row["modelYear"]) if str(row.get("modelYear") or "").isdigit() else None,
        "length_m": parse_number(row.get("loaText")),
        "broker_company": row.get("brokerName"),
        "city": city,
        "country": country,
    }
    price = parse_number(row.get("priceText"))
    if price is not None:
        mapping["price_amount"] = price
    if sold_at:
        patch["source_updated_at"] = sold_at
    for key, value in mapping.items():
        if value is not None:
            patch[key] = value
    return mls_id, patch


def request_json(url: str, method: str, key: str, payload: Any | None = None) -> Any:
    headers = {"apikey": key, "Authorization": f"Bearer {key}", "Accept": "application/json"}
    body = None
    if payload is not None:
        headers["Content-Type"] = "application/json"
        headers["Prefer"] = "return=representation"
        body = json.dumps(payload).encode()
    request = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            raw = response.read()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as exc:
        raise RuntimeError(f"Supabase HTTP {exc.code}: {exc.read().decode(errors='replace')[:300]}") from exc


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("json_path", type=Path)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    raw_input = os.sys.stdin.read() if str(args.json_path) == "-" else args.json_path.read_text(encoding="utf-8")
    rows = json.loads(raw_input)
    observed_at = datetime.now(timezone.utc).isoformat()
    url, key = _env("NEXT_PUBLIC_SUPABASE_URL"), _env("SUPABASE_SERVICE_ROLE_KEY")
    updated = skipped = 0
    for row in rows:
        mls_id, patch = build_patch(row, observed_at)
        if not mls_id:
            skipped += 1
            continue
        if args.dry_run:
            print(f"[dry-run] {row.get('feedType')} MLS {mls_id}: {sorted(patch)}")
            continue
        endpoint = f"{url}/rest/v1/yatco_global_listings?external_id=eq.{urllib.parse.quote(mls_id, safe='')}"
        existing = request_json(endpoint + "&select=raw_payload", "GET", key)
        if existing:
            previous = existing[0].get("raw_payload") or {}
            if isinstance(previous, dict):
                patch["raw_payload"] = {
                    **previous,
                    "yatco_boss": row,
                    "boss_observed_at": observed_at,
                }
            result = request_json(endpoint, "PATCH", key, patch)
        else:
            # Une annonce peut apparaître dans BOSS avant d'être publiée dans
            # le sitemap public. On la rend visible immédiatement, avec le
            # MLS comme identité ; le lien public sera ajouté à l'enrichissement
            # suivant dès que YATCO l'expose.
            insert = {"source": "yatco", "external_id": mls_id, **patch}
            result = request_json(f"{url}/rest/v1/yatco_global_listings", "POST", key, insert)
        if not result:
            print(f"[warning] MLS {mls_id} non synchronisé")
        else:
            updated += 1
    print(f"BOSS global: {updated} annonces rapprochées, {skipped} ignorées")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
