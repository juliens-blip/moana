#!/usr/bin/env python3
import argparse
import os
import re
import textwrap
from datetime import datetime

DEFAULT_MARKERS = [
    "debug",
    "fix",
    "error",
    "failed",
    "retry",
    "ralph",
    "blocked",
    "workaround",
    "bug",
    "issue",
]

STOPWORDS = {
    "a", "an", "and", "the", "for", "to", "of", "in", "on", "with", "by",
    "create", "build", "implement", "add", "update", "fix", "generate",
}


def find_memory_file(project_dir, memory_file):
    if memory_file:
        path = memory_file
        if not os.path.isabs(path):
            path = os.path.join(project_dir, path)
        if os.path.isfile(path):
            return path
        raise FileNotFoundError(f"memory file not found: {path}")

    for name in ("CLAUDE.md", "Claude.md", "claude.md"):
        candidate = os.path.join(project_dir, name)
        if os.path.isfile(candidate):
            return candidate
    raise FileNotFoundError("no memory file found (CLAUDE.md/Claude.md/claude.md)")


def read_lines(path):
    with open(path, "r", encoding="utf-8", errors="ignore") as f:
        return f.read().splitlines()


def extract_sections(lines, heading_regex):
    sections = []
    pattern = re.compile(heading_regex)
    i = 0
    while i < len(lines):
        if pattern.match(lines[i]):
            start = i + 1
            i = start
            while i < len(lines) and not re.match(r"^#{1,6}\s", lines[i]):
                i += 1
            sections.append((start, i))
        else:
            i += 1
    return sections


def parse_table(lines):
    rows = []
    for line in lines:
        text = line.strip()
        if not text.startswith("|"):
            continue
        cols = [c.strip() for c in text.strip("|").split("|")]
        if len(cols) < 2:
            continue
        if cols[0].lower() == "date" or set(cols[0]) <= {"-"}:
            continue
        rows.append(cols)
    return rows


def duration_to_minutes(value):
    if not value:
        return None
    text = value.strip().lower()
    if text in {"-", "n/a", "na"}:
        return None

    match = re.search(r"(\d+)\s*(min|minutes)", text)
    if match:
        return int(match.group(1))

    match = re.search(r"(\d+)\s*h(?:\s*(\d+)\s*m)?", text)
    if match:
        hours = int(match.group(1))
        minutes = int(match.group(2) or 0)
        return hours * 60 + minutes

    if ":" in text:
        parts = text.split(":")
        try:
            nums = [int(p) for p in parts]
        except ValueError:
            return None
        if len(nums) == 2:
            return nums[0] * 60 + nums[1]
        if len(nums) == 3:
            return nums[0] * 60 + nums[1] + (1 if nums[2] >= 30 else 0)

    return None


def contains_marker(text, markers):
    if not text:
        return False
    lower = text.lower()
    return any(marker in lower for marker in markers)


def slugify(text):
    if not text:
        return ""
    cleaned = re.sub(r"[^a-zA-Z0-9\s-]", " ", text).lower()
    tokens = [t for t in cleaned.split() if t not in STOPWORDS and len(t) > 2]
    tokens = [t for t in tokens if not any(ch.isdigit() for ch in t)]
    slug = "-".join(tokens)
    return slug[:50].strip("-")


def unique_path(base_dir, name):
    candidate = os.path.join(base_dir, name)
    if not os.path.exists(candidate):
        return candidate
    idx = 2
    while True:
        alt = f"{candidate}-v{idx}"
        if not os.path.exists(alt):
            return alt
        idx += 1


def parse_task_sections(lines):
    sections = {}
    header_re = re.compile(r"^###\s*\[(.+?)\]\s*(.+)$")
    i = 0
    while i < len(lines):
        match = header_re.match(lines[i])
        if match:
            task_id = match.group(1).strip()
            title = match.group(2).strip()
            start = i + 1
            i = start
            while i < len(lines) and not re.match(r"^##?\s", lines[i]):
                i += 1
            body = lines[start:i]
            sections[task_id] = {"title": title, "body": body}
        else:
            i += 1
    return sections


