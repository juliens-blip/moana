# Task Status Rules

## Status Values
- PENDING: task is defined but not started.
- IN_PROGRESS: a worker is actively working.
- COMPLETED: task finished and verified.
- BLOCKED: task cannot proceed (dependency, quota, or error).

## When to Mark BLOCKED
- Missing dependency or prerequisite.
- Worker is unresponsive after retries.
- External limitation (quota, rate limit, missing access).

## Handling BLOCKED
1) Add a short note in CLAUDE.md with the reason.
2) Reassign to another worker if possible.
3) If blocked by dependency, create a new task for that dependency.
4) If still blocked after one retry cycle, escalate to the user.

