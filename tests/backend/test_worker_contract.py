"""Tests déterministes du contrat job upload/status/result (plan.json S1/S2/S3).

Aucun accès réseau, aucune clé Gemini réelle, aucun ffmpeg réellement
installé requis : ``run`` est injecté partout où un sous-processus serait
appelé, comme dans ``tests/backend/test_deploy_preflight.py``.

Audit S5 : aucun test backend existant ne référence GEMINI_API_KEY, ffmpeg,
job_contract ou startup_checks avant ce fichier (grep sur tests/, workers/,
scripts/) — il n'y a donc aucun test préexistant à aligner sur le nouveau
contrat.
"""

from __future__ import annotations

import subprocess

import pytest

from workers import startup_checks
from workers.job_contract import (
    JobContractError,
    JobError,
    JobPhase,
    JobStatus,
    UploadStatusResultJob,
)
from workers.startup_checks import (
    GEMINI_API_KEY_PAYFUL_VAR,
    GEMINI_API_KEY_VAR,
    GEMINI_FREE_TIER_API_KEY_VAR,
    SUPABASE_KEY_VAR,
    SUPABASE_URL_VAR,
    WorkerConfigurationError,
    secret_probe_report,
    target_secret_probe_report,
    validate_worker_startup,
)

FAKE_GEMINI_KEY_SENTINEL = "fakefakefakefakefakefake"
FAKE_GEMINI_KEY = f"AIza{FAKE_GEMINI_KEY_SENTINEL}"

FAKE_GEMINI_FREE_TIER_KEY = f"AIza{'f' * 24}"
FAKE_GEMINI_PAYFUL_KEY = f"AIza{'p' * 24}"
FAKE_SUPABASE_URL = "https://abcdefghijklmnop.supabase.co"
FAKE_SUPABASE_KEY = "headerpart000.payloadpart111.signaturepart222"

_VALID_TARGET_SECRETS: dict[str, tuple[str, str]] = {
    GEMINI_FREE_TIER_API_KEY_VAR: (FAKE_GEMINI_FREE_TIER_KEY, "moana/.env.local"),
    GEMINI_API_KEY_PAYFUL_VAR: (FAKE_GEMINI_PAYFUL_KEY, "moana/.env.local"),
    SUPABASE_URL_VAR: (FAKE_SUPABASE_URL, "moana/.env"),
    SUPABASE_KEY_VAR: (FAKE_SUPABASE_KEY, "moana/.env"),
}

_TARGET_SECRET_VARS = tuple(_VALID_TARGET_SECRETS)


def _valid_target_secret_resolver(var: str) -> tuple[str, str]:
    return _VALID_TARGET_SECRETS[var]


def _make_resolver(overrides: dict[str, tuple[str | None, str]]):
    def resolver(var: str) -> tuple[str | None, str]:
        if var in overrides:
            return overrides[var]
        return _VALID_TARGET_SECRETS[var]

    return resolver


def _ok_run(command, **kwargs):
    return subprocess.CompletedProcess(command, 0, stdout="ffmpeg version 6.0", stderr="")


def _failing_run(command, **kwargs):
    return subprocess.CompletedProcess(command, 1, stdout="", stderr="not found")


def _unexpected_run(*args, **kwargs):  # pragma: no cover - ne doit jamais être appelé
    raise AssertionError("aucune sonde ffmpeg ne doit être tentée sans GEMINI_API_KEY valide")


# ---------------------------------------------------------------------------
# UploadStatusResultJob (S1)
# ---------------------------------------------------------------------------


def test_valid_upload_phase_job() -> None:
    job = UploadStatusResultJob(
        job_id="job-1",
        upload_ref="uploads/brochure.pdf",
        phase=JobPhase.UPLOAD.value,
        status=JobStatus.PENDING.value,
    )
    assert job.phase == "upload"
    assert job.status == "pending"
    assert job.result is None
    assert job.error is None


def test_valid_status_phase_job() -> None:
    job = UploadStatusResultJob(
        job_id="job-1",
        upload_ref="uploads/brochure.pdf",
        phase=JobPhase.STATUS.value,
        status=JobStatus.PROCESSING.value,
    )
    assert job.phase == "status"
    assert job.status == "processing"


def test_valid_result_phase_job_with_result_payload() -> None:
    job = UploadStatusResultJob(
        job_id="job-1",
        upload_ref="uploads/brochure.pdf",
        phase=JobPhase.RESULT.value,
        status=JobStatus.DONE.value,
        result={"video_url": "https://example.test/out.mp4"},
    )
    assert job.result == {"video_url": "https://example.test/out.mp4"}
    assert job.error is None


