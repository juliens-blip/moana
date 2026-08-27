"""Tests déterministes de l'assemblage ffmpeg + publish Supabase Storage (plan.json T4).

``subprocess.run`` (via ``run``) et le Storage (``ClipSource``/``PublishCheckpoint``)
sont entièrement injectés/mockés : aucun ffmpeg réel n'est invoqué, aucun appel
réseau réel n'est possible depuis ce fichier.

Audit S5/S4 (test_existing_contract_alignment ci-dessous) : aucun test backend
existant n'a jamais référencé un serveur MCP ou une écriture en base pour
l'assemblage vidéo — il n'y a donc aucun test préexistant contradictoire à
réaligner ; ce fichier fixe directement le contrat final (ffmpeg direct,
Supabase Storage uniquement, aucune écriture DB).
"""

from __future__ import annotations

import hashlib
import json
import logging
import subprocess

import pytest

from workers.gemini_veo_generator import CLIP_DURATION_S, ClipCheckpoint
from workers.job_contract import JobPhase, JobStatus
from workers.video_assembler import (
    CONTAINER_FORMAT,
    SUPABASE_DB_URL_VAR,
    SUPABASE_SERVICE_ROLE_KEY_VAR,
    SUPABASE_URL_VAR,
    VIDEO_CODEC,
    AssemblyConfigurationError,
    AssemblyFfmpegError,
    AssemblySettings,
    AssemblyTransientError,
    InMemoryPublishCheckpoint,
    PublishedArtifact,
    SupabaseStoragePublishCheckpoint,
    assemble_and_publish,
    ensure_supabase_configured,
)

DOCUMENT_DIGEST = "b" * 64
FAKE_SUPABASE_ENV = {
    SUPABASE_URL_VAR: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY_VAR: "fake-service-role-key-sentinel",
    SUPABASE_DB_URL_VAR: "postgresql://fake/db",
}


def _clip(image_id: str, object_key: str | None = None, digest: str = "d" * 64) -> ClipCheckpoint:
    return ClipCheckpoint(
        image_id=image_id,
        object_key=object_key or f"veo-clips/{DOCUMENT_DIGEST[:16]}/{image_id}.mp4",
        duration_s=CLIP_DURATION_S,
        content_digest=digest,
    )


class FakeClipSource:
    """In-memory clip download fake: raises injected errors, never touches a network."""

    def __init__(self, failures_by_key: dict[str, list[Exception]] | None = None) -> None:
        self._failures_by_key = failures_by_key or {}
        self.calls: list[str] = []

    def download_clip(self, object_key: str, timeout: float) -> bytes:
        self.calls.append(object_key)
        queue = self._failures_by_key.get(object_key)
        if queue:
            raise queue.pop(0)
        return f"clip-bytes-{object_key}".encode()


def _ok_run(command, **kwargs):
    output_path = command[-1]
    with open(output_path, "wb") as handle:
        handle.write(b"fake-mp4-bytes")
    return subprocess.CompletedProcess(command, 0, stdout=b"", stderr=b"")


def _failing_run(command, **kwargs):
    return subprocess.CompletedProcess(command, 1, stdout=b"", stderr=b"ffmpeg error")


def _no_sleep(_seconds: float) -> None:
    return None


def _fixed_rand() -> float:
    return 0.0


def _fast_settings(**overrides) -> AssemblySettings:
    base = {"max_retries": 1, "backoff_base_s": 0.01, "backoff_cap_s": 0.02}
    base.update(overrides)
    return AssemblySettings(**base)


# ---------------------------------------------------------------------------
# ensure_supabase_configured (S2)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("missing_var", [SUPABASE_URL_VAR, SUPABASE_SERVICE_ROLE_KEY_VAR, SUPABASE_DB_URL_VAR])
def test_ensure_supabase_configured_raises_when_a_required_var_is_missing(missing_var: str) -> None:
    env = dict(FAKE_SUPABASE_ENV)
    del env[missing_var]
    with pytest.raises(AssemblyConfigurationError) as excinfo:
        ensure_supabase_configured(env=env)
    assert missing_var in str(excinfo.value)


