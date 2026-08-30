"""Model-agnostic deployment hook for the dedicated brochure-video EC2 worker.

The target is intentionally pinned by AWS account, instance id, availability
zone, public IP, instance name and SSH host-key fingerprint. Authentication is
performed with EC2 Instance Connect and a throw-away Ed25519 key; no long-lived
private key is read from the repository, an LLM session or an environment
variable.

Modes:

* default: deterministic local plan, with no network or remote mutation;
* ``check``: verify AWS identity, target metadata, pinned SSH host key, remote
  startup configuration and systemd state;
* ``--apply``: run the focused local tests, back up the current remote files,
  deploy the fixed artifact allow-list and verify the live imports/checksums.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import secrets
import shlex
import shutil
import subprocess
import sys
import tarfile
import tempfile
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from pathlib import Path

AWS_ACCOUNT_ID = "958587270825"
AWS_REGION = "eu-west-3"
INSTANCE_ID = "i-045f4cdf652b303fe"
AVAILABILITY_ZONE = "eu-west-3a"
INSTANCE_NAME = "moana-brochure-video"
PUBLIC_IP = "51.45.17.78"
REMOTE_USER = "ubuntu"
REMOTE_ROOT = "/home/ubuntu/moana"
REMOTE_TARGET = f"{REMOTE_USER}@{PUBLIC_IP}"
EXPECTED_ED25519_HOST_FINGERPRINT = "SHA256:ka/dv15mve1esoaXB+/Uzp5M2fEhrIWWXE51dYsnCe4"

ARTIFACTS: tuple[str, ...] = (
    "workers/brochure_video_runner.py",
    "workers/gemini_pdf_classifier.py",
    "workers/gemini_veo_generator.py",
    "workers/job_contract.py",
    "workers/pdf_image_extractor.py",
    "workers/startup_checks.py",
    "workers/veo_generator.py",
    "workers/vertex_veo_transport.py",
    "workers/video_assembler.py",
    "workers/deploy/moana-brochure-video@.service",
)
PYTHON_ARTIFACTS = tuple(path for path in ARTIFACTS if path.endswith(".py"))
UNIT_ARTIFACT = "workers/deploy/moana-brochure-video@.service"
REMOTE_UNIT = "/etc/systemd/system/moana-brochure-video@.service"

TEST_FILES: tuple[str, ...] = (
    "tests/backend/test_veo_generator.py",
    "tests/backend/test_brochure_editorial_direction.py",
    "tests/backend/test_brochure_video_runner.py",
    "tests/backend/test_video_assembler.py",
)

RunFn = Callable[..., subprocess.CompletedProcess[str]]


class DeploymentHookError(RuntimeError):
    """A safe preflight, deployment or verification step failed."""


@dataclass(frozen=True)
class Connection:
    private_key: Path
    public_key: Path
    known_hosts: Path
    aws_command: tuple[str, ...]

    @property
    def ssh_options(self) -> tuple[str, ...]:
        return (
            "-i",
            str(self.private_key),
            "-o",
            "IdentitiesOnly=yes",
            "-o",
            "BatchMode=yes",
            "-o",
            "StrictHostKeyChecking=yes",
            "-o",
            f"UserKnownHostsFile={self.known_hosts}",
            "-o",
            "ConnectTimeout=15",
        )


def _run(
    command: Sequence[str],
    *,
    run: RunFn = subprocess.run,
    timeout: float = 60.0,
    check: bool = True,
) -> subprocess.CompletedProcess[str]:
    try:
        result = run(
            list(command),
            capture_output=True,
            text=True,
            check=False,
            timeout=timeout,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise DeploymentHookError(f"unable to run {command[0]}: {exc.__class__.__name__}") from exc
    if check and result.returncode != 0:
        detail = (result.stderr or result.stdout).strip()
        if len(detail) > 1200:
            detail = detail[:1200] + "…"
        raise DeploymentHookError(
            f"{command[0]} exited with {result.returncode}" + (f": {detail}" if detail else "")
        )
    return result


def build_plan(repo_root: Path) -> dict[str, object]:
    return {
        "mode": "dry-run",
        "target": {
            "account_id": AWS_ACCOUNT_ID,
            "region": AWS_REGION,
            "availability_zone": AVAILABILITY_ZONE,
            "instance_id": INSTANCE_ID,
            "instance_name": INSTANCE_NAME,
            "public_ip": PUBLIC_IP,
            "remote_root": REMOTE_ROOT,
            "host_key_fingerprint": EXPECTED_ED25519_HOST_FINGERPRINT,
        },
        "authentication": "EC2 Instance Connect with an ephemeral Ed25519 key",
        "artifacts": [
            {"path": path, "exists": (repo_root / path).is_file()} for path in ARTIFACTS
        ],
        "tests": list(TEST_FILES),
        "safety": [
            "abort when a brochure-video job is active",
            "backup every live artifact before replacement",
            "rollback live artifacts automatically on remote verification failure",
            "verify exact staged/live bytes and Python imports",
        ],
    }


def _validate_local_files(repo_root: Path) -> None:
    missing = [path for path in (*ARTIFACTS, *TEST_FILES) if not (repo_root / path).is_file()]
    if missing:
        raise DeploymentHookError(f"missing local files: {', '.join(missing)}")


def _resolve_aws_command(run: RunFn = subprocess.run) -> tuple[str, ...]:
    candidates: list[tuple[str, ...]] = []
    aws_path = shutil.which("aws")
    if aws_path:
        candidates.append((aws_path,))
    uvx_path = shutil.which("uvx")
    if uvx_path:
        candidates.append((uvx_path, "--from", "awscli", "aws"))
    for candidate in candidates:
        try:
            result = _run((*candidate, "--version"), run=run, timeout=30.0, check=False)
        except DeploymentHookError:
            continue
        if result.returncode == 0:
            return candidate
    raise DeploymentHookError("AWS CLI unavailable: install aws or uvx")


def _aws_json(
    aws_command: Sequence[str], args: Sequence[str], *, run: RunFn = subprocess.run
) -> object:
    result = _run((*aws_command, *args, "--output", "json"), run=run, timeout=60.0)
    try:
        return json.loads(result.stdout)
    except json.JSONDecodeError as exc:
        raise DeploymentHookError("AWS CLI returned invalid JSON") from exc


def _verify_aws_target(aws_command: Sequence[str], *, run: RunFn = subprocess.run) -> None:
    identity = _aws_json(aws_command, ("sts", "get-caller-identity"), run=run)
    if not isinstance(identity, dict) or identity.get("Account") != AWS_ACCOUNT_ID:
        raise DeploymentHookError("AWS account does not match the pinned deployment account")

    payload = _aws_json(
        aws_command,
        (
            "ec2",
            "describe-instances",
            "--region",
            AWS_REGION,
            "--instance-ids",
            INSTANCE_ID,
        ),
        run=run,
    )
    try:
        instance = payload["Reservations"][0]["Instances"][0]  # type: ignore[index]
        tags = {item["Key"]: item["Value"] for item in instance.get("Tags", [])}
    except (KeyError, IndexError, TypeError) as exc:
        raise DeploymentHookError("pinned EC2 instance was not returned by AWS") from exc
    expected = {
        "state": instance.get("State", {}).get("Name"),
        "availability_zone": instance.get("Placement", {}).get("AvailabilityZone"),
        "public_ip": instance.get("PublicIpAddress"),
        "name": tags.get("Name"),
    }
    if expected != {
        "state": "running",
        "availability_zone": AVAILABILITY_ZONE,
        "public_ip": PUBLIC_IP,
        "name": INSTANCE_NAME,
    }:
        raise DeploymentHookError(f"pinned EC2 metadata mismatch: {expected}")


def _prepare_connection(
    temp_dir: Path, aws_command: tuple[str, ...], *, run: RunFn = subprocess.run
) -> Connection:
    private_key = temp_dir / "id_ed25519"
    public_key = temp_dir / "id_ed25519.pub"
    known_hosts = temp_dir / "known_hosts"
    _run(
        ("ssh-keygen", "-q", "-t", "ed25519", "-N", "", "-f", str(private_key)),
        run=run,
        timeout=30.0,
    )
    scan = _run(
        ("ssh-keyscan", "-T", "10", "-t", "ed25519", PUBLIC_IP),
        run=run,
        timeout=20.0,
    )
    known_hosts.write_text(scan.stdout, encoding="utf-8")
    os.chmod(known_hosts, 0o600)
    fingerprint = _run(("ssh-keygen", "-lf", str(known_hosts)), run=run, timeout=10.0)
    fields = fingerprint.stdout.split()
    if len(fields) < 2 or fields[1] != EXPECTED_ED25519_HOST_FINGERPRINT:
        raise DeploymentHookError("SSH host-key fingerprint does not match the pinned EC2 host")
    return Connection(private_key, public_key, known_hosts, aws_command)


def _refresh_instance_connect(connection: Connection, *, run: RunFn = subprocess.run) -> None:
    _run(
        (
            *connection.aws_command,
            "ec2-instance-connect",
            "send-ssh-public-key",
            "--region",
            AWS_REGION,
            "--instance-id",
            INSTANCE_ID,
            "--availability-zone",
            AVAILABILITY_ZONE,
            "--instance-os-user",
            REMOTE_USER,
            "--ssh-public-key",
            f"file://{connection.public_key}",
        ),
        run=run,
        timeout=60.0,
    )


def _ssh(
    connection: Connection,
    script: str,
    *,
    run: RunFn = subprocess.run,
    timeout: float = 120.0,
) -> subprocess.CompletedProcess[str]:
    _refresh_instance_connect(connection, run=run)
    return _run(
        (
            "ssh",
            *connection.ssh_options,
            REMOTE_TARGET,
            f"bash -lc {shlex.quote(script)}",
        ),
        run=run,
        timeout=timeout,
    )


def _remote_preflight(
    connection: Connection,
    *,
    require_idle: bool,
    run: RunFn = subprocess.run,
) -> str:
    active_job_check = (
        """