def test_valid_result_phase_job_with_terminal_error() -> None:
    job = UploadStatusResultJob(
        job_id="job-1",
        upload_ref="uploads/brochure.pdf",
        phase=JobPhase.RESULT.value,
        status=JobStatus.ERROR.value,
        error=JobError(code="gemini_timeout", message="Veo generation timed out"),
    )
    assert job.error is not None
    assert job.error.code == "gemini_timeout"
    assert job.result is None


@pytest.mark.parametrize("missing_field", ["job_id", "upload_ref"])
def test_missing_required_identifier_is_rejected(missing_field: str) -> None:
    kwargs = {
        "job_id": "job-1",
        "upload_ref": "uploads/brochure.pdf",
        "phase": JobPhase.UPLOAD.value,
        "status": JobStatus.PENDING.value,
    }
    kwargs[missing_field] = ""
    with pytest.raises(JobContractError):
        UploadStatusResultJob(**kwargs)


def test_ambiguous_phase_is_rejected() -> None:
    with pytest.raises(JobContractError):
        UploadStatusResultJob(
            job_id="job-1",
            upload_ref="uploads/brochure.pdf",
            phase="upload-and-status",
            status=JobStatus.PENDING.value,
        )


def test_unknown_status_is_rejected() -> None:
    with pytest.raises(JobContractError):
        UploadStatusResultJob(
            job_id="job-1",
            upload_ref="uploads/brochure.pdf",
            phase=JobPhase.STATUS.value,
            status="unknown",
        )


def test_result_and_error_are_mutually_exclusive() -> None:
    with pytest.raises(JobContractError):
        UploadStatusResultJob(
            job_id="job-1",
            upload_ref="uploads/brochure.pdf",
            phase=JobPhase.RESULT.value,
            status=JobStatus.DONE.value,
            result={"video_url": "https://example.test/out.mp4"},
            error=JobError(code="x", message="y"),
        )


def test_error_status_without_error_data_is_rejected() -> None:
    with pytest.raises(JobContractError):
        UploadStatusResultJob(
            job_id="job-1",
            upload_ref="uploads/brochure.pdf",
            phase=JobPhase.RESULT.value,
            status=JobStatus.ERROR.value,
        )


def test_non_error_status_with_error_data_is_rejected() -> None:
    with pytest.raises(JobContractError):
        UploadStatusResultJob(
            job_id="job-1",
            upload_ref="uploads/brochure.pdf",
            phase=JobPhase.RESULT.value,
            status=JobStatus.DONE.value,
            error=JobError(code="x", message="y"),
        )


def test_result_must_be_a_dict_not_just_annotated_as_one() -> None:
    with pytest.raises(JobContractError):
        UploadStatusResultJob(
            job_id="job-1",
            upload_ref="uploads/brochure.pdf",
            phase=JobPhase.RESULT.value,
            status=JobStatus.DONE.value,
            result="not-a-dict",  # type: ignore[arg-type]
        )


def test_error_must_be_a_job_error_instance_not_just_annotated_as_one() -> None:
    with pytest.raises(JobContractError):
        UploadStatusResultJob(
            job_id="job-1",
            upload_ref="uploads/brochure.pdf",
            phase=JobPhase.RESULT.value,
            status=JobStatus.ERROR.value,
            error={"code": "x", "message": "y"},  # type: ignore[arg-type]
        )


def test_job_error_requires_non_empty_code_and_message() -> None:
    with pytest.raises(JobContractError):
        JobError(code="", message="something failed")
    with pytest.raises(JobContractError):
        JobError(code="x", message="")


# ---------------------------------------------------------------------------
# validate_worker_startup (S2) — GEMINI_API_KEY
# ---------------------------------------------------------------------------


def test_missing_gemini_api_key_raises_explicit_error_naming_variable() -> None:
    with pytest.raises(WorkerConfigurationError) as excinfo:
        validate_worker_startup(env={}, run=_unexpected_run)
    assert GEMINI_API_KEY_VAR in str(excinfo.value)


def test_blank_gemini_api_key_raises_explicit_error() -> None:
    with pytest.raises(WorkerConfigurationError) as excinfo:
        validate_worker_startup(env={GEMINI_API_KEY_VAR: "   "}, run=_unexpected_run)
    assert GEMINI_API_KEY_VAR in str(excinfo.value)


def test_valid_startup_passes_with_key_present_and_ffmpeg_ok() -> None:
    validate_worker_startup(
        env={GEMINI_API_KEY_VAR: FAKE_GEMINI_KEY},
        run=_ok_run,
        target_secret_resolver=_valid_target_secret_resolver,
    )


