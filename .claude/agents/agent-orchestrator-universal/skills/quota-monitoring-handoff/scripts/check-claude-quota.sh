#!/usr/bin/env bash
set -euo pipefail

SESSION="${1:-orchestration-$(basename "$(pwd)")}"
WINDOW="${2:-claude}"
ALERT_THRESHOLD="${3:-93}"

quota=$(tmux capture-pane -t "$SESSION:$WINDOW" -p 2>/dev/null | grep -oE "used [0-9]+%" | grep -oE "[0-9]+" | tail -1 || true)

if [[ -z "$quota" ]]; then
  echo "ERROR: unable to read quota"
  exit 1
fi

if [[ "$quota" -ge "$ALERT_THRESHOLD" ]]; then
  alert=true
else
  alert=false
fi

echo "QUOTA=$quota"
echo "ALERT=$alert"

if [[ "$alert" == "true" ]]; then
  exit 2
fi

