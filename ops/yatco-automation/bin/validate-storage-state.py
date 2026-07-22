#!/usr/bin/env python3

import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("Usage: validate-storage-state.py <storage-state.json>")

    storage_path = Path(sys.argv[1]).resolve()
    storage_state = json.loads(storage_path.read_text(encoding="utf-8"))
    cookies = storage_state.get("cookies")
    if not isinstance(cookies, list):
        raise RuntimeError("Storage state has no cookie list")

    auth_cookie = next(
        (cookie for cookie in cookies if cookie.get("name") == "BOSSAuthCookie"),
        None,
    )
    if not auth_cookie:
        raise RuntimeError("Storage state has no BOSSAuthCookie")

    expires = auth_cookie.get("expires")
    if not isinstance(expires, (int, float)) or expires <= time.time() + 3600:
        raise RuntimeError("BOSSAuthCookie is expired or expires in less than one hour")

    expires_at = datetime.fromtimestamp(expires, tz=timezone.utc).isoformat()
    print(f"BOSS storage state valid until {expires_at}")


if __name__ == "__main__":
    main()
