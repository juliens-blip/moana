"""Idempotent oneshot runner: brochure PDF -> images -> Veo clips -> ffmpeg -> Storage.

Orchestrates, strictly in this order and exactly once per invocation,
``workers/pdf_image_extractor.py``'s ``build_manifest``, then
``workers/veo_generator.py``'s ``generate_section_clips``, then
``workers/video_assembler.py``'s ``assemble_and_publish``. Every collaborator
(Veo transport, Veo checkpoint, clip download, Storage publish, ffmpeg
invocation, sleep/rand, wall clock) is injected, so ``run_brochure_video_job``
itself never imports a concrete SDK or performs network I/O. ``main`` (the
systemd entry point) wires the one production implementation of each
collaborator — Supabase Storage and Gemini Veo, both stdlib ``urllib`` only,
mirroring ``workers/video_assembler.py``'s ``SupabaseStoragePublishCheckpoint``
— plus the free-tier Gemini Flash PDF-image classifier
(``workers/gemini_pdf_classifier.py``, keyed off ``GEMINI_FREE_TIER_API_KEY``,
never the paid Veo key) that runs before ``build_manifest`` in production.

Final job state (``running``/``done``/``failed``) is persisted by
``AtomicJobStateStore`` via a temp-file-then-``os.replace`` write, so a reader
never observes a partially written state file. The same store also holds an
exclusive ``flock`` on a per-job lock file for the whole run: two systemd
instances started for the same job id serialize instead of racing, and a
replay of an already-``done`` job returns the stored result without
re-invoking any collaborator. A run that exceeds ``JOB_TIMEOUT_S`` (600s,
checked against an injectable clock) is recorded as ``failed`` with a bounded,
secret-free reason.
"""

from __future__ import annotations

import base64
import fcntl
import hashlib
import json
import logging
import os
import random
import re
import subprocess
import sys
import tempfile
import time
import unicodedata
import urllib.error
import urllib.request
from collections.abc import Callable, Iterator, Mapping, Sequence
from contextlib import contextmanager
from dataclasses import asdict, dataclass
from pathlib import Path

from workers.gemini_pdf_classifier import (
    BrochureEditorialPlan,
    ClassificationSettings,
    ClassificationTransientError,
    GeminiClassificationError,
    GeminiFlashBrochureDirectorTransport,
    make_gemini_brochure_director,
)
from workers.job_contract import JobError, JobPhase, JobStatus, UploadStatusResultJob
from workers.pdf_image_extractor import (
    ClassifierStrategy,
    ExtractedImage,
    ManifestEntry,
    PdfExtractionError,
    PdfImageManifest,
    build_manifest,
    classify_image,
    extract_pdf_images,
    group_entries_by_section,
)
from workers.startup_checks import (
    GEMINI_API_KEY_PAYFUL_VAR,
    GEMINI_FREE_TIER_API_KEY_VAR,
    ROOT,
    VEO_PROVIDER_GEMINI_AI_STUDIO,
    VEO_PROVIDER_VAR,
    VEO_PROVIDER_VERTEX,
    load_worker_environment,
    validate_worker_startup,
)
from workers.veo_generator import (
    CLIP_DURATION_S,
    ClipCheckpoint,
    VeoGenerationFailure,
    VeoSettings,
    VeoTransientError,
    VeoTransport,
    generate_section_clips,
    run_with_retry,
)
from workers.veo_generator import (
    StorageCheckpoint as VeoStorageCheckpoint,
)
from workers.vertex_veo_transport import build_vertex_veo_transport
from workers.video_assembler import (
    SUPABASE_SERVICE_ROLE_KEY_VAR,
    SUPABASE_URL_VAR,
    AssemblySettings,
    AssemblyTransientError,
    ClipSource,
    PublishCheckpoint,
    RunFn,
    SupabaseStoragePublishCheckpoint,
    VideoBranding,
    assemble_and_publish,
    default_storage_request,
    ensure_supabase_configured,
)

LOGGER = logging.getLogger("moana.brochure_video_runner")

# 3600s: up to MAX_VIDEO_CLIPS (5) sequential Vertex Veo generations, each
# budgeted up to VeoSettings.timeout_s (240s) with one retry, plus ffmpeg
# assembly/branding (each retried up to AssemblySettings.timeout_s x 3).
# 600s dated from before Veo ever actually reached this phase in production
# (quota/config failures always struck first) and was never validated
# against real generation latency. The systemd unit's own TimeoutStartSec
# must stay above this value (see moana-brochure-video@.service) so this
# check fires cleanly before the OS kills the process outright.
JOB_TIMEOUT_S = 3600.0
CREATIVE_PIPELINE_VERSION = "editorial-branding-v3-five-sections"
MAX_VIDEO_CLIPS = 5
_MAX_REASON_LENGTH = 500
_JOB_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,128}$")
_DIGEST_RE = re.compile(r"^[0-9a-f]{64}$")