if ps -eo comm=,args= | awk '$1 ~ /^python(3(\\.[0-9]+)?)?$/ && $0 ~ /workers\\.brochure_video_runner/ { found=1 } END { exit found ? 0 : 1 }'; then
  echo 'active brochure-video job detected' >&2
  exit 42
fi
active_jobs=none
"""
        if require_idle
        else """
if ps -eo comm=,args= | awk '$1 ~ /^python(3(\\.[0-9]+)?)?$/ && $0 ~ /workers\\.brochure_video_runner/ { found=1 } END { exit found ? 0 : 1 }'; then
  active_jobs=present
else
  active_jobs=none
fi
"""
    )
    script = f"""
set -euo pipefail
test "$(hostname)" = "ip-172-31-11-228"
test -d {shlex.quote(REMOTE_ROOT + '/workers')}
test -x {shlex.quote(REMOTE_ROOT + '/.venv/bin/python3')}
test -f {shlex.quote(REMOTE_UNIT)}
cd {shlex.quote(REMOTE_ROOT)}
.venv/bin/python3 -c 'from workers.startup_checks import validate_worker_startup; validate_worker_startup()'
systemctl cat moana-brochure-video@.service >/dev/null
if systemctl --failed --no-legend --no-pager | grep -q 'moana-brochure-video@'; then
  systemctl --failed --no-legend --no-pager | grep 'moana-brochure-video@'
  exit 1
