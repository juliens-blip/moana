#!/usr/bin/env bash
set -euo pipefail

SESSION="${1:?session required}"
WINDOW="${2:?window required}"
DELAY="${3:-3}"

sleep "$DELAY"
output=$(tmux capture-pane -t "$SESSION:$WINDOW" -p | tail -10)

if echo "$output" | grep -qE "Working|Thinking|Explored|Read"; then
  echo "OK: worker active ($SESSION:$WINDOW)"
  exit 0
fi

tmux send-keys -t "$SESSION:$WINDOW" Enter
sleep 2
output2=$(tmux capture-pane -t "$SESSION:$WINDOW" -p | tail -10)

if echo "$output2" | grep -qE "Working|Thinking|Explored|Read"; then
  echo "OK: worker active after retry ($SESSION:$WINDOW)"
  exit 0
fi

echo "WARN: no activity after retry ($SESSION:$WINDOW)"
exit 1