class BrochureVideoRunnerError(RuntimeError):
    """Base error for the brochure video runner."""


class InvalidJobInputError(BrochureVideoRunnerError):
    """Raised when the job id, PDF path or manifest marker fail validation."""


class JobAlreadyRunningError(BrochureVideoRunnerError):
    """Raised when another instance already holds the lock for this job id."""


class BrochureVideoTimeoutError(BrochureVideoRunnerError):
    """Raised when the run exceeds ``JOB_TIMEOUT_S`` before completing."""


class BrochureEditorialDirectionError(BrochureVideoRunnerError):
    """Raised before Veo when the required brochure-wide direction is unavailable."""


def build_creative_idempotency_key(document_digest: str) -> str:
    """Version the final montage cache while keeping Veo clip checkpoints reusable."""
    return hashlib.sha256(f"{CREATIVE_PIPELINE_VERSION}\0{document_digest}".encode()).hexdigest()


_INTERIOR_MARKERS = ("interieur", "interior")
_EXTERIOR_MARKERS = ("exterieur", "exterior")


def _strip_accents(text: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFKD", text) if not unicodedata.combining(c))


def _classify_view(section: str) -> str:
    """Bucket a free-form section label as ``interior``, ``exterior`` or ``other``."""
    normalized = _strip_accents(section).casefold()
    if any(marker in normalized for marker in _INTERIOR_MARKERS):
        return "interior"
    if any(marker in normalized for marker in _EXTERIOR_MARKERS):
        return "exterior"
    return "other"


def select_video_entries(
    entries: Sequence[ManifestEntry],
    limit: int = MAX_VIDEO_CLIPS,
    logo_image_id: str | None = None,
) -> tuple[ManifestEntry, ...]:
    """Keep one representative image per editorial section, up to ``limit``.

    ``group_entries_by_section`` groups the manifest, but Veo consumes flat
    entries and therefore used to generate one clip for every image. Selecting
    the first non-logo image of each section restores the product contract:
    five editorial sections mean at most five generated clips. The logo is
    always excluded here too (belt-and-suspenders with the caller's own
    filter).

    Interior and exterior representatives are *reserved* first — each up to
    ``ceil(limit/2)`` — before any remaining slot is handed to other
    sections, so a brochure order that happens to interleave many "other"
    sections ahead of the interior/exterior ones can never crowd the 2-3/2-3
    balance target out of the final five. Only once both reservations are
    made (interior first, then exterior, both deterministic and
    order-preserving) does the leftover budget flow to other sections, and
    then back to interior/exterior beyond their cap if the brochure has too
    few other sections to fill it. Brochures poor in one view fall back
    deterministically to whatever unique sections are actually available.
    ``limit`` is clamped to ``MAX_VIDEO_CLIPS``: the five-clip product cap is
    invariant regardless of what a caller passes in.
    """
    if limit < 1:
        raise ValueError("video entry limit must be positive")
    limit = min(limit, MAX_VIDEO_CLIPS)  # the 5-clip product cap is invariant, whatever the caller passes
    deduped: list[ManifestEntry] = []
    seen_sections: set[str] = set()
    for entry in entries:
        if entry.image_id == logo_image_id:
            continue
        section_key = entry.section.casefold().strip()
        if section_key in seen_sections:
            continue
        seen_sections.add(section_key)
        deduped.append(entry)

    max_per_view = -(-limit // 2)  # ceil(limit / 2): the 2-3/2-3 balance target
    interior_pool = [entry for entry in deduped if _classify_view(entry.section) == "interior"]
    exterior_pool = [entry for entry in deduped if _classify_view(entry.section) == "exterior"]
    other_pool = [entry for entry in deduped if _classify_view(entry.section) == "other"]

    int_take = min(max_per_view, len(interior_pool))
    remaining = limit - int_take
    ext_take = min(max_per_view, len(exterior_pool), remaining)
    remaining -= ext_take
    other_take = min(remaining, len(other_pool))
    remaining -= other_take
    if remaining > 0:
        extra_int = min(remaining, len(interior_pool) - int_take)
        int_take += extra_int
        remaining -= extra_int
    if remaining > 0:
        extra_ext = min(remaining, len(exterior_pool) - ext_take)
        ext_take += extra_ext
        remaining -= extra_ext

    chosen_ids = {entry.image_id for entry in interior_pool[:int_take]}
    chosen_ids |= {entry.image_id for entry in exterior_pool[:ext_take]}
    chosen_ids |= {entry.image_id for entry in other_pool[:other_take]}
    return tuple(entry for entry in deduped if entry.image_id in chosen_ids)


def _validate_job_id(job_id: str) -> str:
    if not isinstance(job_id, str) or not _JOB_ID_RE.match(job_id):
        raise InvalidJobInputError(
            "job_id must be a non-empty, path-safe identifier of [A-Za-z0-9_-], max 128 chars"
        )
    return job_id


def _validate_input_file(path: Path, label: str) -> Path:
    if not path.is_file():
        raise InvalidJobInputError(f"{label} does not exist or is not a regular file")
    return path


def _load_and_validate_marker(marker_path: Path, expected_document_digest: str) -> dict:
    try:
        raw = marker_path.read_text(encoding="utf-8")
        marker = json.loads(raw)
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise InvalidJobInputError("manifest marker is not readable UTF-8 JSON") from exc
    if not isinstance(marker, dict):
        raise InvalidJobInputError("manifest marker must be a JSON object")
    digest = marker.get("document_digest")
    if not isinstance(digest, str) or not _DIGEST_RE.match(digest):
        raise InvalidJobInputError("manifest marker document_digest must be a 64-char sha256 hex digest")
    if digest != expected_document_digest:
        raise InvalidJobInputError("manifest marker document_digest does not match the PDF's content digest")
    return marker


def _redact_reason(message: str) -> str:
    return message.replace("\n", " ").replace("\r", " ").strip()[:_MAX_REASON_LENGTH]


@dataclass(frozen=True)
class JobState:
    """Persisted, JSON-serializable snapshot of one job's terminal or in-flight state."""

    job_id: str
    status: str  # "running" | "done" | "failed"
    started_at: float
    result: dict | None = None
    reason: str | None = None


class AtomicJobStateStore:
    """File-backed job state with atomic writes and cross-process mutual exclusion.

    Each job id owns two files under ``state_dir``: ``{job_id}.json`` (the
    state snapshot, always written via a temp file + ``os.replace`` so a
    concurrent reader never observes a torn write) and ``{job_id}.lock`` (held
    exclusively, non-blocking, for the whole duration of ``acquire``). A
    second process starting the same job while the first still holds the lock
    fails fast with ``JobAlreadyRunningError`` instead of racing it.
    """

    def __init__(self, state_dir: Path) -> None:
        self._state_dir = Path(state_dir)
        self._state_dir.mkdir(parents=True, exist_ok=True)

    def _state_path(self, job_id: str) -> Path:
        return self._state_dir / f"{job_id}.json"

    def _lock_path(self, job_id: str) -> Path:
        return self._state_dir / f"{job_id}.lock"

    def load(self, job_id: str) -> JobState | None:
        path = self._state_path(job_id)
        if not path.is_file():
            return None
        data = json.loads(path.read_text(encoding="utf-8"))
        return JobState(**data)

    def _write_atomic(self, state: JobState) -> None:
        path = self._state_path(state.job_id)
        fd, tmp_name = tempfile.mkstemp(prefix=f".{state.job_id}-", suffix=".tmp", dir=str(self._state_dir))
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as fh:
                json.dump(asdict(state), fh)
            os.replace(tmp_name, path)
        except BaseException:
            if os.path.exists(tmp_name):
                os.remove(tmp_name)
            raise

    def begin(self, job_id: str, started_at: float) -> JobState:
        state = JobState(job_id=job_id, status="running", started_at=started_at)
        self._write_atomic(state)
        return state

    def complete(self, job_id: str, started_at: float, result: dict) -> JobState:
        state = JobState(job_id=job_id, status="done", started_at=started_at, result=result)
        self._write_atomic(state)
        return state

    def fail(self, job_id: str, started_at: float, reason: str) -> JobState:
        state = JobState(job_id=job_id, status="failed", started_at=started_at, reason=_redact_reason(reason))
        self._write_atomic(state)
        return state

    @contextmanager
    def acquire(self, job_id: str) -> Iterator[JobState | None]:
        """Hold an exclusive, non-blocking lock on ``job_id`` for the whole ``with`` body.

        Yields the state as of acquisition time (``None`` if this job has
        never run). Raises ``JobAlreadyRunningError`` immediately, without
        blocking, if another process already holds the lock.
        """
        lock_fd = os.open(str(self._lock_path(job_id)), os.O_CREAT | os.O_RDWR, 0o600)
        try:
            fcntl.flock(lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError as exc:
            os.close(lock_fd)
            raise JobAlreadyRunningError(f"job {job_id!r} is already running") from exc
        try:
            yield self.load(job_id)
        finally:
            fcntl.flock(lock_fd, fcntl.LOCK_UN)
            os.close(lock_fd)


def _envelope_from_state(job_id: str, upload_ref: str, state: JobState) -> UploadStatusResultJob:
    if state.status == "done":
        return UploadStatusResultJob(
            job_id=job_id,
            upload_ref=upload_ref,
            phase=JobPhase.RESULT.value,
            status=JobStatus.DONE.value,
            result=state.result,
        )
    return UploadStatusResultJob(
        job_id=job_id,
        upload_ref=upload_ref,
        phase=JobPhase.RESULT.value,
        status=JobStatus.ERROR.value,
        error=JobError(code="brochure_video_failed", message=state.reason or "unknown failure"),
    )


def _check_timeout(start: float, now: Callable[[], float], timeout_s: float) -> None:
    elapsed = now() - start
    if elapsed > timeout_s:
        raise BrochureVideoTimeoutError(f"job exceeded timeout of {timeout_s:.0f}s (elapsed {elapsed:.1f}s)")


def run_brochure_video_job(
    job_id: str,
    pdf_path: str | Path,
    manifest_marker_path: str | Path,
    upload_ref: str,
    state_store: AtomicJobStateStore,
    veo_transport: VeoTransport,
    veo_checkpoint: VeoStorageCheckpoint,
    clip_source: ClipSource,
    publish_checkpoint: PublishCheckpoint,
    idempotency_key: str | None = None,
    pdf_classifier: ClassifierStrategy | None = None,
    editorial_director: Callable[[bytes, Sequence[ExtractedImage]], BrochureEditorialPlan] | None = None,
    veo_settings: VeoSettings | None = None,
    assembly_settings: AssemblySettings | None = None,
    run: RunFn = subprocess.run,
    sleep: Callable[[float], None] = time.sleep,
    rand: Callable[[], float] = random.random,
    env: Mapping[str, str] | None = None,
    now: Callable[[], float] = time.time,
    timeout_s: float = JOB_TIMEOUT_S,
) -> UploadStatusResultJob:
    """Validate the job, then run extraction, Veo generation and ffmpeg/publish in order.

    ``job_id`` gates every filesystem path this function touches, so it is
    validated as a bare path-safe token first. ``pdf_path`` and
    ``manifest_marker_path`` must both already exist; the marker's
    ``document_digest`` must match the PDF's actual sha256, which both
    detects tampering and keeps the marker from pointing anywhere outside the
    job's own data. A replay of an already-``done`` job returns the stored
    result without calling any collaborator; a concurrent run for the same
    ``job_id`` fails fast via ``AtomicJobStateStore.acquire`` instead of
    racing. The whole attempt is bounded by ``timeout_s``, checked against
    ``now`` between steps. ``pdf_classifier`` is the ``build_manifest``
    injection point (``ExtractedImage -> str``): production wiring passes a
    Gemini Flash free-tier classifier (see ``main``); tests may inject a
    fake or omit it to fall back to ``pdf_image_extractor``'s default
    content-derived label.
    """
    _validate_job_id(job_id)
    pdf_path = _validate_input_file(Path(pdf_path), "pdf_path")
    manifest_marker_path = _validate_input_file(Path(manifest_marker_path), "manifest_marker_path")

    with state_store.acquire(job_id) as existing:
        if existing is not None and existing.status == "done":
            return _envelope_from_state(job_id, upload_ref, existing)

        start = now()
        state_store.begin(job_id, started_at=start)

        try:
            pdf_bytes = pdf_path.read_bytes()
            document_digest = hashlib.sha256(pdf_bytes).hexdigest()
            _load_and_validate_marker(manifest_marker_path, document_digest)

            key = idempotency_key or build_creative_idempotency_key(document_digest)
            existing_artifact = publish_checkpoint.load_confirmed(document_digest, key)
            if existing_artifact is not None:
                # Un nouveau job pour le même PDF doit réutiliser la vidéo
                # finale vérifiée avant tout appel Gemini (classification ou
                # Veo). C'est à la fois l'idempotence attendue et une
                # protection contre une dépense de crédits inutile lors d'un
                # simple nouvel essai UI.
                result = {
                    "object_key": existing_artifact.object_key,
                    "content_digest": existing_artifact.content_digest,
                }
                state_store.complete(job_id, start, result)
                return _envelope_from_state(job_id, upload_ref, state_store.load(job_id))

            editorial_plan = BrochureEditorialPlan()
            images = extract_pdf_images(pdf_bytes)
            if editorial_director is not None:
                try:
                    editorial_plan = editorial_director(pdf_bytes, images)
                except (ClassificationTransientError, GeminiClassificationError, RuntimeError) as exc:
                    raise BrochureEditorialDirectionError(
                        f"gemini brochure direction unavailable: {exc.__class__.__name__}: {exc}"
                    ) from exc

            def classify_for_manifest(image) -> str:
                image_id = f"{document_digest[:16]}:{image.page_index:04d}:{image.occurrence_index:04d}"
                directed_section = editorial_plan.section_for(image_id)
                if directed_section:
                    return directed_section
                return classify_image(image, pdf_classifier)

            manifest = build_manifest(pdf_bytes, classify_for_manifest)
            _check_timeout(start, now, timeout_s)

            logo_entry = next(
                (entry for entry in manifest.entries if entry.image_id == editorial_plan.logo_image_id),
                None,
            )
            video_entries = select_video_entries(
                manifest.entries, logo_image_id=editorial_plan.logo_image_id
            )
            video_manifest = PdfImageManifest(
                document_digest=manifest.document_digest,
                entries=video_entries,
                groups=group_entries_by_section(video_entries),
            )

            try:
                veo_result = generate_section_clips(
                    video_manifest,
                    veo_transport,
                    veo_checkpoint,
                    settings=veo_settings,
                    sleep=sleep,
                    rand=rand,
                )
            except VeoGenerationFailure as exc:
                cause = str(exc.__cause__ or "")
                partial = exc.partial_result
                if "status 429" not in cause or partial is None or not partial.clips:
                    raise
                LOGGER.warning(
                    "veo quota reached after %s clips; assembling the checkpointed partial result",
                    len(partial.clips),
                )
                veo_result = partial
            _check_timeout(start, now, timeout_s)

            job_envelope = assemble_and_publish(
                job_id=job_id,
                upload_ref=upload_ref,
                document_digest=manifest.document_digest,
                clips=veo_result.clips,
                idempotency_key=key,
                clip_source=clip_source,
                checkpoint=publish_checkpoint,
                run=run,
                settings=assembly_settings,
                sleep=sleep,
                rand=rand,
                env=env,
                branding=VideoBranding(
                    logo_bytes=logo_entry.image_data if logo_entry is not None else None,
                ),
            )
            _check_timeout(start, now, timeout_s)
        except (
            InvalidJobInputError,
            PdfExtractionError,
            BrochureVideoTimeoutError,
        ) as exc:
            reason = f"{exc.__class__.__name__}:{_redact_reason(str(exc))}"
            state_store.fail(job_id, start, reason)
            return _envelope_from_state(job_id, upload_ref, state_store.load(job_id))
        except Exception as exc:  # noqa: BLE001 - any other collaborator failure is definitive and dead-lettered
            reason = f"{exc.__class__.__name__}:{_redact_reason(str(exc))}"
            if isinstance(exc, VeoGenerationFailure) and exc.__cause__ is not None:
                reason += f":{_redact_reason(str(exc.__cause__))}"
            state_store.fail(job_id, start, reason)
            return _envelope_from_state(job_id, upload_ref, state_store.load(job_id))

        if job_envelope.status == JobStatus.ERROR.value:
            state_store.fail(job_id, start, job_envelope.error.message)
            return job_envelope

        state_store.complete(job_id, start, job_envelope.result)
        return job_envelope


# ---------------------------------------------------------------------------
# Production collaborators (Supabase Storage + Gemini Veo), stdlib-only.
# Mirror workers/video_assembler.py's SupabaseStoragePublishCheckpoint: same
# ``apikey``/``Authorization`` headers, same injected ``request``/retry shape,
# never a concrete SDK.
# ---------------------------------------------------------------------------


class SupabaseVeoStorageCheckpoint:
    """Production Veo ``StorageCheckpoint``: clips and their manifest live in Storage.

    ``load_manifest`` reads a per-document sidecar JSON object
    (``{prefix}/_manifest.json``) listing every persisted ``ClipCheckpoint``;
    ``persist_clip`` uploads the clip bytes then rewrites that sidecar. Both
    calls are only ever made while this runner already holds the per-job
    lock (see ``AtomicJobStateStore.acquire``), so no additional locking is
    needed here to keep the read-then-write of the sidecar race-free.
    """

    def __init__(
        self,
        supabase_url: str,
        supabase_service_key: str,
        bucket: str = "veo-clips",
        request: Callable[[str, dict[str, str], bytes | None, float], tuple[int, bytes]] = default_storage_request,
        settings: AssemblySettings | None = None,
        sleep: Callable[[float], None] = time.sleep,
        rand: Callable[[], float] = random.random,
    ) -> None:
        self._supabase_url = supabase_url.rstrip("/")
        self._headers = {"apikey": supabase_service_key, "Authorization": f"Bearer {supabase_service_key}"}
        self._bucket = bucket
        self._request = request
        self._settings = settings or AssemblySettings()
        self._sleep = sleep
        self._rand = rand

    def _object_url(self, object_key: str) -> str:
        return f"{self._supabase_url}/storage/v1/object/{self._bucket}/{object_key}"

    def _manifest_key(self, document_digest: str) -> str:
        return f"veo-clips/{document_digest[:16]}/_manifest.json"

    def _call_with_retry(self, url: str, headers: dict[str, str], body: bytes | None, timeout: float, operation: str) -> tuple[int, bytes]:
        def attempt() -> tuple[int, bytes]:
            try:
                status, resp_body = self._request(url, headers, body, timeout)
            except (urllib.error.URLError, TimeoutError, OSError) as exc:
                raise AssemblyTransientError(f"{operation}:network_error:{exc.__class__.__name__}") from exc
            if status == 429 or 500 <= status < 600:
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
                "veo storage %s retry %s/%s in %.3fs", operation, attempt_n, self._settings.max_retries, delay
            ),
        )

    def load_manifest(self, document_digest: str) -> tuple[ClipCheckpoint, ...]:
        status, body = self._call_with_retry(
            self._object_url(self._manifest_key(document_digest)), self._headers, None, 30.0, "load_manifest"
        )
        if status != 200:
            return ()
        entries = json.loads(body)
        return tuple(
            ClipCheckpoint(
                image_id=entry["image_id"],
                object_key=entry["object_key"],
                duration_s=entry.get("duration_s", CLIP_DURATION_S),
                content_digest=entry["content_digest"],
            )
            for entry in entries
        )

    def persist_clip(self, document_digest: str, checkpoint: ClipCheckpoint, clip_bytes: bytes) -> None:
        status, _body = self._call_with_retry(
            self._object_url(checkpoint.object_key),
            {**self._headers, "Content-Type": "video/mp4", "x-upsert": "true"},
            clip_bytes,
            120.0,
            "persist_clip",
        )
        if status not in (200, 201):
            raise RuntimeError(f"veo clip upload failed with status {status}")

        existing = list(self.load_manifest(document_digest))
        merged = [entry for entry in existing if entry.image_id != checkpoint.image_id]
        merged.append(checkpoint)
        payload = json.dumps([asdict(entry) for entry in merged]).encode("utf-8")
        status, _body = self._call_with_retry(
            self._object_url(self._manifest_key(document_digest)),
            {**self._headers, "Content-Type": "application/json", "x-upsert": "true"},
            payload,
            30.0,
            "persist_manifest",
        )
        if status not in (200, 201):
            raise RuntimeError(f"veo manifest upload failed with status {status}")


class SupabaseClipSource:
    """Production ``ClipSource``: downloads a previously persisted Veo clip from Storage."""

    def __init__(
        self,
        supabase_url: str,
        supabase_service_key: str,
        bucket: str = "veo-clips",
        request: Callable[[str, dict[str, str], bytes | None, float], tuple[int, bytes]] = default_storage_request,
    ) -> None:
        self._supabase_url = supabase_url.rstrip("/")
        self._headers = {"apikey": supabase_service_key, "Authorization": f"Bearer {supabase_service_key}"}
        self._bucket = bucket
        self._request = request

    def download_clip(self, object_key: str, timeout: float) -> bytes:
        url = f"{self._supabase_url}/storage/v1/object/{self._bucket}/{object_key}"
        try:
            status, body = self._request(url, self._headers, None, timeout)
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            raise AssemblyTransientError(f"download_clip:network_error:{exc.__class__.__name__}") from exc
        if status == 429 or 500 <= status < 600:
            raise AssemblyTransientError(f"download_clip:http_{status}")
        if status != 200:
            raise RuntimeError(f"veo clip download failed with status {status}")
        return body


class GeminiVeoTransport:
    """Production ``VeoTransport``: Gemini Veo long-running video generation over stdlib ``urllib``.

    Calls ``models/{model}:predictLongRunning``, polls the returned
    operation until ``done``, then downloads the generated video bytes —
    the documented long-running-operation shape for Gemini Veo. Never
    imports the ``google-generativeai`` SDK; the API key is read once at
    construction and only ever sent as the ``x-goog-api-key`` header, never
    logged.
    """

    def __init__(
        self,
        api_key: str,
        model: str = "veo-3.1-lite-generate-preview",
        base_url: str = "https://generativelanguage.googleapis.com/v1beta",
        poll_interval_s: float = 5.0,
        sleep: Callable[[float], None] = time.sleep,
    ) -> None:
        self._headers = {"x-goog-api-key": api_key, "Content-Type": "application/json"}
        self._model = model
        self._base_url = base_url.rstrip("/")
        self._poll_interval_s = poll_interval_s
        self._sleep = sleep

    def _request(self, method: str, url: str, body: bytes | None, timeout: float) -> dict:
        request = urllib.request.Request(url, data=body, headers=self._headers, method=method)
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                return json.loads(response.read())
        except urllib.error.HTTPError as exc:
            detail = ""
            quota_summary = ""
            try:
                payload = json.loads(exc.read())
                error_payload = payload.get("error", {})
                detail = str(error_payload.get("message", ""))
                quota_parts: list[str] = []
                for item in error_payload.get("details", []):
                    if not isinstance(item, dict):
                        continue
                    for violation in item.get("violations", []):
                        if not isinstance(violation, dict):
                            continue
                        metric = violation.get("quotaMetric") or violation.get("quotaId")
                        dimensions = violation.get("quotaDimensions")
                        if metric:
                            quota_parts.append(f"quota={metric}")
                        if isinstance(dimensions, dict) and dimensions:
                            rendered = ",".join(f"{key}={value}" for key, value in sorted(dimensions.items()))
                            quota_parts.append(f"dimensions={rendered}")
                    retry_delay = item.get("retryDelay")
                    if retry_delay:
                        quota_parts.append(f"retry_after={retry_delay}")
                quota_summary = "; ".join(quota_parts)
            except (json.JSONDecodeError, AttributeError, TypeError):
                pass
            summary = f" ({quota_summary[:400]})" if quota_summary else ""
            suffix = f": {detail[:300]}" if detail else ""
            message = f"gemini veo request failed with status {exc.code}{summary}{suffix}"
            if exc.code == 429 or 500 <= exc.code < 600:
                raise VeoTransientError(message) from exc
            raise RuntimeError(message) from exc

    def generate_clip(self, prompt: str, entry: ManifestEntry, timeout: float) -> bytes:
        if not entry.image_data:
            raise RuntimeError("gemini veo source image is missing")
        start_body = json.dumps(
            {
                "instances": [{
                    "prompt": prompt,
                    "image": {
                        "bytesBase64Encoded": base64.b64encode(entry.image_data).decode("ascii"),
                        "mimeType": entry.mime_type,
                    },
                }],
                "parameters": {"durationSeconds": int(CLIP_DURATION_S)},
            }
        ).encode("utf-8")
        operation = self._request(
            "POST", f"{self._base_url}/models/{self._model}:predictLongRunning", start_body, timeout
        )
        operation_name = operation.get("name")
        if not operation_name:
            raise RuntimeError("gemini veo predictLongRunning response missing operation name")

        deadline = time.monotonic() + timeout
        while not operation.get("done"):
            if time.monotonic() >= deadline:
                raise RuntimeError(f"gemini veo generation timed out for section {entry.image_id}")
            self._sleep(self._poll_interval_s)
            operation = self._request("GET", f"{self._base_url}/{operation_name}", None, timeout)

        if operation.get("error"):
            raise RuntimeError(f"gemini veo generation failed: {operation['error']}")

        try:
            samples = operation["response"]["generateVideoResponse"]["generatedSamples"]
            video_uri = samples[0]["video"]["uri"]
        except (KeyError, IndexError) as exc:
            raise RuntimeError("gemini veo operation response missing generated video uri") from exc

        request = urllib.request.Request(video_uri, headers=self._headers, method="GET")
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                return response.read()
        except urllib.error.HTTPError as exc:
            raise RuntimeError(f"gemini veo video download failed with status {exc.code}") from exc


def select_veo_transport(env: Mapping[str, str]) -> VeoTransport:
    """Pick the production ``VeoTransport`` from ``VEO_PROVIDER`` (default ``vertex``).

    ``vertex`` builds ``VertexVeoTransport`` (Vertex AI Veo, Application
    Default Credentials / ``GOOGLE_APPLICATION_CREDENTIALS`` — never
    ``GEMINI_API_KEY_PAYFUL``). ``gemini_ai_studio`` is a rollback-only path
    that builds the original ``GeminiVeoTransport`` (Gemini AI Studio's paid
    ``generativelanguage.googleapis.com`` API), reading
    ``GEMINI_API_KEY_PAYFUL`` — the only place this module still reads that
    variable. ``workers/startup_checks.py``'s ``validate_worker_startup``
    already confirmed the credential set matching this same provider choice
    exists before ``main`` ever calls this function.
    """
    provider = env.get(VEO_PROVIDER_VAR, "").strip().lower() or VEO_PROVIDER_VERTEX
    if provider == VEO_PROVIDER_GEMINI_AI_STUDIO:
        return GeminiVeoTransport(env[GEMINI_API_KEY_PAYFUL_VAR])
    return build_vertex_veo_transport(env)


def _default_job_paths(job_id: str) -> tuple[Path, Path, Path]:
    """Convention-based job layout: ``{JOBS_ROOT}/{job_id}/{input.pdf,manifest.json}``.

    ``JOBS_ROOT`` defaults to ``{repo_root}/var/brochure-video-jobs``, never
    ``software_factory/.env``'s working directory. State snapshots live in a
    sibling ``state`` directory so a job's own input files are never mixed
    with the runner's atomic state/lock files.
    """
    jobs_root = Path(os.environ.get("BROCHURE_VIDEO_JOBS_ROOT", str(ROOT / "var" / "brochure-video-jobs")))
    job_dir = jobs_root / job_id
    return job_dir / "input.pdf", job_dir / "manifest.json", jobs_root / "state"


def main(argv: Sequence[str] | None = None) -> int:
    """CLI entry point invoked by ``moana-brochure-video@.service`` with the job id as ``%i``.

    Loads the real worker environment and configuration, builds the
    production Supabase Storage and Gemini Veo collaborators, and actually
    runs ``run_brochure_video_job`` end to end — this is the only path that
    invokes the pipeline outside of tests.
    """
    args = list(argv) if argv is not None else sys.argv[1:]
    if len(args) != 1 or not args[0].strip():
        print("usage: python3 -m workers.brochure_video_runner <job_id>", file=sys.stderr)
        return 2
    job_id = args[0]
    try:
        _validate_job_id(job_id)
        load_worker_environment()
        validate_worker_startup()
        ensure_supabase_configured()
    except BrochureVideoRunnerError as exc:
        print(f"invalid job id: {exc}", file=sys.stderr)
        return 2
    except Exception as exc:  # noqa: BLE001 - startup validation failure, no secret in str(exc)
        print(f"startup validation failed: {exc}", file=sys.stderr)
        return 1

    supabase_url = os.environ[SUPABASE_URL_VAR]
    supabase_key = os.environ[SUPABASE_SERVICE_ROLE_KEY_VAR]
    flash_api_key = os.environ[GEMINI_FREE_TIER_API_KEY_VAR]
    editorial_director = make_gemini_brochure_director(
        GeminiFlashBrochureDirectorTransport(flash_api_key),
        # Un seul appel qui embarque le PDF entier + toutes les images extraites
        # en multimodal : le défaut de 30s (calibré pour la classification
        # image-par-image) expire systématiquement avant que Gemini ait fini de
        # générer le plan éditorial complet.
        settings=ClassificationSettings(max_retries=0, timeout_s=180.0),
    )

    pdf_path, manifest_marker_path, state_dir = _default_job_paths(job_id)
    envelope = run_brochure_video_job(
        job_id=job_id,
        pdf_path=pdf_path,
        manifest_marker_path=manifest_marker_path,
        upload_ref=f"uploads/{job_id}/input.pdf",
        state_store=AtomicJobStateStore(state_dir),
        veo_transport=select_veo_transport(os.environ),
        veo_checkpoint=SupabaseVeoStorageCheckpoint(supabase_url, supabase_key),
        clip_source=SupabaseClipSource(supabase_url, supabase_key),
        publish_checkpoint=SupabaseStoragePublishCheckpoint(supabase_url, supabase_key),
        editorial_director=editorial_director,
    )
    if envelope.status == JobStatus.DONE.value:
        print(f"job {job_id!r}: done, result={envelope.result}")
        return 0
    print(f"job {job_id!r}: failed, reason={envelope.error.message if envelope.error else 'unknown'}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
