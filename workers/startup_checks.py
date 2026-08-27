"""Startup dependency validation for the upload/status/result worker.

Loads the worker's environment from ``moana/.env.local`` then ``moana/.env``
— the same boundary ``scripts/kyc_worker.py``'s ``load_environment`` reads —
never from ``software_factory/.env``, which only configures the Factory
process that builds this worker, not the worker's own runtime.
"""

from __future__ import annotations

import os
import re
import subprocess
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from pathlib import Path

from dotenv import dotenv_values, load_dotenv

ROOT = Path(__file__).resolve().parents[1]

MOANA_ENV_FILES = (".env.local", ".env")

GEMINI_API_KEY_VAR = "GEMINI_API_KEY"
_MIN_GEMINI_KEY_LENGTH = 20

GEMINI_FREE_TIER_API_KEY_VAR = "GEMINI_FREE_TIER_API_KEY"
GEMINI_API_KEY_PAYFUL_VAR = "GEMINI_API_KEY_PAYFUL"
SUPABASE_URL_VAR = "SUPABASE_URL"
SUPABASE_KEY_VAR = "SUPABASE_KEY"

_TARGET_SECRET_VARS = (
    GEMINI_FREE_TIER_API_KEY_VAR,
    GEMINI_API_KEY_PAYFUL_VAR,
    SUPABASE_URL_VAR,
    SUPABASE_KEY_VAR,
)

_SUPABASE_URL_RE = re.compile(r"^https://[a-z0-9-]+\.supabase\.co/?$")
_SUPABASE_KEY_RE = re.compile(r"^[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}$")

RunFn = Callable[..., subprocess.CompletedProcess]
TargetSecretResolver = Callable[[str], "tuple[str | None, str]"]


class WorkerConfigurationError(RuntimeError):
    """Raised when a required worker dependency is missing or unavailable."""


def load_worker_environment() -> None:
    """Load moana/.env.local then moana/.env, matching scripts/kyc_worker.py's boundary."""
    for filename in MOANA_ENV_FILES:
        load_dotenv(ROOT / filename, override=False)


def _check_gemini_api_key(env: Mapping[str, str]) -> None:
    if not env.get(GEMINI_API_KEY_VAR, "").strip():
        raise WorkerConfigurationError(f"Missing configuration: {GEMINI_API_KEY_VAR}")


def _is_valid_gemini_key_format(value: str) -> bool:
    return len(value) >= _MIN_GEMINI_KEY_LENGTH and not any(char.isspace() for char in value)


def _is_valid_supabase_url_format(value: str) -> bool:
    return bool(_SUPABASE_URL_RE.match(value))


def _is_valid_supabase_key_format(value: str) -> bool:
    return bool(_SUPABASE_KEY_RE.match(value))


_SECRET_FORMAT_VALIDATORS: dict[str, Callable[[str], bool]] = {
    GEMINI_FREE_TIER_API_KEY_VAR: _is_valid_gemini_key_format,
    GEMINI_API_KEY_PAYFUL_VAR: _is_valid_gemini_key_format,
    SUPABASE_URL_VAR: _is_valid_supabase_url_format,
    SUPABASE_KEY_VAR: _is_valid_supabase_key_format,
}


def _load_target_secret(var: str) -> "tuple[str | None, str]":
    """Resolve one target secret strictly from moana/.env.local then moana/.env.

    Never consults ``os.environ`` and never reads ``software_factory/.env``:
    only these two workspace-anchored files count as valid provenance, so a
    value inherited from the Factory's own shell (or any other process-level
    source) can never satisfy this check even if it shares the variable's
    name. Returns ``(None, "absent")`` when the variable is not set to a
    non-blank value in either file.
    """
    for filename in MOANA_ENV_FILES:
        path = ROOT / filename
        if not path.is_file():
            continue
        value = dotenv_values(path).get(var)
        if value is not None and value.strip():
            return value, f"moana/{filename}"
    return None, "absent"


def _check_target_secrets(resolver: TargetSecretResolver) -> None:
    for var in _TARGET_SECRET_VARS:
        value, source = resolver(var)
        if source == "absent" or value is None:
            raise WorkerConfigurationError(
                f"Missing configuration: {var} (expected in moana/.env.local or moana/.env)"
            )
        if not _SECRET_FORMAT_VALIDATORS[var](value.strip()):
            raise WorkerConfigurationError(f"Invalid configuration format: {var} (source: {source})")