fi
{active_job_check}
echo "remote_preflight=ok active_jobs=$active_jobs"
"""
    return _ssh(connection, script, run=run, timeout=120.0).stdout.strip()


def _run_local_tests(repo_root: Path, *, run: RunFn = subprocess.run) -> None:
    python = repo_root / ".venv/bin/python"
    if not python.is_file():
        raise DeploymentHookError("local .venv/bin/python is required for deployment tests")
    _run(
        (
            str(python),
            "-m",
            "pytest",
            "-q",
            *TEST_FILES,
        ),
        run=run,
        timeout=300.0,
    )


def _make_archive(repo_root: Path, temp_dir: Path, deployment_id: str) -> Path:
    archive = temp_dir / f"{deployment_id}.tar.gz"
    with tarfile.open(archive, "w:gz") as bundle:
        for relative_path in ARTIFACTS:
            bundle.add(repo_root / relative_path, arcname=relative_path, recursive=False)
    return archive


def _upload_archive(
    connection: Connection,
    archive: Path,
    remote_archive: str,
    *,
    run: RunFn = subprocess.run,
) -> None:
    _refresh_instance_connect(connection, run=run)
    _run(
        (
            "scp",
            *connection.ssh_options,
            str(archive),
            f"{REMOTE_TARGET}:{remote_archive}",
        ),
        run=run,
        timeout=120.0,
    )


def _remote_apply_script(deployment_id: str, remote_archive: str) -> str:
    stage = f"/tmp/{deployment_id}"
    backup = f"{REMOTE_ROOT}/deploy-backups/{deployment_id}"
    python_paths = " ".join(shlex.quote(f"{stage}/{path}") for path in PYTHON_ARTIFACTS)
    backup_lines = "\n".join(
        f"install -D -m 0644 {shlex.quote(f'{REMOTE_ROOT}/{path}')} "
        f"{shlex.quote(f'{backup}/{path}')}"
        for path in PYTHON_ARTIFACTS
    )
    install_lines = "\n".join(
        f"install -m 0644 {shlex.quote(f'{stage}/{path}')} "
        f"{shlex.quote(f'{REMOTE_ROOT}/{path}')}"
        for path in PYTHON_ARTIFACTS
    )
    rollback_lines = "\n".join(
        f"  install -m 0644 {shlex.quote(f'{backup}/{path}')} "
        f"{shlex.quote(f'{REMOTE_ROOT}/{path}')}"
        for path in PYTHON_ARTIFACTS
    )
    compare_lines = "\n".join(
        f"cmp -s {shlex.quote(f'{stage}/{path}')} {shlex.quote(f'{REMOTE_ROOT}/{path}')}"
        for path in PYTHON_ARTIFACTS
    )
    return f"""
