"""Test déterministe de l'unité systemd oneshot du runner brochure (plan.json T1 S3/S5).

Parse uniquement le fichier texte de l'unité : aucun démarrage de systemd,
aucun accès réseau.
"""

from __future__ import annotations

from pathlib import Path

SERVICE_PATH = Path(__file__).resolve().parents[2] / "workers" / "deploy" / "moana-brochure-video@.service"

_SECRET_MARKERS = ("SUPABASE_SERVICE_ROLE_KEY=", "GEMINI_API_KEY=", "MOANA_SSH_KEY=")


def _parse_ini(text: str) -> dict[str, list[str]]:
    section = None
    result: dict[str, list[str]] = {}
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("[") and line.endswith("]"):
            section = line
            result.setdefault(section, [])
            continue
        if section is not None:
            result[section].append(line)
    return result


def test_systemd_template_passes_instance_id() -> None:
    text = SERVICE_PATH.read_text(encoding="utf-8")
    sections = _parse_ini(text)

    service_lines = sections.get("[Service]", [])
    exec_start = [line for line in service_lines if line.startswith("ExecStart=")]
    assert exec_start, "ExecStart is required"
    assert "%i" in exec_start[0], "ExecStart must forward the systemd instance (%i) as the job id"

    assert "Type=oneshot" in service_lines
    assert "TimeoutStartSec=600" in service_lines


def test_systemd_unit_has_no_hardcoded_secret() -> None:
    text = SERVICE_PATH.read_text(encoding="utf-8")
    for marker in _SECRET_MARKERS:
        assert marker not in text, f"unit file must not hardcode {marker.rstrip('=')}"


def test_systemd_unit_is_readable_without_starting_systemd() -> None:
    assert SERVICE_PATH.is_file()
