"""Deterministic ffmpeg clip assembly with an idempotent Supabase Storage publish.

Consumes the ordered ``ClipCheckpoint``s produced by
``workers/gemini_veo_generator.py`` (same ``document_digest``, same stable
per-section order) and assembles them into a single MP4 via a direct
``ffmpeg`` subprocess invocation — never an MCP server, never a bundled
ffmpeg binding. Consecutive clips are joined with an explicit ``xfade``
crossfade transition and encoded with ``libx264`` into an MP4 container.

Both the ffmpeg invocation (injected as ``run``, mirroring
``workers/startup_checks.py``'s ``RunFn``) and the Storage publish
(``PublishCheckpoint``) are injection points: this module never imports a
concrete Supabase client and never shells out except through ``run``.

``PublishCheckpoint.acquire_and_publish`` is a single conditional
acquire/write keyed by ``(document_digest, idempotency_key)`` — the same
check-then-write-atomically shape as
``gemini_veo_generator.StorageCheckpoint.acquire_and_confirm`` — so a
replayed job with the same idempotency key reuses the previously published
artifact without re-invoking ffmpeg or Storage a second time.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import random
import subprocess
import tempfile
import time
import urllib.error
import urllib.request
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path
from threading import Lock
from typing import Protocol

from workers.gemini_veo_generator import CLIP_DURATION_S, ClipCheckpoint, run_with_retry
from workers.job_contract import JobError, JobPhase, JobStatus, UploadStatusResultJob

LOGGER = logging.getLogger("moana.video_assembler")

VIDEO_CODEC = "libx264"
CONTAINER_FORMAT = "mp4"
TRANSITION_TYPE = "fade"
TRANSITION_DURATION_S = 1.0

SUPABASE_URL_VAR = "SUPABASE_URL"
SUPABASE_SERVICE_ROLE_KEY_VAR = "SUPABASE_SERVICE_ROLE_KEY"
SUPABASE_DB_URL_VAR = "SUPABASE_DB_URL"

RunFn = Callable[..., subprocess.CompletedProcess]


class AssemblyConfigurationError(RuntimeError):
    """Raised when a required Supabase environment variable is missing."""


class AssemblyTransientError(RuntimeError):
    """Raised by a ``ClipSource``/``run`` for a retryable failure (network, contention)."""


class AssemblyChecksumConflictError(RuntimeError):
    """Raised when a 409 on publish reuses a key whose stored checksum diverges.

    A genuine collision (two different documents mapped to the same
    ``(document_digest, idempotency_key)``) must never be silently swallowed
    by treating every 409 as "already published" — reuse is only safe when
    the stored artifact's checksum matches what this worker just produced.
    """


class AssemblyFfmpegError(RuntimeError):
    """Raised when ffmpeg exits non-zero; carries its exit code and stderr.

    A generic ``RuntimeError`` would discard the one piece of information an
    operator needs to diagnose a bad filter graph or malformed input: the
    exact exit code and stderr ffmpeg produced. Both are preserved as
    attributes and folded into the message so they survive into the
    dead-letter reason instead of being replaced by a class name alone.
    """

    def __init__(self, returncode: int, stderr: bytes) -> None:
        self.returncode = returncode
        self.stderr = stderr
        self.stderr_text = stderr.decode("utf-8", errors="replace").strip()
        super().__init__(f"ffmpeg exited with code {returncode}: {self.stderr_text}")


def ensure_supabase_configured(env: Mapping[str, str] | None = None) -> None:
    """Confirm SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and SUPABASE_DB_URL are set.

    Only checks presence: never logs or returns any of the three values, and
    ``SUPABASE_SERVICE_ROLE_KEY`` never crosses this boundary into a return
    value or an exception message.
    """
    active_env = env if env is not None else os.environ
    missing = [
        var
        for var in (SUPABASE_URL_VAR, SUPABASE_SERVICE_ROLE_KEY_VAR, SUPABASE_DB_URL_VAR)
        if not active_env.get(var, "").strip()
    ]
    if missing:
        raise AssemblyConfigurationError(f"Missing configuration: {', '.join(missing)}")


@dataclass(frozen=True)
class AssemblySettings:
    timeout_s: float = 120.0
    max_retries: int = 3
    backoff_base_s: float = 1.0
    backoff_cap_s: float = 20.0
    jitter_ratio: float = 0.1


@dataclass(frozen=True)
class PublishedArtifact:
    """One published MP4: deterministic object key, digest of its exact bytes."""

    object_key: str
    content_digest: str


@dataclass(frozen=True)
class VideoBranding:
    """Deterministic editorial overlays selected from the brochure by Gemini."""

    logo_bytes: bytes | None = None
    yacht_name: str | None = None
    facts: tuple[str, ...] = ()

    @property
    def is_empty(self) -> bool:
        return not self.logo_bytes and not self.yacht_name and not self.facts


class ClipSource(Protocol):
    """Injectable clip download — no concrete Storage client is imported here."""

    def download_clip(self, object_key: str, timeout: float) -> bytes: ...


class PublishCheckpoint(Protocol):
    """Injectable Storage publish checkpoint — no concrete client imported here.

    ``acquire_and_publish`` MUST be a single conditional acquire/write keyed by
    ``(document_digest, idempotency_key)``: if a confirmed artifact already
    exists for that key, it is returned as-is and ``produce`` (which downloads
    every clip and re-invokes ffmpeg) is never called. Otherwise exactly one
    caller runs ``produce`` and persists its result; concurrent callers for the
    same key converge on that same published artifact.
    """

    def load_confirmed(self, document_digest: str, idempotency_key: str) -> PublishedArtifact | None: ...

    def acquire_and_publish(
        self,
        document_digest: str,
        idempotency_key: str,
        produce: Callable[[], tuple[PublishedArtifact, bytes]],
    ) -> PublishedArtifact: ...

    def record_dead_letter(self, document_digest: str, idempotency_key: str, reason: str) -> None:
        """Atomically persist a terminal failure, deduplicated by ``(document_digest, idempotency_key)``."""
        ...


class InMemoryPublishCheckpoint:
    """Reference ``PublishCheckpoint``: a per-key lock makes acquire/write atomic."""

    def __init__(self) -> None:
        self._confirmed: dict[tuple[str, str], PublishedArtifact] = {}
        self._bytes: dict[tuple[str, str], bytes] = {}
        self._locks: dict[tuple[str, str], Lock] = {}
        self._locks_guard = Lock()
        self._dead_letters: dict[tuple[str, str], str] = {}
        self.produce_calls: list[str] = []

    def load_confirmed(self, document_digest: str, idempotency_key: str) -> PublishedArtifact | None:
        return self._confirmed.get((document_digest, idempotency_key))

    def _lock_for(self, key: tuple[str, str]) -> Lock:
        with self._locks_guard:
            lock = self._locks.get(key)
            if lock is None:
                lock = Lock()
                self._locks[key] = lock
            return lock

    def acquire_and_publish(
        self,
        document_digest: str,
        idempotency_key: str,
        produce: Callable[[], tuple[PublishedArtifact, bytes]],
    ) -> PublishedArtifact:
        key = (document_digest, idempotency_key)
        with self._lock_for(key):
            existing = self._confirmed.get(key)
            if existing is not None:
                return existing
            self.produce_calls.append(idempotency_key)
            artifact, artifact_bytes = produce()
            self._confirmed[key] = artifact
            self._bytes[key] = artifact_bytes
            return artifact

    def record_dead_letter(self, document_digest: str, idempotency_key: str, reason: str) -> None:
        key = (document_digest, idempotency_key)
        with self._lock_for(key):
            self._dead_letters.setdefault(key, reason)

    def dead_letters_for(self, document_digest: str) -> dict[str, str]:
        return {
            idempotency_key: reason
            for (doc_digest, idempotency_key), reason in self._dead_letters.items()
            if doc_digest == document_digest
        }


StorageRequestFn = Callable[[str, dict[str, str], bytes | None, float], tuple[int, bytes]]


def default_storage_request(url: str, headers: dict[str, str], body: bytes | None, timeout: float) -> tuple[int, bytes]:
    """Real blocking HTTP call via urllib, stdlib only — never invoked from tests.

    Same injected-``request``/stdlib-``urllib`` shape as
    ``workers/yatco_aggregation.py``'s ``default_request``: no Supabase SDK is
    imported here or anywhere else in this module.
    """
    method = "POST" if body is not None else "GET"
    request = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.status, response.read()
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read()


def _is_transient_storage_status(status_code: int) -> bool:
    """429/5xx are retried, same policy as ``yatco_aggregation.is_transient_status``."""
    return status_code == 429 or 500 <= status_code < 600


class SupabaseStoragePublishCheckpoint:
    """Production ``PublishCheckpoint``: the absence check is enforced by
    Supabase Storage itself, not by a local lock.

    ``acquire_and_publish`` uploads the object with the ``x-upsert: false``
    header — Storage's own conditional create. A duplicate object key for
    ``(document_digest, idempotency_key)`` therefore comes back as HTTP 409
    rather than silently overwriting; that 409 is treated as "already
    published" and the existing key is reused, so two independent worker
    processes racing on the same idempotency key can still only ever leave
    one object behind, even though each one recomputes the artifact locally
    before the conditional write settles which one actually persists.
    """

    def __init__(
        self,
        supabase_url: str,
        supabase_service_key: str,
        bucket: str = "videos",
        request: StorageRequestFn = default_storage_request,
        settings: AssemblySettings | None = None,
        sleep: Callable[[float], None] = time.sleep,
        rand: Callable[[], float] = random.random,
    ) -> None:
        self._supabase_url = supabase_url.rstrip("/")
        self._headers = {
            "apikey": supabase_service_key,
            "Authorization": f"Bearer {supabase_service_key}",
        }
        self._bucket = bucket
        self._request = request
        self._settings = settings or AssemblySettings()
        self._sleep = sleep
        self._rand = rand

    def _object_url(self, object_key: str) -> str:
        return f"{self._supabase_url}/storage/v1/object/{self._bucket}/{object_key}"

    def _call_with_retry(
        self,
        url: str,
        headers: dict[str, str],
        body: bytes | None,
        timeout: float,
        operation: str,
    ) -> tuple[int, bytes]:
        """Bounded retry with capped exponential backoff for one Storage call.

        Network errors and 429/5xx responses are transient and retried up to
        ``settings.max_retries``; any other response (including a definitive
        4xx) is returned as-is without retrying, so ``acquire_and_publish``
        only ever dead-letters after this bounded budget is exhausted.
        """

        def attempt() -> tuple[int, bytes]:
            try:
                status, resp_body = self._request(url, headers, body, timeout)
            except (urllib.error.URLError, TimeoutError, OSError) as exc:
                raise AssemblyTransientError(f"{operation}:network_error:{exc.__class__.__name__}") from exc
            if _is_transient_storage_status(status):
                raise AssemblyTransientError(f"{operation}:http_{status}")
            return status, resp_body

        return run_with_retry(
            attempt,
            is_transient=lambda exc: isinstance(exc, AssemblyTransientError),
            max_retries=self._settings.max_retries,
            backoff_base_s=self._settings.backoff_base_s,
            backoff_cap_s=self._settings.backoff_cap_s,
            sleep=self._sleep,
            rand=self._rand,
            jitter_ratio=self._settings.jitter_ratio,
            on_retry=lambda attempt_n, delay: LOGGER.warning(
                "storage %s retry %s/%s in %.3fs", operation, attempt_n, self._settings.max_retries, delay
            ),
        )

    def load_confirmed(self, document_digest: str, idempotency_key: str) -> PublishedArtifact | None:
        object_key = _object_key(document_digest, idempotency_key)
        status, body = self._call_with_retry(
            f"{self._supabase_url}/storage/v1/object/info/{self._bucket}/{object_key}",
            self._headers,
            None,
            30.0,
            operation="load_confirmed",
        )
        if status != 200:
            return None
        metadata = json.loads(body)
        checksum = metadata.get("checksum", "")
        if _is_valid_sha256_hex(checksum):
            return PublishedArtifact(object_key=object_key, content_digest=checksum)

        # Supabase Storage's real object-info response exposes ``name``,
        # ``etag`` and ``size``, but no application-level sha256 ``checksum``.
        # Verify such a legacy/production object by reading its exact bytes;
        # this is still cheaper than rebuilding the video and makes replay
        # genuinely idempotent. An arbitrary/malformed metadata response is
        # not trusted unless it identifies the expected object.
        if not isinstance(metadata, dict) or metadata.get("name") != object_key:
            return None
        object_status, object_bytes = self._call_with_retry(
            self._object_url(object_key),
            self._headers,
            None,
            120.0,
            operation="load_confirmed_object",
        )
        if object_status != 200:
            return None
        return PublishedArtifact(
            object_key=object_key,
            content_digest=hashlib.sha256(object_bytes).hexdigest(),
        )

    def acquire_and_publish(
        self,
        document_digest: str,
        idempotency_key: str,
        produce: Callable[[], tuple[PublishedArtifact, bytes]],
    ) -> PublishedArtifact:
        existing = self.load_confirmed(document_digest, idempotency_key)
        if existing is not None:
            return existing

        artifact, artifact_bytes = produce()
        status, _body = self._call_with_retry(
            self._object_url(artifact.object_key),
            {**self._headers, "Content-Type": f"video/{CONTAINER_FORMAT}", "x-upsert": "false"},
            artifact_bytes,
            120.0,
            operation="acquire_and_publish",
        )
        if status in (200, 201):
            return artifact
        if status == 409:
            # Storage's own conditional create rejected this write because
            # the key is already published (e.g. a concurrent racer or a
            # retried attempt of this same call won first). Read back the
            # stored metadata rather than assuming our local artifact is the
            # one that won the race: only a matching checksum makes reuse
            # safe, a divergent one is a real collision and must surface.
            confirmed = self.load_confirmed(document_digest, idempotency_key)
            if confirmed is None or confirmed.content_digest != artifact.content_digest:
                stored_digest = confirmed.content_digest if confirmed is not None else "<missing>"
                raise AssemblyChecksumConflictError(
                    f"checksum mismatch for object_key={artifact.object_key}: "
                    f"expected={artifact.content_digest} stored={stored_digest}"
                )
            return confirmed
        raise RuntimeError(f"storage publish failed with status {status}")

    def record_dead_letter(self, document_digest: str, idempotency_key: str, reason: str) -> None:
        LOGGER.error(
            "video assembly dead-lettered for document_digest=%s idempotency_key=%s reason=%s",
            document_digest,
            idempotency_key,
            reason,
        )


def _object_key(document_digest: str, idempotency_key: str) -> str:
    return f"videos/{document_digest[:16]}/{idempotency_key}.{CONTAINER_FORMAT}"


def _is_valid_sha256_hex(value: object) -> bool:
    """A sha256 hex digest is exactly 64 lowercase-hex characters.

    ``value`` comes from remote Storage metadata JSON and may be absent,
    null, or any JSON type (number, list, dict): the type check must run
    before length/char checks so those cases return False instead of
    raising TypeError.
    """
    return isinstance(value, str) and len(value) == 64 and all(char in "0123456789abcdef" for char in value)


def _build_ffmpeg_command(input_paths: Sequence[Path], output_path: Path, clip_duration_s: float) -> list[str]:
    """Build a direct ffmpeg command joining ``input_paths`` in that exact order.

    A single clip is re-encoded untouched; two or more are chained through
    consecutive ``xfade`` filters (video) so every transition is explicit in
    the filter graph rather than a plain concatenation. Output is always
    ``libx264``/MP4.
    """
    command: list[str] = ["ffmpeg", "-y"]
    for path in input_paths:
        command += ["-i", str(path)]

    if len(input_paths) == 1:
        command += ["-map", "0:v"]
    else:
        filters = []
        prev_label = "0:v"
        offset = clip_duration_s - TRANSITION_DURATION_S
        for index in range(1, len(input_paths)):
            out_label = f"v{index}"
            filters.append(
                f"[{prev_label}][{index}:v]xfade=transition={TRANSITION_TYPE}:"
                f"duration={TRANSITION_DURATION_S}:offset={offset}[{out_label}]"
            )
            prev_label = out_label
            offset += clip_duration_s - TRANSITION_DURATION_S
        command += ["-filter_complex", ";".join(filters), "-map", f"[{prev_label}]"]

    command += ["-c:v", VIDEO_CODEC, "-f", CONTAINER_FORMAT, str(output_path)]
    return command


def _editorial_schedule(total_duration_s: float, branding: VideoBranding) -> list[tuple[str, float, float, bool]]:
    """At most one title and three facts, spread out without visual overload."""
    overlays: list[tuple[str, float, float, bool]] = []
    if branding.yacht_name:
        overlays.append((branding.yacht_name, 0.25, min(3.0, total_duration_s), True))
    facts = branding.facts[:3]
    if facts and total_duration_s > 4.0:
        start = 3.5 if branding.yacht_name else 1.0
        available = max(0.0, total_duration_s - start - 0.5)
        slot = available / len(facts)
        for index, text in enumerate(facts):
            show_at = start + index * slot
            hide_at = min(total_duration_s - 0.25, show_at + min(3.2, max(1.8, slot * 0.65)))
            overlays.append((text, show_at, hide_at, False))
    return overlays


def _build_branding_ffmpeg_command(
    input_path: Path,
    output_path: Path,
    logo_path: Path | None,
    text_files: Sequence[tuple[Path, float, float, bool]],
) -> list[str]:
    """Build a second deterministic pass for logo and sparse editorial text."""
    command = ["ffmpeg", "-y", "-i", str(input_path)]
    filters: list[str] = []
    current = "0:v"
    stage_index = 0
    if logo_path is not None:
        command += ["-loop", "1", "-i", str(logo_path)]
        filters.append("[1:v]scale=180:-1,format=rgba,colorchannelmixer=aa=0.10[brokerlogo]")
        filters.append(
            f"[{current}][brokerlogo]overlay=W-w-W*0.025:H-h-H*0.035:format=auto[stage{stage_index}]"
        )
        current = f"stage{stage_index}"
        stage_index += 1

    for text_path, start_s, end_s, is_title in text_files:
        output_label = f"stage{stage_index}"
        fontsize = "h/15" if is_title else "h/27"
        y_position = "h*0.72" if is_title else "h*0.82"
        filters.append(
            f"[{current}]drawtext=textfile='{text_path}':fontcolor=white:fontsize={fontsize}:"
            f"box=1:boxcolor=black@0.42:boxborderw=14:x=(w-text_w)/2:y={y_position}:"
            f"enable='between(t,{start_s:.2f},{end_s:.2f})'[{output_label}]"
        )
        current = output_label
        stage_index += 1

    command += [
        "-filter_complex", ";".join(filters),
        "-map", f"[{current}]",
        "-an",
        "-c:v", VIDEO_CODEC,
        "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
    ]
    if logo_path is not None:
        command.append("-shortest")
    command += ["-f", CONTAINER_FORMAT, str(output_path)]
    return command


def assemble_and_publish(
    job_id: str,
    upload_ref: str,
    document_digest: str,
    clips: Sequence[ClipCheckpoint],
    idempotency_key: str,
    clip_source: ClipSource,
    checkpoint: PublishCheckpoint,
    run: RunFn = subprocess.run,
    settings: AssemblySettings | None = None,
    sleep: Callable[[float], None] = time.sleep,
    rand: Callable[[], float] = random.random,
    env: Mapping[str, str] | None = None,
    branding: VideoBranding | None = None,
) -> UploadStatusResultJob:
    """Assemble ``clips`` strictly in the given order and publish the MP4.

    ``ensure_supabase_configured`` runs first: missing Supabase configuration
    blocks the whole run before any download or ffmpeg invocation, and never
    logs the service_role value. Clips are downloaded and fed to ffmpeg in
    the exact order of ``clips`` — the caller's stable per-section order —
    never re-sorted here. The whole produce path (download + ffmpeg + digest)
    runs behind ``checkpoint.acquire_and_publish``, keyed by
    ``(document_digest, idempotency_key)``: a replayed job with the same key
    reuses the previously published artifact and never re-invokes ffmpeg.

    Returns an ``UploadStatusResultJob`` in the ``result`` phase: ``done``
    with the published artifact on success, or ``error`` with a dead-lettered
    reason on definitive failure. No row is ever written to a database — only
    the returned envelope and, on success, the Storage object itself.
    """
    ensure_supabase_configured(env)
    if not clips:
        raise ValueError("clips must be non-empty")
    if len({clip.image_id for clip in clips}) != len(clips):
        raise ValueError("clips must have unique image_id entries")

    settings = settings or AssemblySettings()

    def produce() -> tuple[PublishedArtifact, bytes]:
        with tempfile.TemporaryDirectory(prefix="video-assembler-") as tmp_dir:
            tmp_path = Path(tmp_dir)
            input_paths: list[Path] = []
            for clip in clips:
                clip_bytes = run_with_retry(
                    lambda clip=clip: clip_source.download_clip(clip.object_key, settings.timeout_s),
                    is_transient=lambda exc: isinstance(exc, AssemblyTransientError),
                    max_retries=settings.max_retries,
                    backoff_base_s=settings.backoff_base_s,
                    backoff_cap_s=settings.backoff_cap_s,
                    sleep=sleep,
                    rand=rand,
                    jitter_ratio=settings.jitter_ratio,
                    on_retry=lambda attempt, delay, clip=clip: LOGGER.warning(
                        "clip download retry %s/%s for %s in %.3fs",
                        attempt,
                        settings.max_retries,
                        clip.image_id,
                        delay,
                    ),
                )
                input_path = tmp_path / f"{clip.image_id}.mp4"
                input_path.write_bytes(clip_bytes)
                input_paths.append(input_path)

            base_output_path = tmp_path / f"{idempotency_key}-base.{CONTAINER_FORMAT}"
            command = _build_ffmpeg_command(input_paths, base_output_path, CLIP_DURATION_S)

            def _invoke() -> subprocess.CompletedProcess:
                result = run(command, capture_output=True, timeout=settings.timeout_s, check=False)
                if result.returncode != 0:
                    raise AssemblyFfmpegError(result.returncode, result.stderr or b"")
                return result

            run_with_retry(
                _invoke,
                is_transient=lambda exc: isinstance(exc, AssemblyTransientError),
                max_retries=settings.max_retries,
                backoff_base_s=settings.backoff_base_s,
                backoff_cap_s=settings.backoff_cap_s,
                sleep=sleep,
                rand=rand,
                jitter_ratio=settings.jitter_ratio,
                on_retry=lambda attempt, delay: LOGGER.warning(
                    "ffmpeg assembly retry %s/%s in %.3fs", attempt, settings.max_retries, delay
                ),
            )

            output_path = base_output_path
            active_branding = branding or VideoBranding()
            if not active_branding.is_empty:
                logo_path: Path | None = None
                if active_branding.logo_bytes:
                    logo_path = tmp_path / "brokerage-logo.img"
                    logo_path.write_bytes(active_branding.logo_bytes)
                total_duration_s = len(clips) * CLIP_DURATION_S - max(0, len(clips) - 1) * TRANSITION_DURATION_S
                text_files: list[tuple[Path, float, float, bool]] = []
                for index, (text, start_s, end_s, is_title) in enumerate(
                    _editorial_schedule(total_duration_s, active_branding)
                ):
                    text_path = tmp_path / f"overlay-{index}.txt"
                    text_path.write_text(text, encoding="utf-8")
                    text_files.append((text_path, start_s, end_s, is_title))
                branded_output_path = tmp_path / f"{idempotency_key}-branded.{CONTAINER_FORMAT}"
                branding_command = _build_branding_ffmpeg_command(
                    base_output_path,
                    branded_output_path,
                    logo_path,
                    text_files,
                )
                branded_result = run(
                    branding_command,
                    capture_output=True,
                    timeout=settings.timeout_s,
                    check=False,
                )
                if branded_result.returncode != 0:
                    raise AssemblyFfmpegError(branded_result.returncode, branded_result.stderr or b"")
                output_path = branded_output_path

            output_bytes = output_path.read_bytes()
            artifact = PublishedArtifact(
                object_key=_object_key(document_digest, idempotency_key),
                content_digest=hashlib.sha256(output_bytes).hexdigest(),
            )
            return artifact, output_bytes

    try:
        artifact = checkpoint.acquire_and_publish(document_digest, idempotency_key, produce)
    except Exception as exc:  # noqa: BLE001 - any produce()/acquire_and_publish failure is a definitive, dead-lettered assembly error
        if isinstance(exc, AssemblyFfmpegError):
            # Preserve the exact ffmpeg exit code and stderr in the
            # dead-letter reason instead of collapsing them into a bare
            # class name — this is the only surviving diagnostic once the
            # subprocess itself is gone.
            reason = f"definitive:{exc.__class__.__name__}:exit_code={exc.returncode}:stderr={exc.stderr_text}"
        else:
            # Garder le détail opérationnel (par exemple le statut HTTP
            # Supabase) : le nom ``RuntimeError`` seul est inutilisable pour
            # diagnostiquer un incident depuis l'interface ou journalctl.
            detail = " ".join(str(exc).split())[:500]
            reason = f"definitive:{exc.__class__.__name__}"
            if detail:
                reason += f":{detail}"
        checkpoint.record_dead_letter(document_digest, idempotency_key, reason)
        return UploadStatusResultJob(
            job_id=job_id,
            upload_ref=upload_ref,
            phase=JobPhase.RESULT.value,
            status=JobStatus.ERROR.value,
            error=JobError(code="video_assembly_failed", message=reason),
        )

    return UploadStatusResultJob(
        job_id=job_id,
        upload_ref=upload_ref,
        phase=JobPhase.RESULT.value,
        status=JobStatus.DONE.value,
        result={
            "object_key": artifact.object_key,
            "content_digest": artifact.content_digest,
            "clip_count": len(clips),
        },
    )