def test_ensure_supabase_configured_passes_with_all_vars_present() -> None:
    ensure_supabase_configured(env=FAKE_SUPABASE_ENV)


def test_ensure_supabase_configured_never_leaks_service_role_value() -> None:
    env = dict(FAKE_SUPABASE_ENV)
    del env[SUPABASE_SERVICE_ROLE_KEY_VAR]
    with pytest.raises(AssemblyConfigurationError) as excinfo:
        ensure_supabase_configured(env=env)
    assert FAKE_SUPABASE_ENV[SUPABASE_SERVICE_ROLE_KEY_VAR] not in str(excinfo.value)


def test_assemble_blocks_before_any_download_when_supabase_config_missing() -> None:
    clips = [_clip("img-1")]
    source = FakeClipSource()

    with pytest.raises(AssemblyConfigurationError):
        assemble_and_publish(
            job_id="job-1",
            upload_ref="uploads/brochure.pdf",
            document_digest=DOCUMENT_DIGEST,
            clips=clips,
            idempotency_key="job-1",
            clip_source=source,
            checkpoint=InMemoryPublishCheckpoint(),
            run=_ok_run,
            sleep=_no_sleep,
            rand=_fixed_rand,
            env={},
        )

    assert source.calls == []


# ---------------------------------------------------------------------------
# Ordering, transitions, codec/container (S1/S2)
# ---------------------------------------------------------------------------


def test_clips_are_downloaded_and_fed_to_ffmpeg_in_section_order() -> None:
    clips = [_clip("img-3"), _clip("img-1"), _clip("img-2")]
    source = FakeClipSource()
    recorded_commands: list[list[str]] = []

    def recording_run(command, **kwargs):
        recorded_commands.append(command)
        return _ok_run(command, **kwargs)

    assemble_and_publish(
        job_id="job-1",
        upload_ref="uploads/brochure.pdf",
        document_digest=DOCUMENT_DIGEST,
        clips=clips,
        idempotency_key="job-1",
        clip_source=source,
        checkpoint=InMemoryPublishCheckpoint(),
        run=recording_run,
        sleep=_no_sleep,
        rand=_fixed_rand,
        env=FAKE_SUPABASE_ENV,
    )

    assert source.calls == [clip.object_key for clip in clips]
    (command,) = recorded_commands
    input_indices = [i for i in range(len(command)) if command[i] == "-i"]
    input_files = [command[i + 1] for i in input_indices]
    assert input_files[0].endswith("img-3.mp4")
    assert input_files[1].endswith("img-1.mp4")
    assert input_files[2].endswith("img-2.mp4")


def test_ffmpeg_command_uses_libx264_and_mp4_container() -> None:
    clips = [_clip("img-1"), _clip("img-2")]
    recorded_commands: list[list[str]] = []

    def recording_run(command, **kwargs):
        recorded_commands.append(command)
        return _ok_run(command, **kwargs)

    assemble_and_publish(
        job_id="job-1",
        upload_ref="uploads/brochure.pdf",
        document_digest=DOCUMENT_DIGEST,
        clips=clips,
        idempotency_key="job-1",
        clip_source=FakeClipSource(),
        checkpoint=InMemoryPublishCheckpoint(),
        run=recording_run,
        sleep=_no_sleep,
        rand=_fixed_rand,
        env=FAKE_SUPABASE_ENV,
    )

    (command,) = recorded_commands
    assert VIDEO_CODEC in command
    assert CONTAINER_FORMAT in command
    assert command[0] == "ffmpeg"