set -euo pipefail
exec 9>/run/lock/moana-brochure-video-deploy.lock
if ! flock -n 9; then
  echo 'another brochure-video deployment is already running' >&2
  exit 43
fi
stage={shlex.quote(stage)}
backup={shlex.quote(backup)}
archive={shlex.quote(remote_archive)}
mkdir -p "$stage" "$backup"
tar -xzf "$archive" -C "$stage"
{REMOTE_ROOT}/.venv/bin/python3 -m py_compile {python_paths}
{backup_lines}
sudo install -D -m 0644 {shlex.quote(REMOTE_UNIT)} {shlex.quote(f'{backup}/systemd/moana-brochure-video@.service')}
rollback() {{
  set +e
{rollback_lines}
  sudo install -m 0644 {shlex.quote(f'{backup}/systemd/moana-brochure-video@.service')} {shlex.quote(REMOTE_UNIT)}
  sudo systemctl daemon-reload
  rm -rf "$stage"
  rm -f "$archive"
}}
trap rollback ERR
{install_lines}
sudo install -m 0644 {shlex.quote(f'{stage}/{UNIT_ARTIFACT}')} {shlex.quote(REMOTE_UNIT)}
sudo systemctl daemon-reload
cd {shlex.quote(REMOTE_ROOT)}
.venv/bin/python3 -m py_compile {' '.join(shlex.quote(path) for path in PYTHON_ARTIFACTS)}
.venv/bin/python3 -c 'from workers.veo_generator import CLIP_DURATION_S, VEO_PROMPT_VERSION; from workers.brochure_video_runner import CREATIVE_PIPELINE_VERSION; assert CLIP_DURATION_S == 6.0; print(f"prompt_version={{VEO_PROMPT_VERSION}} pipeline_version={{CREATIVE_PIPELINE_VERSION}}")'
{compare_lines}
cmp -s {shlex.quote(f'{stage}/{UNIT_ARTIFACT}')} {shlex.quote(REMOTE_UNIT)}
systemctl cat moana-brochure-video@.service >/dev/null
trap - ERR
rm -r "$stage"
rm "$archive"
echo 'deployment=ok backup='"$backup"
"""


def run_check(repo_root: Path, *, run: RunFn = subprocess.run) -> str:
    _validate_local_files(repo_root)
    aws_command = _resolve_aws_command(run)
    _verify_aws_target(aws_command, run=run)
    with tempfile.TemporaryDirectory(prefix="moana-brochure-video-check-") as raw_temp:
        connection = _prepare_connection(Path(raw_temp), aws_command, run=run)
        return _remote_preflight(connection, require_idle=False, run=run)


def run_apply(
    repo_root: Path,
    *,
    run: RunFn = subprocess.run,
    skip_tests: bool = False,
) -> str:
    _validate_local_files(repo_root)
    if not skip_tests:
        _run_local_tests(repo_root, run=run)
    aws_command = _resolve_aws_command(run)
    _verify_aws_target(aws_command, run=run)
    deployment_id = (
        "brochure-video-"
        + dt.datetime.now(dt.UTC).strftime("%Y%m%dT%H%M%SZ-")
        + secrets.token_hex(4)
    )
    remote_archive = f"/tmp/{deployment_id}.tar.gz"
    with tempfile.TemporaryDirectory(prefix="moana-brochure-video-deploy-") as raw_temp:
        temp_dir = Path(raw_temp)
        connection = _prepare_connection(temp_dir, aws_command, run=run)
        preflight = _remote_preflight(connection, require_idle=True, run=run)
        archive = _make_archive(repo_root, temp_dir, deployment_id)
        _upload_archive(connection, archive, remote_archive, run=run)
        deployed = _ssh(
            connection,
            _remote_apply_script(deployment_id, remote_archive),
            run=run,
            timeout=300.0,
        ).stdout.strip()
    return f"{preflight}\n{deployed}"


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Deploy the pinned brochure-video EC2 worker")
    parser.add_argument("command", nargs="?", choices=("plan", "check"), default="plan")
    parser.add_argument("--apply", action="store_true", help="perform the real deployment")
    parser.add_argument("--skip-tests", action="store_true", help="skip local tests (emergency only)")
    parser.add_argument("--repo-root", type=Path, default=Path(__file__).resolve().parents[2])
    args = parser.parse_args(argv)
    repo_root = args.repo_root.resolve()
    try:
        if args.apply:
            print(run_apply(repo_root, skip_tests=args.skip_tests))
        elif args.command == "check":
            print(run_check(repo_root))
        else:
            print(json.dumps(build_plan(repo_root), ensure_ascii=False, indent=2, sort_keys=True))
    except DeploymentHookError as exc:
        print(f"deployment hook failed: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
