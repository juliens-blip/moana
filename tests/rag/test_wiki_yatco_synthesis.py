import subprocess
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]


def test_yatco_wiki_synthesis() -> None:
    yatco_global_path = REPO_ROOT / "wiki" / "YATCO-Global.md"
    architecture_path = REPO_ROOT / "wiki" / "Architecture.md"

    assert yatco_global_path.exists(), "wiki/YATCO-Global.md must exist"
    assert architecture_path.exists(), "wiki/Architecture.md must exist"

    yatco_content = yatco_global_path.read_text(encoding="utf-8")
    arch_content = architecture_path.read_text(encoding="utf-8")

    # 1. Check mandatory sections in wiki/YATCO-Global.md
    mandatory_sections = ["## Collecte", "## Ingestion", "## Timer", "## Déploiement", "## Rollback"]
    for section in mandatory_sections:
        assert section in yatco_content, f"Missing section '{section}' in wiki/YATCO-Global.md"

    # 2. Check pointers in wiki/YATCO-Global.md
    assert "scripts/yatco_collector.py" in yatco_content, "Missing pointer to scripts/yatco_collector.py in wiki/YATCO-Global.md"
    assert "workers/yatco_ingest_worker.py" in yatco_content, "Missing pointer to workers/yatco_ingest_worker.py in wiki/YATCO-Global.md"
    assert "workers/deploy/deploy.py" in yatco_content, "Missing pointer to workers/deploy/deploy.py in wiki/YATCO-Global.md"

    # 3. Check wiki/Architecture.md under Flux clés section
    assert "## Flux clés" in arch_content, "Missing '## Flux clés' in wiki/Architecture.md"
    flux_cles_part = arch_content.split("## Flux clés")[1].split("## ")[0]
    assert "[[YATCO-Global]]" in flux_cles_part, "wiki/Architecture.md Flux clés must reference [[YATCO-Global]]"
    assert "/api/leads/yatco" in flux_cles_part, "wiki/Architecture.md Flux clés must reference /api/leads/yatco webhook distinction"

    # 4. Check git status under wiki/
    res = subprocess.run(
        ["git", "status", "--porcelain", "wiki/"],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=True,
    )
    changed_files = [line.strip().split()[-1] for line in res.stdout.strip().splitlines() if line.strip()]
    allowed_files = {"wiki/YATCO-Global.md", "wiki/Architecture.md"}
    for file_path in changed_files:
        assert file_path in allowed_files, f"Unexpected modified file under wiki/: {file_path}"