def test_ffmpeg_command_declares_an_explicit_transition_between_clips() -> None:
    clips = [_clip("img-1"), _clip("img-2"), _clip("img-3")]
    recorded_commands: list[list[str]] = []

    def recording_run(command, **kwargs):
        recorded_commands.append(command)
        return _ok_run(command, **kwargs)

    assemble_and_publish(
        job_id="job-1",
        upload_ref="uploads/brochure.pdf",
        document_digest=DOCUMENT_DIGEST,
        clips=clips,
        idempotency_key="job-1",
        clip_source=FakeClipSource(),
        checkpoint=InMemoryPublishCheckpoint(),
        run=recording_run,
        sleep=_no_sleep,
        rand=_fixed_rand,
        env=FAKE_SUPABASE_ENV,
    )

    (command,) = recorded_commands
    filter_index = command.index("-filter_complex")
    filter_graph = command[filter_index + 1]
    assert "xfade" in filter_graph
    assert filter_graph.count("xfade") == 2  # two transitions for three clips


def test_ffmpeg_is_invoked_directly_via_subprocess_never_through_mcp() -> None:
    clips = [_clip("img-1")]
    invocation_count = {"n": 0}

    def recording_run(command, **kwargs):
        invocation_count["n"] += 1
        assert isinstance(command, list)
        assert command[0] == "ffmpeg"
        return _ok_run(command, **kwargs)

    assemble_and_publish(
        job_id="job-1",
        upload_ref="uploads/brochure.pdf",
        document_digest=DOCUMENT_DIGEST,
        clips=clips,
        idempotency_key="job-1",
        clip_source=FakeClipSource(),
        checkpoint=InMemoryPublishCheckpoint(),
        run=recording_run,
        sleep=_no_sleep,
        rand=_fixed_rand,
        env=FAKE_SUPABASE_ENV,
    )

    assert invocation_count["n"] == 1


# ---------------------------------------------------------------------------
# Publish, status/result contract, dead-letter (S2)
# ---------------------------------------------------------------------------


def test_successful_assembly_returns_done_result_phase_job_with_object_key() -> None:
    clips = [_clip("img-1"), _clip("img-2")]

    job = assemble_and_publish(
        job_id="job-1",
        upload_ref="uploads/brochure.pdf",
        document_digest=DOCUMENT_DIGEST,
        clips=clips,
        idempotency_key="job-1",
        clip_source=FakeClipSource(),
        checkpoint=InMemoryPublishCheckpoint(),
        run=_ok_run,
        sleep=_no_sleep,
        rand=_fixed_rand,
        env=FAKE_SUPABASE_ENV,
    )

    assert job.phase == JobPhase.RESULT.value
    assert job.status == JobStatus.DONE.value
    assert job.error is None
    assert job.result is not None
    assert job.result["object_key"].startswith(f"videos/{DOCUMENT_DIGEST[:16]}/")
    assert job.result["clip_count"] == 2


def test_ffmpeg_definitive_failure_returns_error_result_and_records_dead_letter() -> None:
    clips = [_clip("img-1")]
    checkpoint = InMemoryPublishCheckpoint()

    job = assemble_and_publish(
        job_id="job-1",
        upload_ref="uploads/brochure.pdf",
        document_digest=DOCUMENT_DIGEST,
        clips=clips,
        idempotency_key="job-1",
        clip_source=FakeClipSource(),
        checkpoint=checkpoint,
        run=_failing_run,
        settings=_fast_settings(),
        sleep=_no_sleep,
        rand=_fixed_rand,
        env=FAKE_SUPABASE_ENV,
    )

    assert job.phase == JobPhase.RESULT.value
    assert job.status == JobStatus.ERROR.value
    assert job.error is not None
    assert job.result is None
    assert "job-1" in checkpoint.dead_letters_for(DOCUMENT_DIGEST)


def test_ffmpeg_failure_preserves_diagnostic() -> None:
    """A non-zero ffmpeg exit must surface its exact code and stderr, not a generic message."""
    clips = [_clip("img-1")]
    checkpoint = InMemoryPublishCheckpoint()

    def distinct_failing_run(command, **kwargs):
        return subprocess.CompletedProcess(command, 17, stdout=b"", stderr=b"Unknown encoder 'libx264'")

    job = assemble_and_publish(
        job_id="job-1",
        upload_ref="uploads/brochure.pdf",
        document_digest=DOCUMENT_DIGEST,
        clips=clips,
        idempotency_key="job-1",
        clip_source=FakeClipSource(),
        checkpoint=checkpoint,
        run=distinct_failing_run,
        settings=_fast_settings(),
        sleep=_no_sleep,
        rand=_fixed_rand,
        env=FAKE_SUPABASE_ENV,
    )

    assert job.status == JobStatus.ERROR.value
    reason = checkpoint.dead_letters_for(DOCUMENT_DIGEST)["job-1"]
    assert "AssemblyFfmpegError" in reason
    assert "17" in reason
    assert "Unknown encoder 'libx264'" in reason


