# Heuristics for Skill Harvesting

## Candidate Selection

Mark a task as a candidate if any of these are true:
- Duration is >= min_minutes.
- Notes mention debug or fix cycles.
- Status is BLOCKED or FAILED.
- Notes mention retry, workaround, or error.

Suggested default debug markers:
- debug, fix, error, failed, retry, ralph, blocked, workaround, bug, issue

## Generalization Rules

- Remove project names and vendor names from titles.
- Replace hard-coded IDs or endpoints with generic placeholders.
- Convert file paths to relative and generic examples.
- Keep invariants, edge cases, and test steps.

## Output Checklist

For each generated skill:
- Name is short, lowercase, hyphenated.
- Description states when to use the skill.
- Steps are actionable and generic.
- Include at least one example prompt.
- Link to source task in references.
