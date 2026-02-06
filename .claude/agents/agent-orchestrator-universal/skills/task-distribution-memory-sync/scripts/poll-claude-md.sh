#!/usr/bin/env bash
set -euo pipefail

CLAUDE_MD="${1:-CLAUDE.md}"
TASK_IDS="${2:?task ids required, e.g. 'T-001 T-002'}"
POLL_INTERVAL="${3:-80}"

while true; do
  all_done=true
  for tid in $TASK_IDS; do
    status=$(grep "$tid" "$CLAUDE_MD" | grep -oE "COMPLETED|IN_PROGRESS|BLOCKED|PENDING" | tail -1)
    echo "$(date +%H:%M:%S) $tid: ${status:-UNKNOWN}"
    if [[ "$status" != "COMPLETED" ]]; then
      all_done=false
    fi
  done

  if $all_done; then
    echo "All tasks completed."
    exit 0
  fi

  echo "--- next poll in ${POLL_INTERVAL}s ---"
  sleep "$POLL_INTERVAL"
done