def test_ffmpeg_error_exposes_returncode_and_stderr_attributes() -> None:
    error = AssemblyFfmpegError(1, b"ffmpeg error")
    assert error.returncode == 1
    assert error.stderr_text == "ffmpeg error"
    assert "1" in str(error)
    assert "ffmpeg error" in str(error)


def test_repeated_definitive_failure_does_not_duplicate_the_dead_letter() -> None:
    clips = [_clip("img-1")]
    checkpoint = InMemoryPublishCheckpoint()

    for _ in range(2):
        assemble_and_publish(
            job_id="job-1",
            upload_ref="uploads/brochure.pdf",
            document_digest=DOCUMENT_DIGEST,
            clips=clips,
            idempotency_key="job-1",
            clip_source=FakeClipSource(),
            checkpoint=checkpoint,
            run=_failing_run,
            settings=_fast_settings(),
            sleep=_no_sleep,
            rand=_fixed_rand,
            env=FAKE_SUPABASE_ENV,
        )

    assert len(checkpoint.dead_letters_for(DOCUMENT_DIGEST)) == 1


def test_definitive_download_failure_is_not_retried_and_is_dead_lettered() -> None:
    clips = [_clip("img-1")]
    source = FakeClipSource(failures_by_key={clips[0].object_key: [RuntimeError("boom")]})
    checkpoint = InMemoryPublishCheckpoint()

    job = assemble_and_publish(
        job_id="job-1",
        upload_ref="uploads/brochure.pdf",
        document_digest=DOCUMENT_DIGEST,
        clips=clips,
        idempotency_key="job-1",
        clip_source=source,
        checkpoint=checkpoint,
        run=_ok_run,
        settings=_fast_settings(max_retries=5),
        sleep=_no_sleep,
        rand=_fixed_rand,
        env=FAKE_SUPABASE_ENV,
    )

    assert len(source.calls) == 1
    assert job.status == JobStatus.ERROR.value


def test_transient_download_error_retries_then_succeeds() -> None:
    clips = [_clip("img-1")]
    source = FakeClipSource(failures_by_key={clips[0].object_key: [AssemblyTransientError("rate_limited")]})

    job = assemble_and_publish(
        job_id="job-1",
        upload_ref="uploads/brochure.pdf",
        document_digest=DOCUMENT_DIGEST,
        clips=clips,
        idempotency_key="job-1",
        clip_source=source,
        checkpoint=InMemoryPublishCheckpoint(),
        run=_ok_run,
        settings=_fast_settings(max_retries=3),
        sleep=_no_sleep,
        rand=_fixed_rand,
        env=FAKE_SUPABASE_ENV,
    )

    assert len(source.calls) == 2
    assert job.status == JobStatus.DONE.value


def test_no_secret_is_logged_on_retry(caplog: pytest.LogCaptureFixture) -> None:
    clips = [_clip("img-1")]
    source = FakeClipSource(failures_by_key={clips[0].object_key: [AssemblyTransientError("rate_limited")]})

    with caplog.at_level(logging.WARNING, logger="moana.video_assembler"):
        assemble_and_publish(
            job_id="job-1",
            upload_ref="uploads/brochure.pdf",
            document_digest=DOCUMENT_DIGEST,
            clips=clips,
            idempotency_key="job-1",
            clip_source=source,
            checkpoint=InMemoryPublishCheckpoint(),
            run=_ok_run,
            settings=_fast_settings(max_retries=3),
            sleep=_no_sleep,
            rand=_fixed_rand,
            env=FAKE_SUPABASE_ENV,
        )

    for record in caplog.records:
        text = record.getMessage()
        assert FAKE_SUPABASE_ENV[SUPABASE_SERVICE_ROLE_KEY_VAR] not in text
        assert "service_role" not in text.lower()