def _check_ffmpeg(run: RunFn) -> None:
    try:
        result = run(["ffmpeg", "-version"], capture_output=True, text=True, check=False, timeout=10)
    except FileNotFoundError as exc:
        raise WorkerConfigurationError("Missing dependency: ffmpeg is not installed") from exc
    if result.returncode != 0:
        raise WorkerConfigurationError("Missing dependency: ffmpeg -version failed")


def validate_worker_startup(
    env: Mapping[str, str] | None = None,
    run: RunFn = subprocess.run,
    target_secret_resolver: TargetSecretResolver | None = None,
) -> None:
    """Validate GEMINI_API_KEY, the four target secrets, and ffmpeg before the
    worker consumes any job.

    Raises ``WorkerConfigurationError`` naming the failing dependency.
    GEMINI_API_KEY is checked first so a missing key fails fast without ever
    invoking ``run`` (mirrors ``workers/deploy/deploy.py``'s check order: no
    external probe is attempted once local configuration is known invalid).
    GEMINI_FREE_TIER_API_KEY, GEMINI_API_KEY_PAYFUL, SUPABASE_URL and
    SUPABASE_KEY are then each resolved via ``target_secret_resolver``
    (default: ``_load_target_secret``, which only ever reads
    moana/.env.local and moana/.env — never software_factory/.env, never
    ``os.environ`` directly, so a value inherited from the Factory's own
    shell can never pass as Moana-provided configuration) and validated for
    presence and format. Never logs or returns the value of any secret.
    """
    if env is None:
        load_worker_environment()
        active_env = os.environ
    else:
        active_env = env
    _check_gemini_api_key(active_env)
    resolver = target_secret_resolver if target_secret_resolver is not None else _load_target_secret
    _check_target_secrets(resolver)
    _check_ffmpeg(run)


@dataclass(frozen=True)
class SecretProbeResult:
    """Safe diagnostic snapshot: presence, provenance, and format — never the value."""

    variable: str
    state: str
    expected_source: str
    length: int | None = None
    resolved_source: str | None = None


def _classify_gemini_key(raw: str | None) -> tuple[str, int | None]:
    if raw is None or not raw.strip():
        return "absent", None
    value = raw.strip()
    if len(value) < _MIN_GEMINI_KEY_LENGTH or any(char.isspace() for char in value):
        return "malformed", len(value)
    return "present", len(value)


def secret_probe_report(env: Mapping[str, str] | None = None) -> SecretProbeResult:
    """Report GEMINI_API_KEY presence/format without ever exposing its value.

    Documents the worker's actual environment boundary: moana/.env.local
    then moana/.env (see ``load_worker_environment``) — never
    software_factory/.env, which configures the Factory, not this worker.
    """
    active_env = env if env is not None else os.environ
    state, length = _classify_gemini_key(active_env.get(GEMINI_API_KEY_VAR))
    return SecretProbeResult(
        variable=GEMINI_API_KEY_VAR,
        state=state,
        expected_source="moana/.env.local, moana/.env (not software_factory/.env)",
        length=length,
    )


def target_secret_probe_report(
    var: str,
    resolver: TargetSecretResolver | None = None,
) -> SecretProbeResult:
    """Report one target secret's presence/provenance/format — never its value.

    ``var`` must be one of ``_TARGET_SECRET_VARS``. ``resolver`` defaults to
    ``_load_target_secret`` (moana/.env.local, moana/.env only — never
    software_factory/.env, never os.environ directly).
    """
    if var not in _SECRET_FORMAT_VALIDATORS:
        raise ValueError(f"Unknown target secret variable: {var}")
    resolve = resolver if resolver is not None else _load_target_secret
    value, source = resolve(var)
    if source == "absent" or value is None:
        return SecretProbeResult(
            variable=var,
            state="absent",
            expected_source="moana/.env.local, moana/.env (not software_factory/.env)",
            resolved_source=source,
        )
    stripped = value.strip()
    state = "present" if _SECRET_FORMAT_VALIDATORS[var](stripped) else "malformed"
    return SecretProbeResult(
        variable=var,
        state=state,
        expected_source="moana/.env.local, moana/.env (not software_factory/.env)",
        length=len(stripped),
        resolved_source=source,
    )
