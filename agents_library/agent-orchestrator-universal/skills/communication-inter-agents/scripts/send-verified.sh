#!/usr/bin/env bash
set -euo pipefail

SESSION="${1:?session required}"
WINDOW="${2:?window required}"
shift 2 || true

MESSAGE="${*:-}"
if [[ -z "$MESSAGE" ]]; then
  echo "Usage: send-verified.sh <session> <window> <message>"
  exit 1
fi

DELAY="${DELAY_SEC:-3}"

tmux send-keys -t "$SESSION:$WINDOW" "$MESSAGE" Enter
sleep "$DELAY"

output=$(tmux capture-pane -t "$SESSION:$WINDOW" -p | tail -10)
if echo "$output" | grep -qE "Working|Thinking|Explored|Read"; then
  echo "OK: worker active ($SESSION:$WINDOW)"
  exit 0
fi

# Retry submit
tmux send-keys -t "$SESSION:$WINDOW" Enter
sleep 2
output2=$(tmux capture-pane -t "$SESSION:$WINDOW" -p | tail -10)
if echo "$output2" | grep -qE "Working|Thinking|Explored|Read"; then
  echo "OK: worker active after retry ($SESSION:$WINDOW)"
  exit 0
fi

# Clear and resend
tmux send-keys -t "$SESSION:$WINDOW" C-c
sleep 1
tmux send-keys -t "$SESSION:$WINDOW" "$MESSAGE" Enter
sleep "$DELAY"
output3=$(tmux capture-pane -t "$SESSION:$WINDOW" -p | tail -10)
if echo "$output3" | grep -qE "Working|Thinking|Explored|Read"; then
  echo "OK: worker active after resend ($SESSION:$WINDOW)"
  exit 0
fi

echo "WARN: no activity after retries ($SESSION:$WINDOW)"
exit 1