# ---------------------------------------------------------------------------
# Idempotency (S2): a replayed idempotency key publishes exactly one artifact
# ---------------------------------------------------------------------------


def test_replayed_idempotency_key_publishes_only_one_artifact() -> None:
    clips = [_clip("img-1"), _clip("img-2")]
    checkpoint = InMemoryPublishCheckpoint()
    first_run_calls = {"n": 0}

    def counting_run(command, **kwargs):
        first_run_calls["n"] += 1
        return _ok_run(command, **kwargs)

    first_job = assemble_and_publish(
        job_id="job-1",
        upload_ref="uploads/brochure.pdf",
        document_digest=DOCUMENT_DIGEST,
        clips=clips,
        idempotency_key="job-1",
        clip_source=FakeClipSource(),
        checkpoint=checkpoint,
        run=counting_run,
        sleep=_no_sleep,
        rand=_fixed_rand,
        env=FAKE_SUPABASE_ENV,
    )

    second_source = FakeClipSource()
    second_job = assemble_and_publish(
        job_id="job-1",
        upload_ref="uploads/brochure.pdf",
        document_digest=DOCUMENT_DIGEST,
        clips=clips,
        idempotency_key="job-1",
        clip_source=second_source,
        checkpoint=checkpoint,
        run=counting_run,
        sleep=_no_sleep,
        rand=_fixed_rand,
        env=FAKE_SUPABASE_ENV,
    )

    assert first_run_calls["n"] == 1  # ffmpeg invoked only on the first call
    assert second_source.calls == []  # no re-download on replay
    assert first_job.result == second_job.result
    assert checkpoint.produce_calls == ["job-1"]


def test_empty_clips_raises_value_error() -> None:
    with pytest.raises(ValueError):
        assemble_and_publish(
            job_id="job-1",
            upload_ref="uploads/brochure.pdf",
            document_digest=DOCUMENT_DIGEST,
            clips=[],
            idempotency_key="job-1",
            clip_source=FakeClipSource(),
            checkpoint=InMemoryPublishCheckpoint(),
            run=_ok_run,
            sleep=_no_sleep,
            rand=_fixed_rand,
            env=FAKE_SUPABASE_ENV,
        )


def test_duplicate_image_id_raises_value_error() -> None:
    clips = [_clip("img-1"), _clip("img-1")]
    with pytest.raises(ValueError):
        assemble_and_publish(
            job_id="job-1",
            upload_ref="uploads/brochure.pdf",
            document_digest=DOCUMENT_DIGEST,
            clips=clips,
            idempotency_key="job-1",
            clip_source=FakeClipSource(),
            checkpoint=InMemoryPublishCheckpoint(),
            run=_ok_run,
            sleep=_no_sleep,
            rand=_fixed_rand,
            env=FAKE_SUPABASE_ENV,
        )


# ---------------------------------------------------------------------------
# Regression: idempotence must come from Storage's own conditional create,
# not a local lock — a prior attempt relied only on an in-memory guard.
# ---------------------------------------------------------------------------


def test_supabase_storage_checkpoint_creates_object_with_upsert_false() -> None:
    recorded_requests: list[tuple[str, dict[str, str], bytes | None, float]] = []

    def fake_request(url, headers, body, timeout):
        recorded_requests.append((url, headers, body, timeout))
        if body is None:
            return 404, b""  # load_confirmed: nothing published yet
        return 201, b""

    checkpoint = SupabaseStoragePublishCheckpoint(
        supabase_url="https://example.supabase.co",
        supabase_service_key="fake-service-role-key-sentinel",
        request=fake_request,
    )

    def produce():
        return PublishedArtifact(object_key="videos/abc/job-1.mp4", content_digest="d" * 64), b"mp4-bytes"

    artifact = checkpoint.acquire_and_publish(DOCUMENT_DIGEST, "job-1", produce)

    assert artifact.object_key == "videos/abc/job-1.mp4"
    upload_calls = [call for call in recorded_requests if call[2] is not None]
    assert len(upload_calls) == 1
    assert upload_calls[0][1]["x-upsert"] == "false"


