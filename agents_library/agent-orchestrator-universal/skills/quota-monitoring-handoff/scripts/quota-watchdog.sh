#!/usr/bin/env bash
set -euo pipefail

SESSION="${1:-orchestration-$(basename "$(pwd)")}"
WINDOW="${2:-claude}"
ALERT_THRESHOLD="${3:-93}"
INTERVAL="${4:-30}"

LOG_FILE="/tmp/quota_watchdog.log"
QUOTA_FILE="/tmp/quota_current"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log "watchdog started (threshold=${ALERT_THRESHOLD}%, interval=${INTERVAL}s)"

while true; do
  quota=$(tmux capture-pane -t "$SESSION:$WINDOW" -p 2>/dev/null | grep -oE "used [0-9]+%" | grep -oE "[0-9]+" | tail -1 || true)
  if [[ -n "$quota" ]]; then
    echo "$quota" > "$QUOTA_FILE"
    if [[ "$quota" -ge "$ALERT_THRESHOLD" ]]; then
      log "ALERT ${quota}%"
    else
      log "OK ${quota}%"
    fi
  else
    log "WARN unable to read quota"
  fi
  sleep "$INTERVAL"
done

