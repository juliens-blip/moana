#!/usr/bin/env python3

import os
import sys
from pathlib import Path

REQUIRED_KEYS = ("NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY")


def load_selected(source: Path) -> dict[str, str]:
    selected: dict[str, str] = {}
    for raw_line in source.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        if key in REQUIRED_KEYS:
            selected[key] = value

    missing = [key for key in REQUIRED_KEYS if not selected.get(key)]
    if missing:
        raise RuntimeError(f"Missing required variables: {', '.join(missing)}")
    return selected


def write_atomic(destination: Path, values: dict[str, str]) -> None:
    destination.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    os.chmod(destination.parent, 0o700)
    temporary = destination.with_name(f".{destination.name}.tmp")
    descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8", newline="\n") as handle:
        for key in REQUIRED_KEYS:
            handle.write(f"{key}={values[key]}\n")
    os.chmod(temporary, 0o600)
    os.replace(temporary, destination)
    os.chmod(destination, 0o600)


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("Usage: extract-runtime-env.py <source-env> <destination-env>")
    source = Path(sys.argv[1]).resolve()
    destination = Path(sys.argv[2]).resolve()
    write_atomic(destination, load_selected(source))
    print("Runtime environment created with: " + ", ".join(REQUIRED_KEYS))


if __name__ == "__main__":
    main()