def test_validate_worker_startup_loads_environment_when_env_is_none(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv(GEMINI_API_KEY_VAR, raising=False)
    load_calls: list[bool] = []

    def fake_load_worker_environment() -> None:
        load_calls.append(True)
        monkeypatch.setenv(GEMINI_API_KEY_VAR, FAKE_GEMINI_KEY)

    monkeypatch.setattr(startup_checks, "load_worker_environment", fake_load_worker_environment)

    validate_worker_startup(run=_ok_run, target_secret_resolver=_valid_target_secret_resolver)

    assert load_calls == [True]


def test_validate_worker_startup_does_not_load_environment_when_env_provided(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def unexpected_load() -> None:  # pragma: no cover - ne doit jamais être appelé
        raise AssertionError("load_worker_environment ne doit pas être appelé quand env est fourni")

    monkeypatch.setattr(startup_checks, "load_worker_environment", unexpected_load)

    with pytest.raises(WorkerConfigurationError):
        validate_worker_startup(env={}, run=_unexpected_run)


# ---------------------------------------------------------------------------
# validate_worker_startup (S2) — ffmpeg
# ---------------------------------------------------------------------------


def test_ffmpeg_command_is_invoked_with_version_flag() -> None:
    calls: list[list[str]] = []

    def recording_run(command, **kwargs):
        calls.append(command)
        return subprocess.CompletedProcess(command, 0, stdout="", stderr="")

    validate_worker_startup(
        env={GEMINI_API_KEY_VAR: FAKE_GEMINI_KEY},
        run=recording_run,
        target_secret_resolver=_valid_target_secret_resolver,
    )
    assert calls == [["ffmpeg", "-version"]]


def test_ffmpeg_non_zero_exit_raises_explicit_error() -> None:
    with pytest.raises(WorkerConfigurationError) as excinfo:
        validate_worker_startup(
            env={GEMINI_API_KEY_VAR: FAKE_GEMINI_KEY},
            run=_failing_run,
            target_secret_resolver=_valid_target_secret_resolver,
        )
    assert "ffmpeg" in str(excinfo.value)


def test_ffmpeg_not_installed_raises_explicit_error() -> None:
    def missing_binary_run(command, **kwargs):
        raise FileNotFoundError("ffmpeg")

    with pytest.raises(WorkerConfigurationError) as excinfo:
        validate_worker_startup(
            env={GEMINI_API_KEY_VAR: FAKE_GEMINI_KEY},
            run=missing_binary_run,
            target_secret_resolver=_valid_target_secret_resolver,
        )
    assert "ffmpeg" in str(excinfo.value)


# ---------------------------------------------------------------------------
# validate_worker_startup (S1/S2) — target secrets: presence, provenance, format
# ---------------------------------------------------------------------------

_INVALID_FORMAT_TARGET_SECRETS: dict[str, str] = {
    GEMINI_FREE_TIER_API_KEY_VAR: "short",
    GEMINI_API_KEY_PAYFUL_VAR: "has a space in it and is long enough",
    SUPABASE_URL_VAR: "http://not-supabase.example.test",
    SUPABASE_KEY_VAR: "not-a-jwt-shaped-value",
}


@pytest.mark.parametrize("var", _TARGET_SECRET_VARS)
def test_target_secret_missing_raises_explicit_error_naming_variable(var: str) -> None:
    resolver = _make_resolver({var: (None, "absent")})
    with pytest.raises(WorkerConfigurationError) as excinfo:
        validate_worker_startup(
            env={GEMINI_API_KEY_VAR: FAKE_GEMINI_KEY}, run=_unexpected_run, target_secret_resolver=resolver
        )
    assert var in str(excinfo.value)


@pytest.mark.parametrize("var", _TARGET_SECRET_VARS)
def test_target_secret_invalid_format_raises_explicit_error(var: str) -> None:
    invalid_value = _INVALID_FORMAT_TARGET_SECRETS[var]
    resolver = _make_resolver({var: (invalid_value, "moana/.env.local")})
    with pytest.raises(WorkerConfigurationError) as excinfo:
        validate_worker_startup(
            env={GEMINI_API_KEY_VAR: FAKE_GEMINI_KEY}, run=_unexpected_run, target_secret_resolver=resolver
        )
    assert var in str(excinfo.value)
    assert invalid_value not in str(excinfo.value)


@pytest.mark.parametrize("var", _TARGET_SECRET_VARS)
def test_target_secret_valid_format_from_expected_moana_source_passes(var: str) -> None:
    valid_value, source = _VALID_TARGET_SECRETS[var]
    assert source.startswith("moana/")
    resolver = _make_resolver({var: (valid_value, source)})
    validate_worker_startup(
        env={GEMINI_API_KEY_VAR: FAKE_GEMINI_KEY}, run=_ok_run, target_secret_resolver=resolver
    )


def test_target_secrets_are_checked_before_ffmpeg_probe() -> None:
    resolver = _make_resolver({SUPABASE_URL_VAR: (None, "absent")})
    with pytest.raises(WorkerConfigurationError):
        validate_worker_startup(
            env={GEMINI_API_KEY_VAR: FAKE_GEMINI_KEY}, run=_unexpected_run, target_secret_resolver=resolver
        )


def test_target_secret_resolution_never_reads_software_factory_env(
    monkeypatch: pytest.MonkeyPatch, tmp_path
) -> None:
    """The production resolver only ever parses ROOT/.env.local and ROOT/.env."""
    monkeypatch.setattr(startup_checks, "ROOT", tmp_path)
    (tmp_path / ".env.local").write_text("", encoding="utf-8")
    (tmp_path / ".env").write_text("", encoding="utf-8")

    queried_paths: list = []
    original_dotenv_values = startup_checks.dotenv_values

    def recording_dotenv_values(path, *args, **kwargs):
        queried_paths.append(path)
        return original_dotenv_values(path, *args, **kwargs)

    monkeypatch.setattr(startup_checks, "dotenv_values", recording_dotenv_values)

    with pytest.raises(WorkerConfigurationError):
        startup_checks._check_target_secrets(startup_checks._load_target_secret)

    # Fails fast on the first (absent) target secret: only that var's two
    # files are queried, and both are anchored under the patched ROOT.
    assert queried_paths == [tmp_path / ".env.local", tmp_path / ".env"]
    assert all("software_factory" not in str(path) for path in queried_paths)


def test_target_secret_ignores_process_environment_stray_value(
    monkeypatch: pytest.MonkeyPatch, tmp_path
) -> None:
    """A value only present in os.environ (e.g. inherited from the Factory's own
    shell) must never satisfy provenance — only the two moana files count."""
    monkeypatch.setattr(startup_checks, "ROOT", tmp_path)
    monkeypatch.setenv(SUPABASE_URL_VAR, FAKE_SUPABASE_URL)

    value, source = startup_checks._load_target_secret(SUPABASE_URL_VAR)

    assert source == "absent"
    assert value is None


def test_target_secret_probe_never_leaks_value() -> None:
    resolver = _make_resolver({})
    report = target_secret_probe_report(SUPABASE_KEY_VAR, resolver=resolver)
    serialized = repr(report)
    assert FAKE_SUPABASE_KEY not in serialized
    assert report.state == "present"


def test_target_secret_probe_reports_moana_provenance() -> None:
    resolver = _make_resolver({})
    report = target_secret_probe_report(GEMINI_FREE_TIER_API_KEY_VAR, resolver=resolver)
    assert report.resolved_source == "moana/.env.local"
    assert "software_factory" not in (report.resolved_source or "")


def test_target_secret_probe_reports_absent() -> None:
    resolver = _make_resolver({SUPABASE_URL_VAR: (None, "absent")})
    report = target_secret_probe_report(SUPABASE_URL_VAR, resolver=resolver)
    assert report.state == "absent"
    assert report.length is None


# ---------------------------------------------------------------------------
# secret_probe_report (S3)
# ---------------------------------------------------------------------------


def test_probe_reports_absent_when_key_unset() -> None:
    report = secret_probe_report(env={})
    assert report.state == "absent"
    assert report.length is None


def test_probe_reports_malformed_for_short_or_whitespace_value() -> None:
    report = secret_probe_report(env={GEMINI_API_KEY_VAR: "short"})
    assert report.state == "malformed"


def test_probe_reports_present_for_well_formed_value() -> None:
    report = secret_probe_report(env={GEMINI_API_KEY_VAR: FAKE_GEMINI_KEY})
    assert report.state == "present"
    assert report.length == len(FAKE_GEMINI_KEY)


def test_probe_documents_expected_provenance_as_moana_env_not_factory_env() -> None:
    report = secret_probe_report(env={})
    assert "moana/.env" in report.expected_source
    assert "software_factory/.env" not in report.expected_source or "not software_factory/.env" in report.expected_source


def test_probe_never_leaks_key_value() -> None:
    report = secret_probe_report(env={GEMINI_API_KEY_VAR: FAKE_GEMINI_KEY})
    serialized = repr(report)
    assert FAKE_GEMINI_KEY not in serialized
    assert FAKE_GEMINI_KEY_SENTINEL not in serialized