def extract_files_from_section(body_lines):
    files = []
    capture = False
    for line in body_lines:
        text = line.strip()
        if re.match(r"^\*\*Files (Created|Modified|Involved)\*\*", text, re.I) or \
           re.match(r"^Files (Created|Modified|Involved)", text, re.I):
            capture = True
            continue
        if capture:
            if text.startswith("-"):
                path = text.lstrip("- ").strip()
                if path:
                    files.append(path)
                continue
            if text == "" or text.startswith("#"):
                capture = False
    return files


def extract_files_from_notes(notes):
    if not notes:
        return []
    matches = re.findall(r"[A-Za-z0-9_./-]+\.[A-Za-z0-9]+", notes)
    return matches


def resolve_file_path(project_dir, file_path):
    if not file_path:
        return None
    if os.path.isabs(file_path) and os.path.exists(file_path):
        return file_path
    cleaned = file_path.lstrip("./")
    candidate = os.path.join(project_dir, cleaned)
    if os.path.exists(candidate):
        return candidate
    return None


def collect_snippets(project_dir, files, max_snippets):
    snippets = []
    for file_path in files:
        resolved = resolve_file_path(project_dir, file_path)
        if not resolved:
            continue
        try:
            with open(resolved, "r", encoding="utf-8", errors="ignore") as f:
                lines = f.read().splitlines()[:80]
        except OSError:
            continue
        snippets.append((file_path, "\n".join(lines)))
        if len(snippets) >= max_snippets:
            break
    return snippets


def build_skill_md(skill_name, title, task_id, llm, duration, status, notes, files):
    desc = title or notes or task_id
    description = (
        f"Reusable workflow derived from session task {task_id}. "
        f"Use when implementing similar tasks to: {desc}."
    )

    files_block = "\n".join([f"- {f}" for f in files]) if files else "- (no files extracted)"
    duration_text = f"{duration} min" if duration is not None else "unknown"

    body = f"""---
name: {skill_name}
description: {description}
---

# {title or skill_name}

## Context
- Source task: {task_id}
- LLM: {llm}
- Duration: {duration_text}
- Status: {status}
- Notes: {notes}

## Objectives
- Execute the core workflow for this task type.
- Avoid regressions by keeping edge cases and tests explicit.

## Steps
1) Review related files and constraints.
2) Apply the workflow from the source task.
3) Run tests and verify expected behavior.
4) Update CLAUDE.md with results.

## Files (from session memory)
{files_block}

## Examples

```text
Task {task_id}: {desc}
When done: update CLAUDE.md with completion and notes.
```

## Resources
- references/source-task.md
"""
    return body


def write_skill(output_dir, skill_name, skill_md, source_task_md):
    os.makedirs(output_dir, exist_ok=True)
    skill_dir = unique_path(output_dir, skill_name)
    os.makedirs(skill_dir, exist_ok=True)

    with open(os.path.join(skill_dir, "SKILL.md"), "w", encoding="ascii", errors="ignore") as f:
        f.write(skill_md)

    ref_dir = os.path.join(skill_dir, "references")
    os.makedirs(ref_dir, exist_ok=True)
    with open(os.path.join(ref_dir, "source-task.md"), "w", encoding="ascii", errors="ignore") as f:
        f.write(source_task_md)

    return skill_dir


def build_source_task_md(task_id, title, llm, duration, status, notes, body_lines, files, snippets):
    duration_text = f"{duration} min" if duration is not None else "unknown"
    files_block = "\n".join([f"- {f}" for f in files]) if files else "- (no files extracted)"
    body_excerpt = "\n".join(body_lines[:120]) if body_lines else "(no section found)"
    snippet_block = ""
    if snippets:
        rendered = []
        for path, snippet in snippets:
            rendered.append(f"### {path}\n\n```\n{snippet}\n```")
        snippet_block = "\n\n## File Snippets\n\n" + "\n\n".join(rendered)
    return f"""# Source Task {task_id}

- Title: {title}
- LLM: {llm}
- Duration: {duration_text}
- Status: {status}
- Notes: {notes}

## Files
{files_block}
{snippet_block}

## Source Excerpt

```
{body_excerpt}
```
"""


