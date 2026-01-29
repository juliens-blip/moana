#!/usr/bin/env bash
# Watch AMP window for limit errors and switch to secondary account if configured.

set -euo pipefail

SESSION_NAME="${1:?Usage: amp_limit_watchdog.sh <session> <config> [window] [interval]}"
CONFIG_FILE="${2:?Usage: amp_limit_watchdog.sh <session> <config> [window] [interval]}"
WINDOW_NAME="${3:-amp}"
INTERVAL_SEC="${4:-20}"

LOG_FILE="/tmp/amp_limit_watchdog_${SESSION_NAME}.log"
STATE_FILE="/tmp/amp_account_${SESSION_NAME}.state"

log() {
  local msg="$1"
  printf '%s [AMP-WATCHDOG] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$msg" >> "$LOG_FILE"
}

# Preserve passed-in session/window even if config defines SESSION_NAME
SESSION_TARGET="$SESSION_NAME"
WINDOW_TARGET="$WINDOW_NAME"

if [[ ! -f "$CONFIG_FILE" ]]; then
  log "Config file not found: $CONFIG_FILE"
  exit 1
fi

# shellcheck disable=SC1090
source "$CONFIG_FILE"

SESSION_NAME="$SESSION_TARGET"
WINDOW_NAME="$WINDOW_TARGET"

AMP_AUTH_ENV_VAR="${AMP_AUTH_ENV_VAR:-AMP_API_KEY}"
AMP_PRIMARY_TOKEN="${AMP_PRIMARY_TOKEN:-}"
AMP_SECONDARY_TOKEN="${AMP_SECONDARY_TOKEN:-}"
AMP_CMD="${AMP_CMD:-amp -m large --dangerously-allow-all}"

if [[ ${#AMP_TOKENS[@]} -eq 0 ]]; then
  if [[ -n "$AMP_PRIMARY_TOKEN" && -n "$AMP_SECONDARY_TOKEN" ]]; then
    AMP_TOKENS=("$AMP_PRIMARY_TOKEN" "$AMP_SECONDARY_TOKEN")
  elif [[ -n "$AMP_SECONDARY_TOKEN" ]]; then
    AMP_TOKENS=("$AMP_SECONDARY_TOKEN")
  fi
fi

if [[ ${#AMP_TOKENS[@]} -eq 0 ]]; then
  log "No AMP tokens configured; watchdog idle."
  exit 0
fi

if [[ ! -f "$STATE_FILE" ]]; then
  echo "0" > "$STATE_FILE"
fi

log "Started. Session=$SESSION_NAME Window=$WINDOW_NAME Interval=${INTERVAL_SEC}s"

matches_limit_error() {
  local text="$1"
  echo "$text" | grep -iEq "out of limits|limit exceeded|rate limit|quota exceeded|too many requests|\b429\b"
}

switch_to_next() {
  local idx next_idx token_count token
  token_count="${#AMP_TOKENS[@]}"
  idx="$(cat "$STATE_FILE" 2>/dev/null || echo 0)"
  next_idx=$(( (idx + 1) % token_count ))
  token="${AMP_TOKENS[$next_idx]}"
  log "Switching AMP to account index ${next_idx}."
  tmux send-keys -t "$SESSION_NAME:$WINDOW_NAME" C-c
  tmux send-keys -t "$SESSION_NAME:$WINDOW_NAME" "export ${AMP_AUTH_ENV_VAR}=\"${token}\"" C-m
  tmux send-keys -t "$SESSION_NAME:$WINDOW_NAME" "$AMP_CMD" C-m
  echo "$next_idx" > "$STATE_FILE"
}

while true; do
  if ! tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
    log "Session not found; exiting."
    exit 0
  fi

  current_state="$(cat "$STATE_FILE" 2>/dev/null || echo 0)"
  pane_text="$(tmux capture-pane -t "$SESSION_NAME:$WINDOW_NAME" -p | tail -200)"

  if matches_limit_error "$pane_text"; then
    switch_to_next
    sleep 10
  fi

  sleep "$INTERVAL_SEC"
done
