#!/usr/bin/env bash
set -euo pipefail

SESSION="${1:?session required}"
WINDOW="${2:?window required}"
INTERVAL="${3:-75}"

NUDGE_MESSAGE=${NUDGE_MESSAGE:-"Continue orchestration loop silently: check CLAUDE.md, redistribute if needed; if nothing to do sleep 60-90s and continue. Do not message the user."}

while tmux has-session -t "$SESSION" 2>/dev/null; do
  output=$(tmux capture-pane -t "$SESSION:$WINDOW" -p | tail -20)
  if echo "$output" | grep -qE "Working|Thinking|Explored|Read\\(|Tool|Running"; then
    sleep "$INTERVAL"
    continue
  fi

  tmux send-keys -t "$SESSION:$WINDOW" "$NUDGE_MESSAGE" Enter
  sleep 3
  output2=$(tmux capture-pane -t "$SESSION:$WINDOW" -p | tail -10)
  if ! echo "$output2" | grep -qE "Working|Thinking|Explored|Read\\(|Tool|Running"; then
    tmux send-keys -t "$SESSION:$WINDOW" Enter
  fi

  sleep "$INTERVAL"
done
