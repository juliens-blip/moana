#!/usr/bin/env bash
set -euo pipefail

SESSION="${1:?session required}"
WINDOW="${2:?window required}"
INTERVAL="${3:-75}"

ACTIVE_PATTERN="${ACTIVE_PATTERN:-Working|Thinking|Explored|Read\\(|Tool|Running|Processing|Galloping|Gitifying}"
NUDGE_MESSAGE=${NUDGE_MESSAGE:-"SYSTEM: You are the orchestrator. Continue the loop silently. Steps: 1) Check CLAUDE.md for completed/blocked tasks. 2) Redistribute immediately if needed (use send-verified). 3) If nothing to do, sleep 60-90s and re-check. Do not message the user."}

while tmux has-session -t "$SESSION" 2>/dev/null; do
  output=$(tmux capture-pane -t "$SESSION:$WINDOW" -p | tail -20)
  if echo "$output" | grep -qE "$ACTIVE_PATTERN"; then
    sleep "$INTERVAL"
    continue
  fi

  tmux send-keys -t "$SESSION:$WINDOW" "$NUDGE_MESSAGE" Enter
  sleep 3
  output2=$(tmux capture-pane -t "$SESSION:$WINDOW" -p | tail -10)
  if ! echo "$output2" | grep -qE "$ACTIVE_PATTERN"; then
    tmux send-keys -t "$SESSION:$WINDOW" Enter
  fi

  sleep "$INTERVAL"
done
