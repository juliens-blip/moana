---
name: session-skill-harvester
description: Generate reusable skills from session memory and code. Use when you need to scan CLAUDE.md/Claude.md/claude.md for long or debug-heavy tasks and convert them into generic skills with examples.
---

# Session Skill Harvester

## Arguments
- project_dir: project root (default: current directory).
- memory_file: explicit memory file path (optional).
- output_dir: where generated skills are written.
- min_minutes: duration threshold for long tasks (default: 30).
- debug_markers: comma list of debug keywords (default in script).
- max_skills: max number of skills to generate (default: 10).
- include_snippets: include short code snippets from referenced files.
- max_snippets: max number of snippets to include (default: 3).
- write: create skills on disk (default: dry-run only).

## Objectives
- Identify tasks that took a long time or required debug cycles.
- Extract context (task, files, notes) from memory and session artifacts.
- Create generic skills with SKILL.md and examples.
- Store them in agents_library for future sessions.

## Steps
1) Locate the memory file (CLAUDE.md, Claude.md, or claude.md).
2) Parse Task Completion Log and task sections for candidates.
3) Flag tasks by duration >= min_minutes or debug markers.
4) Enrich with descriptions and file lists from memory.
5) Generate skills into the output directory using the script.
6) Review each generated skill and generalize names and wording.
7) Register new skills in CLAUDE.md under accumulated knowledge.

## Examples

Dry run (list candidates):

```bash
python scripts/harvest-skills.py --project-dir . --min-minutes 30
```

Generate skills:

```bash
python scripts/harvest-skills.py --project-dir . --min-minutes 30 --write
```

Generate skills with snippets:

```bash
python scripts/harvest-skills.py --project-dir . --include-snippets --write
```

Limit output and add markers:

```bash
python scripts/harvest-skills.py --project-dir . --max-skills 5 --debug-markers "debug,fix,error,blocked" --write
```

## Resources
- `scripts/harvest-skills.py`
- `references/heuristics.md`
- `assets/skill-template.md`