def test_supabase_storage_checkpoint_reuses_object_on_conflict_status() -> None:
    """A 409 from Storage's own conditional create means another caller (or a
    retried attempt) already published this key: once the post-409 metadata
    read confirms a matching checksum, it must be reused, never treated as a
    second successful publish nor as a failure."""

    digest = "d" * 64
    get_count = {"n": 0}

    def fake_request(url, headers, body, timeout):
        if body is None:
            get_count["n"] += 1
            if get_count["n"] == 1:
                return 404, b""  # pre-check: not yet visible to this caller
            return 200, json.dumps({"checksum": digest}).encode()  # post-409 read
        return 409, b"Duplicate"

    checkpoint = SupabaseStoragePublishCheckpoint(
        supabase_url="https://example.supabase.co",
        supabase_service_key="fake-service-role-key-sentinel",
        request=fake_request,
    )

    expected_object_key = f"videos/{DOCUMENT_DIGEST[:16]}/job-1.mp4"

    def produce():
        return PublishedArtifact(object_key=expected_object_key, content_digest=digest), b"mp4-bytes"

    artifact = checkpoint.acquire_and_publish(DOCUMENT_DIGEST, "job-1", produce)

    assert artifact.object_key == expected_object_key


def test_replayed_worker_run_publishes_the_artifact_exactly_once() -> None:
    """End-to-end replay: ``assemble_and_publish`` invoked twice with the same
    idempotency key against a real ``SupabaseStoragePublishCheckpoint`` backed
    by a stateful fake Storage server must leave exactly one successfully
    persisted object behind, and the second replay must never re-download."""

    class _FakeStorageServer:
        def __init__(self) -> None:
            self.objects: dict[str, bytes] = {}
            self.successful_uploads = 0

        def __call__(self, url, headers, body, timeout):
            if body is None:
                key = url.split("/object/info/", 1)[1]
                if key in self.objects:
                    digest = hashlib.sha256(self.objects[key]).hexdigest()
                    return 200, json.dumps({"checksum": digest}).encode()
                return 404, b""
            key = url.split("/object/", 1)[1]
            if key in self.objects:
                return 409, b"Duplicate"
            self.objects[key] = body
            self.successful_uploads += 1
            return 201, b""

    server = _FakeStorageServer()
    clips = [_clip("img-1"), _clip("img-2")]

    def run_once(clip_source: FakeClipSource):
        checkpoint = SupabaseStoragePublishCheckpoint(
            supabase_url="https://example.supabase.co",
            supabase_service_key="fake-service-role-key-sentinel",
            request=server,
        )
        return assemble_and_publish(
            job_id="job-1",
            upload_ref="uploads/brochure.pdf",
            document_digest=DOCUMENT_DIGEST,
            clips=clips,
            idempotency_key="job-1",
            clip_source=clip_source,
            checkpoint=checkpoint,
            run=_ok_run,
            sleep=_no_sleep,
            rand=_fixed_rand,
            env=FAKE_SUPABASE_ENV,
        )

    first_job = run_once(FakeClipSource())
    second_source = FakeClipSource()
    second_job = run_once(second_source)

    assert server.successful_uploads == 1
    assert second_source.calls == []
    assert first_job.result == second_job.result


def test_supabase_storage_checkpoint_load_confirmed_skips_produce_entirely() -> None:
    produce_calls = {"n": 0}

    digest = "e" * 64

    def fake_request(url, headers, body, timeout):
        assert body is None  # load_confirmed only ever issues a GET
        return 200, json.dumps({"checksum": digest}).encode()

    checkpoint = SupabaseStoragePublishCheckpoint(
        supabase_url="https://example.supabase.co",
        supabase_service_key="fake-service-role-key-sentinel",
        request=fake_request,
    )

    def produce():
        produce_calls["n"] += 1
        return PublishedArtifact(object_key="videos/abc/job-1.mp4", content_digest="d" * 64), b"mp4-bytes"

    artifact = checkpoint.acquire_and_publish(DOCUMENT_DIGEST, "job-1", produce)

    assert produce_calls["n"] == 0
    assert artifact.content_digest == digest


