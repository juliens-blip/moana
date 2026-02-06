#!/usr/bin/env bash
set -euo pipefail

SESSION="${1:?session required}"
WINDOWS_RAW="${2:-}"
shift 2 || true

MESSAGE="${*:-}"

if [[ -z "$WINDOWS_RAW" || -z "$MESSAGE" ]]; then
  echo "Usage: broadcast-message.sh <session> <windows_csv> <message>"
  echo "Example: broadcast-message.sh orchestration-demo 1,3,4 \"Status update?\""
  exit 1
fi

IFS=',' read -r -a WINDOWS <<< "$WINDOWS_RAW"

for w in "${WINDOWS[@]}"; do
  tmux send-keys -t "$SESSION:$w" "$MESSAGE" Enter
  sleep 1
done

