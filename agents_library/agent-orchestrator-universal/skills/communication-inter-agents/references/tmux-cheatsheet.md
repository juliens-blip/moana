# tmux Communication Cheatsheet

## Discover Sessions and Windows

```bash
tmux list-sessions
tmux list-windows -t $SESSION
```

Prefer numeric window IDs to avoid name issues.

## Send a Prompt

```bash
tmux send-keys -t $SESSION:N "Your prompt" Enter
```

## Verify Submission

```bash
sleep 3
tmux capture-pane -t $SESSION:N -p | tail -15
```

If the prompt is visible but no activity appears, send Enter again:

```bash
tmux send-keys -t $SESSION:N Enter
```

## Signals of Activity

Look for any of:
- "Working"
- "Thinking"
- "Explored"
- "Read("

## Troubleshooting

- Window not found: use numeric window IDs (`tmux list-windows`).
- Prompt not submitted: send Enter again.
- No activity after retry: send Ctrl+C and re-send the prompt.

```bash
tmux send-keys -t $SESSION:N C-c
sleep 1
tmux send-keys -t $SESSION:N "Retry prompt" Enter
```

## One-Liners

```bash
# Check all worker windows quickly
for w in 1 3 4; do echo "=== $w ===" && tmux capture-pane -t $SESSION:$w -p | tail -10; done
```