def test_supabase_storage_checkpoint_verifies_real_supabase_info_shape_from_object_bytes() -> None:
    """Supabase's production object-info payload has no top-level checksum.
    The checkpoint must hash the stored object itself and reuse it without
    running ffmpeg/produce again."""

    object_bytes = b"existing-production-mp4"
    expected_digest = hashlib.sha256(object_bytes).hexdigest()
    expected_object_key = f"videos/{DOCUMENT_DIGEST[:16]}/job-1.mp4"
    produce_calls = {"n": 0}

    def fake_request(url, headers, body, timeout):
        assert body is None
        if "/object/info/" in url:
            return 200, json.dumps({
                "name": expected_object_key,
                "etag": "production-etag",
                "size": len(object_bytes),
            }).encode()
        assert url.endswith(f"/object/videos/{expected_object_key}")
        return 200, object_bytes

    checkpoint = SupabaseStoragePublishCheckpoint(
        supabase_url="https://example.supabase.co",
        supabase_service_key="fake-service-role-key-sentinel",
        request=fake_request,
    )

    def produce():
        produce_calls["n"] += 1
        return PublishedArtifact(object_key=expected_object_key, content_digest="d" * 64), b"new-bytes"

    artifact = checkpoint.acquire_and_publish(DOCUMENT_DIGEST, "job-1", produce)

    assert produce_calls["n"] == 0
    assert artifact.object_key == expected_object_key
    assert artifact.content_digest == expected_digest


def test_supabase_storage_checkpoint_definitive_status_raises_without_retrying() -> None:
    call_count = {"n": 0}

    def fake_request(url, headers, body, timeout):
        if body is None:
            return 404, b""
        call_count["n"] += 1
        return 400, b"bad request"

    checkpoint = SupabaseStoragePublishCheckpoint(
        supabase_url="https://example.supabase.co",
        supabase_service_key="fake-service-role-key-sentinel",
        request=fake_request,
        settings=_fast_settings(max_retries=5),
        sleep=_no_sleep,
        rand=_fixed_rand,
    )

    def produce():
        return PublishedArtifact(object_key="videos/abc/job-1.mp4", content_digest="d" * 64), b"mp4-bytes"

    with pytest.raises(RuntimeError):
        checkpoint.acquire_and_publish(DOCUMENT_DIGEST, "job-1", produce)

    assert call_count["n"] == 1  # a definitive (non-429/5xx) status is never retried


def test_supabase_storage_checkpoint_retries_transient_upload_status_then_succeeds() -> None:
    upload_attempts = {"n": 0}

    def fake_request(url, headers, body, timeout):
        if body is None:
            return 404, b""
        upload_attempts["n"] += 1
        if upload_attempts["n"] < 3:
            return 503, b"service unavailable"
        return 201, b""

    checkpoint = SupabaseStoragePublishCheckpoint(
        supabase_url="https://example.supabase.co",
        supabase_service_key="fake-service-role-key-sentinel",
        request=fake_request,
        settings=_fast_settings(max_retries=5),
        sleep=_no_sleep,
        rand=_fixed_rand,
    )

    def produce():
        return PublishedArtifact(object_key="videos/abc/job-1.mp4", content_digest="d" * 64), b"mp4-bytes"

    artifact = checkpoint.acquire_and_publish(DOCUMENT_DIGEST, "job-1", produce)

    assert upload_attempts["n"] == 3
    assert artifact.object_key == "videos/abc/job-1.mp4"