def main():
    parser = argparse.ArgumentParser(description="Harvest skills from session memory.")
    parser.add_argument("--project-dir", default=".")
    parser.add_argument("--memory-file", default=None)
    parser.add_argument("--output-dir", default=None)
    parser.add_argument("--min-minutes", type=int, default=30)
    parser.add_argument("--debug-markers", default=",".join(DEFAULT_MARKERS))
    parser.add_argument("--max-skills", type=int, default=10)
    parser.add_argument("--include-snippets", action="store_true")
    parser.add_argument("--max-snippets", type=int, default=3)
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()

    project_dir = os.path.abspath(args.project_dir)
    memory_file = find_memory_file(project_dir, args.memory_file)
    output_dir = args.output_dir or os.path.join(
        project_dir,
        "agents_library",
        "agent-orchestrator-universal",
        "skills",
        "generated",
    )

    markers = [m.strip().lower() for m in args.debug_markers.split(",") if m.strip()]

    lines = read_lines(memory_file)

    completion_sections = extract_sections(lines, r"^#{1,6}\s+Task Completion Log\b")
    completion_rows = []
    for start, end in completion_sections:
        completion_rows.extend(parse_table(lines[start:end]))

    assignment_sections = extract_sections(lines, r"^#{1,6}\s+Task Assignment Queue\b")
    assignment_rows = []
    for start, end in assignment_sections:
        assignment_rows.extend(parse_table(lines[start:end]))
    assignment_map = {row[0]: row[1] for row in assignment_rows if len(row) > 1}

    task_sections = parse_task_sections(lines)

    candidates = []
    for row in completion_rows:
        if len(row) < 6:
            continue
        date, llm, task_id, duration, status, notes = row[:6]
        duration_min = duration_to_minutes(duration)
        is_long = duration_min is not None and duration_min >= args.min_minutes
        is_debug = contains_marker(notes, markers) or contains_marker(status, markers)
        if is_long or is_debug:
            title = assignment_map.get(task_id)
            section = task_sections.get(task_id, {})
            if not title:
                title = section.get("title")
            body_lines = section.get("body", [])
            files = extract_files_from_section(body_lines)
            if not files:
                files = extract_files_from_notes(notes)
            snippets = []
            if args.include_snippets:
                snippets = collect_snippets(project_dir, files, args.max_snippets)
            candidates.append({
                "task_id": task_id,
                "llm": llm,
                "duration": duration_min,
                "status": status,
                "notes": notes,
                "title": title or task_id,
                "body": body_lines,
                "files": files,
                "snippets": snippets,
            })

    if not candidates:
        print("No candidates found.")
        return

    candidates = candidates[: args.max_skills]

    print("Candidates:")
    for item in candidates:
        duration_text = f"{item['duration']} min" if item["duration"] is not None else "unknown"
        print(f"- {item['task_id']}: {item['title']} ({duration_text})")

    if not args.write:
        print("\nDry run complete. Use --write to generate skills.")
        return

    os.makedirs(output_dir, exist_ok=True)

    for item in candidates:
        desc = item["title"]
        slug = slugify(desc) or item["task_id"].lower().replace("_", "-")
        skill_name = f"{slug}"
        skill_md = build_skill_md(
            skill_name=skill_name,
            title=desc,
            task_id=item["task_id"],
            llm=item["llm"],
            duration=item["duration"],
            status=item["status"],
            notes=item["notes"],
            files=item["files"],
        )
        source_md = build_source_task_md(
            task_id=item["task_id"],
            title=desc,
            llm=item["llm"],
            duration=item["duration"],
            status=item["status"],
            notes=item["notes"],
            body_lines=item["body"],
            files=item["files"],
            snippets=item["snippets"],
        )
        skill_dir = write_skill(output_dir, skill_name, skill_md, source_md)
        print(f"Generated: {skill_dir}")


if __name__ == "__main__":
    main()
