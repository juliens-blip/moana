"""Backfill public YATCO specification fields for existing listings.

This is intentionally bounded and replayable. It reads listing URLs from
Supabase, fetches only the public YATCO detail pages, parses them with the
canonical collector, and updates detail fields without changing ownership,
prices, or source timestamps.
"""

from __future__ import annotations

import argparse
import json
import os
import time
import urllib.parse
import urllib.request
from typing import Any

from scripts.yatco_collector import parse_listing


DETAIL_FIELDS = (
    "model",
    "cabins",
    "listing_status",
    "broker_name",
    "broker_company",
    "agent_name",
    "agent_email",
    "spec_sheet_url",
)


def request_json(url: str, headers: dict[str, str], method: str = "GET", body: bytes | None = None) -> Any:
    request = urllib.request.Request(url, headers=headers, method=method, data=body)
    with urllib.request.urlopen(request, timeout=30) as response:
        raw = response.read().decode("utf-8")
        return json.loads(raw) if raw.strip() else None


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=25)
    parser.add_argument("--offset", type=int, default=0)
    parser.add_argument("--delay", type=float, default=0.25)
    args = parser.parse_args()

    base_url = os.environ["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/")
    service_key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Accept": "application/json",
        "User-Agent": "MoanaYatcoBackfill/1.0",
    }
    query = urllib.parse.urlencode({
        "select": "id,listing_url,source_updated_at",
        "listing_url": "not.is.null",
        "order": "source_updated_at.desc.nullslast,updated_at.desc",
        "offset": args.offset,
        "limit": args.limit,
    })
    endpoint = f"{base_url}/rest/v1/yatco_global_listings?{query}"
    rows = request_json(endpoint, headers)
    updated = 0

    for row in rows:
        try:
            with urllib.request.urlopen(
                urllib.request.Request(row["listing_url"], headers={"User-Agent": "Mozilla/5.0"}),
                timeout=30,
            ) as response:
                html = response.read().decode("utf-8", errors="replace")
            parsed = parse_listing(html, row["listing_url"], source_updated_at=row.get("source_updated_at"))
            payload = {field: parsed.get(field) for field in DETAIL_FIELDS}
            patch_headers = {**headers, "Content-Type": "application/json", "Prefer": "return=minimal"}
            update_url = f"{base_url}/rest/v1/yatco_global_listings?id=eq.{row['id']}"
            request_json(update_url, patch_headers, method="PATCH", body=json.dumps(payload).encode("utf-8"))
            updated += 1
            print(f"updated {row['id']}: model={payload['model']!r} cabins={payload['cabins']!r} status={payload['listing_status']!r}")
        except Exception as error:  # one broken source must not stop the batch
            print(f"skipped {row.get('id')}: {error}")
        if args.delay > 0:
            time.sleep(args.delay)

    print(f"backfill complete: {updated}/{len(rows)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
