---
name: task-distribution-memory-sync
description: Distribute tasks with IDs across LLM workers and keep progress synced in CLAUDE.md. Use when orchestrating multi-LLM work, polling status, and redistributing tasks.
---

# Task Distribution and Memory Sync

## Arguments
- claude_md_path: path to shared memory file (default CLAUDE.md).
- session: tmux session name.
- window_map: map of workers to window numbers.
- poll_interval_sec: polling interval (default 60-90).

## Objectives
- Create task IDs and a single source of truth in CLAUDE.md.
- Distribute one task per prompt with clear completion rules.
- Poll CLAUDE.md and reassign work immediately when tasks finish.
- Keep a completion log with files touched and notes.
- Require a relevant agents_library agent for each task (or explicitly note none).

## Steps
1) Decompose the request into atomic tasks and assign IDs.
2) Select the most relevant agent from `agents_library` for each task.
   - If none fits, record `Agent: none` and proceed.
3) Write tasks into the Task Assignment Queue in CLAUDE.md (include the agent).
4) Send prompts with the task ID and completion instructions (include the agent load).
   - Prefer `agents_library/agent-orchestrator-universal/skills/communication-inter-agents/scripts/send-verified.sh` to send + verify.
   - If sending manually, always run `scripts/verify-submit.sh` right after.
5) Poll CLAUDE.md and redistribute as soon as workers finish.
6) Mark blocked tasks and reassign or unblock.
7) After feature tasks, spawn test tasks and run Ralph cycles.

## Common Failure: Prompt Not Submitted
- If a prompt is visible in the pane but no activity starts, it is **not submitted**.
- Run `scripts/verify-submit.sh` (or `agents_library/agent-orchestrator-universal/skills/communication-inter-agents/scripts/send-verified.sh`).
- If still idle, send `C-c`, then re-send the full prompt.

## Examples

Task entry in CLAUDE.md:

```markdown
| T-004 | Build API route for leads sync | @agents_library/backend-developer.md | AMP (w1) | HIGH | IN_PROGRESS | 2026-02-02 |
```

Prompt template:

```
Task T-004: Build the /api/leads/sync route and update lib/leads.ts.

Load agent: @agents_library/backend-developer.md

When done:
1) Update CLAUDE.md Task Assignment Queue: T-004 -> COMPLETED
2) Add a Task Completion Log entry with files touched and notes
```

## Resources
- `assets/claude-md-template.md`: minimal CLAUDE.md structure.
- `assets/task-prompt-template.md`: consistent prompt format.
- `scripts/poll-claude-md.sh`: poll for task completion.
- `scripts/verify-submit.sh`: verify prompt submission and retry Enter.
- `references/status-rules.md`: status definitions and blocking rules.

