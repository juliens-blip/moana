"""Offline contract tests for the model-agnostic brochure-video deploy hook."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

from workers.deploy import deploy_brochure_video as hook

REPO_ROOT = Path(__file__).resolve().parents[2]
HOOK = REPO_ROOT / "scripts/deploy-brochure-video"


def test_plan_is_pinned_complete_and_contains_no_private_key() -> None:
    plan = hook.build_plan(REPO_ROOT)

    assert plan["mode"] == "dry-run"
    assert plan["target"] == {
        "account_id": "958587270825",
        "region": "eu-west-3",
        "availability_zone": "eu-west-3a",
        "instance_id": "i-045f4cdf652b303fe",
        "instance_name": "moana-brochure-video",
        "public_ip": "51.45.17.78",
        "remote_root": "/home/ubuntu/moana",
        "host_key_fingerprint": hook.EXPECTED_ED25519_HOST_FINGERPRINT,
    }
    assert all(item["exists"] for item in plan["artifacts"])
    serialized = json.dumps(plan)
    assert "PRIVATE KEY" not in serialized
    assert "MOANA_SSH_KEY" not in serialized


def test_default_cli_is_an_offline_deterministic_plan() -> None:
    first = subprocess.run(
        [sys.executable, str(REPO_ROOT / "workers/deploy/deploy_brochure_video.py")],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=True,
        timeout=30,
    ).stdout
    second = subprocess.run(
        [sys.executable, str(REPO_ROOT / "workers/deploy/deploy_brochure_video.py")],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=True,
        timeout=30,
    ).stdout

    assert first == second
    assert json.loads(first)["target"]["instance_id"] == hook.INSTANCE_ID


def test_universal_wrapper_and_safety_contract_are_explicit() -> None:
    source = HOOK.read_text(encoding="utf-8")
    deploy_source = Path(hook.__file__).read_text(encoding="utf-8")

    assert source.startswith("#!/usr/bin/env bash")
    assert "deploy_brochure_video.py" in source
    assert "ec2-instance-connect" in deploy_source
    assert "TemporaryDirectory" in deploy_source
    assert "EXPECTED_ED25519_HOST_FINGERPRINT" in deploy_source
    assert "active brochure-video job detected" in deploy_source
    assert "require_idle" in deploy_source
    assert "moana-brochure-video-deploy.lock" in deploy_source
    assert "rollback" in deploy_source
    assert "MOANA_SSH_KEY" not in deploy_source


def test_generated_remote_apply_script_is_valid_bash() -> None:
    script = hook._remote_apply_script(
        "brochure-video-20260830T000000Z-deadbeef",
        "/tmp/brochure-video-20260830T000000Z-deadbeef.tar.gz",
    )

    result = subprocess.run(
        ["bash", "-n"],
        input=script,
        capture_output=True,
        text=True,
        check=False,
        timeout=30,
    )
    assert result.returncode == 0, result.stderr
    assert "another brochure-video deployment is already running" in script
    assert "trap rollback ERR" in script