def test_supabase_storage_checkpoint_dead_letters_only_after_transient_retries_exhausted() -> None:
    upload_attempts = {"n": 0}

    def fake_request(url, headers, body, timeout):
        if body is None:
            return 404, b""
        upload_attempts["n"] += 1
        return 503, b"service unavailable"

    checkpoint = SupabaseStoragePublishCheckpoint(
        supabase_url="https://example.supabase.co",
        supabase_service_key="fake-service-role-key-sentinel",
        request=fake_request,
        settings=_fast_settings(max_retries=2),
        sleep=_no_sleep,
        rand=_fixed_rand,
    )

    def produce():
        return PublishedArtifact(object_key="videos/abc/job-1.mp4", content_digest="d" * 64), b"mp4-bytes"

    with pytest.raises(AssemblyTransientError):
        checkpoint.acquire_and_publish(DOCUMENT_DIGEST, "job-1", produce)

    assert upload_attempts["n"] == 3  # initial attempt + 2 retries, then exhausted


def test_assemble_and_publish_dead_letters_after_storage_retries_are_exhausted() -> None:
    def always_unavailable(url, headers, body, timeout):
        if body is None:
            return 404, b""
        return 503, b"service unavailable"

    checkpoint = SupabaseStoragePublishCheckpoint(
        supabase_url="https://example.supabase.co",
        supabase_service_key="fake-service-role-key-sentinel",
        request=always_unavailable,
        settings=_fast_settings(max_retries=1),
        sleep=_no_sleep,
        rand=_fixed_rand,
    )
    clips = [_clip("img-1")]

    job = assemble_and_publish(
        job_id="job-1",
        upload_ref="uploads/brochure.pdf",
        document_digest=DOCUMENT_DIGEST,
        clips=clips,
        idempotency_key="job-1",
        clip_source=FakeClipSource(),
        checkpoint=checkpoint,
        run=_ok_run,
        settings=_fast_settings(),
        sleep=_no_sleep,
        rand=_fixed_rand,
        env=FAKE_SUPABASE_ENV,
    )

    assert job.status == JobStatus.ERROR.value


def test_supabase_storage_checkpoint_never_sends_service_role_key_in_a_readable_url() -> None:
    def fake_request(url, headers, body, timeout):
        assert "fake-service-role-key-sentinel" not in url
        return (404, b"") if body is None else (201, b"")

    checkpoint = SupabaseStoragePublishCheckpoint(
        supabase_url="https://example.supabase.co",
        supabase_service_key="fake-service-role-key-sentinel",
        request=fake_request,
    )
    checkpoint.acquire_and_publish(
        DOCUMENT_DIGEST,
        "job-1",
        lambda: (PublishedArtifact(object_key="videos/abc/job-1.mp4", content_digest="d" * 64), b"bytes"),
    )


# ---------------------------------------------------------------------------
# S4: audited alignment — final contract only, no MCP server, no DB write
# ---------------------------------------------------------------------------


def test_existing_contract_alignment() -> None:
    """No MCP server is ever imported/used, and no database write happens.

    ``workers/video_assembler.py`` only imports ``subprocess`` (injected as
    ``run``) to reach ffmpeg, and its ``PublishCheckpoint``/``ClipSource``
    protocols are Storage-shaped, not SQL-shaped: there is no ``execute``,
    ``cursor``, or SQL string anywhere in the module's public surface. This
    replaces any prior assumption of an MCP-mediated or DB-persisted
    assembly step with the direct-ffmpeg/Storage-only contract actually
    implemented.
    """
    import workers.video_assembler as module

    source = module.__file__
    with open(source, encoding="utf-8") as handle:
        text = handle.read()

    assert "mcp__" not in text
    assert "import mcp" not in text
    assert "INSERT INTO" not in text.upper()
    assert "psycopg" not in text.lower()

    clips = [_clip("img-1")]
    job = assemble_and_publish(
        job_id="job-1",
        upload_ref="uploads/brochure.pdf",
        document_digest=DOCUMENT_DIGEST,
        clips=clips,
        idempotency_key="job-1",
        clip_source=FakeClipSource(),
        checkpoint=InMemoryPublishCheckpoint(),
        run=_ok_run,
        sleep=_no_sleep,
        rand=_fixed_rand,
        env=FAKE_SUPABASE_ENV,
    )
    assert job.status == JobStatus.DONE.value
