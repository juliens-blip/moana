---
name: communication-inter-agents
description: Coordinate multiple LLMs via tmux. Use when sending prompts to worker windows, verifying submission, collecting responses, or asking workers to log updates in CLAUDE.md.
---

# Communication Inter-Agents (tmux)

## Arguments
- session: tmux session name.
- window: tmux window index (prefer numeric).
- message: prompt to send.
- delay_sec: seconds to wait before checking output (default 3-5).
- claude_md_path: shared memory file path (usually CLAUDE.md).

## Objectives
- Send a prompt to the correct worker window.
- Verify the prompt was submitted (not stuck in input).
- Capture recent output for status/results.
- Request that workers log completion in CLAUDE.md.

## Steps
1) Discover the session and window numbers.
2) Send one task per prompt using `scripts/send-verified.sh` (preferred) or `tmux send-keys`.
3) Always verify submission (activity visible) within 3-5 seconds.
4) If no activity is visible, send Enter again. If still idle, re-send the full prompt (see Recovery).
5) Ask the worker to update CLAUDE.md with status and notes.

## Recovery (prompt stuck in input)
- If the prompt is visible but not submitted, run `scripts/auto-submit.sh <session> <window>`.
- If still idle, send `C-c`, then re-send the full prompt with `scripts/send-verified.sh`.

## Examples

Send a task and verify submission (preferred):

```bash
scripts/send-verified.sh $SESSION 4 "Task T-012: generate tests for lib/api.ts"
```

Send a task and verify submission (manual):

```bash
tmux send-keys -t $SESSION:4 "Task T-012: generate tests for lib/api.ts" Enter
sleep 3
tmux capture-pane -t $SESSION:4 -p | tail -15
```

Ask a worker to log completion:

```bash
tmux send-keys -t $SESSION:4 "Update CLAUDE.md: mark T-012 COMPLETED and add a completion log entry." Enter
```

Broadcast a short status check:

```bash
tmux send-keys -t $SESSION:1 "Status update?" Enter
```

## Resources
- `scripts/auto-submit.sh`: auto-send Enter when a prompt is not submitted.
- `scripts/send-verified.sh`: send a prompt and verify activity (auto-retry + resend).
- `scripts/broadcast-message.sh`: send a message to multiple windows.
- `references/tmux-cheatsheet.md`: discovery, signals, and troubleshooting.
- `assets/prompt-template.md`: consistent prompt structure.

