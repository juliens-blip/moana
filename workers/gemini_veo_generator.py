"""Injectable Gemini/Veo clip generation with an atomic per-section checkpoint.

Consumes the ``PdfImageManifest`` produced by ``workers/pdf_image_extractor.py``
and generates exactly one silent MP4 clip per *section* (``manifest.groups``,
falling back to grouping ``manifest.entries`` on the fly for callers that
built a manifest without groups) — not one clip per image — strictly in
section order. Every clip carries the same imposed prompt text and a duration
dynamically bounded between ``MIN_CLIP_DURATION_S`` and ``MAX_CLIP_DURATION_S``
by that section's image count (``compute_section_duration_s``). The Veo/Gemini
transport and the Storage checkpoint are both injection points (``VeoTransport``,
``StorageCheckpoint``): this module never imports a concrete SDK or performs
network I/O itself, mirroring the transport-injection pattern already used by
``workers/yatco_aggregation.py``.

Idempotent, race-free resume: ``StorageCheckpoint.acquire_and_confirm`` combines
the existence check and the write into a single conditional operation keyed by
``(document_digest, section)`` — never a separate read followed by an
unguarded write. Two concurrent callers for the same section can only produce
one confirmed effect; the loser reuses the winner's checkpoint without ever
calling the transport. The confirmed ``content_digest`` is a combined digest of
every member image's own digest (``_combined_content_digest``), order-preserving,
so a change to any image in the section — not just a change in image count —
is detected and regenerates that section only.

``ClipCheckpoint`` keeps its ``image_id`` field name for compatibility with
``workers/video_assembler.py``, which downloads and orders clips by it; the
value it now holds is the section's own key, not a single image's id.

GEMINI_API_KEY_PAYFUL — never GEMINI_API_KEY, the free-tier variable used by
``workers/gemini_pdf_classifier.py`` — is the only credential this module
ever reads; ``ensure_gemini_configured`` confirms its presence and format the
same way ``workers/startup_checks.py``'s ``secret_probe_report`` does for
GEMINI_API_KEY, and never logs the value itself. Every generated clip is also
checked for an audio track (``mp4_has_audio_track``) before its checkpoint is
confirmed: a Veo response that isn't silent is a definitive, dead-lettered
failure, never retried.
"""

from __future__ import annotations

import hashlib
import logging
import os
import random
import re
import time
from collections.abc import Callable, Iterable, Mapping
from dataclasses import dataclass
from threading import Lock
from typing import Protocol, TypeVar

from workers.pdf_image_extractor import (
    ManifestEntry,
    PdfImageManifest,
    SectionGroup,
    group_entries_by_section,
)
from workers.startup_checks import (
    GEMINI_API_KEY_PAYFUL_VAR,
    SecretProbeResult,
    WorkerConfigurationError,
)

LOGGER = logging.getLogger("moana.gemini_veo_generator")

MIN_CLIP_DURATION_S = 5.0
MAX_CLIP_DURATION_S = 8.0
_MIN_IMAGES_FOR_MIN_DURATION = 4
_MAX_IMAGES_FOR_MAX_DURATION = 12

# Kept for ``workers/video_assembler.py``, written before per-section dynamic
# duration existed; it still equals the lower bound of that dynamic range.
CLIP_DURATION_S = MIN_CLIP_DURATION_S

SECTION_PROMPT_CORE = (
    "Create premium luxury-yacht brokerage footage from the supplied source images "
    "with photorealistic detail, refined natural color grading, balanced exposure, "
    "realistic materials, stable gimbal-like motion, smooth temporal consistency, and "
    "no flicker, warping, morphing, distorted text, or cheap slideshow aesthetics. "
    "Depict only what is genuinely visible; never invent or exaggerate yacht features. "
    "If a yacht brokerage agency logo or brand mark is present, keep it only as a "
    "small, static, subtle, semi-transparent watermark in a safe corner; never zoom "
    "toward it, animate it, enlarge it, show it full-screen, or make it the subject. "
    "For yacht interiors, create an immersive room-tour feeling with slow forward "
    "dolly movement, gentle lateral tracking, and natural parallax that reveal real "
    "depth and circulation. Flow toward a doorway or adjacent room only when actually "
    "visible, to support smooth room-to-room transitions. Do not use only zoom-in, "
    "zoom-out, static pan, or Ken Burns motion, and never invent unseen rooms."
)

# Google's cheapest currently available paid Veo model tier; "veo-3.0-generate-001"
# is the pricier standard tier for the same duration bound. A concrete
# VeoTransport should call this model rather than hand-picking one.
DEFAULT_VEO_MODEL = "veo-3.1-lite-generate-preview"

_MIN_GEMINI_KEY_LENGTH = 20  # mirrors workers/startup_checks.py's format rule

T = TypeVar("T")


def compute_section_duration_s(image_count: int) -> float:
    """Deterministic clip duration bounded in ``[MIN_CLIP_DURATION_S, MAX_CLIP_DURATION_S]``.

    4 images or fewer -> exactly ``MIN_CLIP_DURATION_S``; 12 images or more ->
    exactly ``MAX_CLIP_DURATION_S``; counts in between are linearly interpolated,
    so the same image count always yields the same duration and no value can
    ever fall outside the bound.
    """
    if image_count <= _MIN_IMAGES_FOR_MIN_DURATION:
        return MIN_CLIP_DURATION_S
    if image_count >= _MAX_IMAGES_FOR_MAX_DURATION:
        return MAX_CLIP_DURATION_S
    span = _MAX_IMAGES_FOR_MAX_DURATION - _MIN_IMAGES_FOR_MIN_DURATION
    ratio = (image_count - _MIN_IMAGES_FOR_MIN_DURATION) / span
    return MIN_CLIP_DURATION_S + ratio * (MAX_CLIP_DURATION_S - MIN_CLIP_DURATION_S)


def build_section_prompt() -> str:
    """The single imposed prompt every section's clip is generated with.

    Exactly ``SECTION_PROMPT_CORE`` — nothing appended, no per-section label,
    no audio/music/embellishment directive: the plan imposes this literal
    string as the entire prompt field sent to Veo. Silence and source
    fidelity are enforced elsewhere — no audio/music parameter exists on
    ``VeoTransport.generate_clip`` to send, and ``mp4_has_audio_track``
    rejects any response that has an audio track anyway — not by stuffing
    extra instructions into this text.
    """
    return SECTION_PROMPT_CORE


def _combined_content_digest(entries: tuple[ManifestEntry, ...]) -> str:
    """Order-preserving digest over every member image's own digest.

    Changing any image in the section (content, addition, removal, reorder)
    changes this digest, which is what lets ``acquire_and_confirm`` tell a
    genuine idempotent resume apart from stale, now-invalid content.
    """
    hasher = hashlib.sha256()
    for entry in entries:
        hasher.update(entry.content_digest.encode("utf-8"))
        hasher.update(b"\x00")
    return hasher.hexdigest()


def _slugify_section(section: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", section.strip().lower()).strip("-")
    return slug or "section"


def _classify_payful_key(raw: str | None) -> tuple[str, int | None]:
    if raw is None or not raw.strip():
        return "absent", None
    value = raw.strip()
    if len(value) < _MIN_GEMINI_KEY_LENGTH or any(char.isspace() for char in value):
        return "malformed", len(value)
    return "present", len(value)


def ensure_gemini_configured(env: Mapping[str, str] | None = None) -> SecretProbeResult:
    """Confirm GEMINI_API_KEY_PAYFUL presence/format before any Gemini/Veo call.

    GEMINI_API_KEY_PAYFUL is the only credential this module ever reads —
    never GEMINI_API_KEY, the free-tier variable. Applies the same
    presence/format rule as ``workers/startup_checks.py``'s
    ``secret_probe_report`` and never returns or logs the value itself, only
    a safe diagnostic snapshot. Raises ``WorkerConfigurationError`` if absent
    or malformed.
    """
    active_env = env if env is not None else os.environ
    state, length = _classify_payful_key(active_env.get(GEMINI_API_KEY_PAYFUL_VAR))
    report = SecretProbeResult(
        variable=GEMINI_API_KEY_PAYFUL_VAR,
        state=state,
        expected_source="moana/.env.local, moana/.env (not software_factory/.env)",
        length=length,
    )
    if report.state != "present":
        raise WorkerConfigurationError(f"{GEMINI_API_KEY_PAYFUL_VAR} is {report.state}")
    return report


class VeoTransientError(RuntimeError):
    """Raised by a ``VeoTransport`` for a retryable failure (rate limit, network)."""


@dataclass(frozen=True)
class DeadLetter:
    """Terminal failure record; ``image_id`` holds the section still missing a clip."""

    image_id: str
    reason: str


class VeoGenerationFailure(RuntimeError):
    """Definitive failure: transient retries exhausted or a non-retryable error.

    ``partial_result`` carries every clip already confirmed before this
    failure, so a caller can report progress without re-deriving it.
    """

    def __init__(self, dead_letter: DeadLetter) -> None:
        super().__init__(dead_letter.reason)
        self.dead_letter = dead_letter
        self.partial_result: VeoGenerationResult | None = None


@dataclass(frozen=True)
class ClipCheckpoint:
    """One confirmed per-section clip: deterministic object key, dynamic
    duration, combined source digest. ``image_id`` holds the section's own
    key (kept under this name for ``workers/video_assembler.py``
    compatibility); ``image_count`` is the number of images that fed this
    clip's duration and defaults to 1 for callers built before it existed."""

    image_id: str
    object_key: str
    duration_s: float
    content_digest: str
    image_count: int = 1


@dataclass(frozen=True)
class VeoGenerationResult:
    document_digest: str
    clips: tuple[ClipCheckpoint, ...]


class VeoTransport(Protocol):
    """Injectable Veo/Gemini transport — no concrete SDK is imported here.

    Implementations raise ``VeoTransientError`` for retryable failures (rate
    limit, network); any other exception (including a timeout) is treated as
    definitive. ``timeout`` bounds this single attempt. ``entries`` is every
    image in the section, in order — a section's clip is generated from all
    of them at once, not one call per image. ``duration_s`` is this section's
    own dynamically computed duration (``compute_section_duration_s``).
    ``model`` is always ``VeoSettings.model`` (``DEFAULT_VEO_MODEL`` unless a
    caller overrides it) — the cheapest available paid Veo tier — and no
    audio/music/embellishment field or parameter is ever part of this call.
    """

    def generate_clip(
        self,
        prompt: str,
        entries: tuple[ManifestEntry, ...],
        duration_s: float,
        model: str,
        timeout: float,
    ) -> bytes: ...


class StorageCheckpoint(Protocol):
    """Injectable Storage checkpoint — no concrete client is imported here.

    ``acquire_and_confirm`` MUST be a single conditional acquire/write keyed by
    ``(document_digest, image_id)``: if a confirmed checkpoint already exists
    for that key with a matching ``content_digest``, it is returned as-is and
    ``produce`` is never invoked. Otherwise exactly one caller — even under
    concurrent invocation for the same key — runs ``produce`` and persists its
    result; every other concurrent caller converges on that same confirmed
    checkpoint. Implementations must never split this into a read followed by
    a separate, unguarded write.
    """

    def load_confirmed(self, document_digest: str) -> tuple[ClipCheckpoint, ...]: ...

    def acquire_and_confirm(
        self,
        document_digest: str,
        image_id: str,
        content_digest: str,
        produce: Callable[[], tuple[ClipCheckpoint, bytes]],
    ) -> ClipCheckpoint: ...

    def record_dead_letter(self, document_digest: str, image_id: str, reason: str) -> DeadLetter:
        """Atomically persist a terminal failure, deduplicated by ``(document_digest, image_id)``.

        Must be the same kind of single conditional operation as
        ``acquire_and_confirm`` — never a separate read followed by an
        unguarded write — so a section that fails more than once (e.g. a
        retried run after an earlier definitive failure) is only ever
        recorded once.
        """
        ...


class InMemoryStorageCheckpoint:
    """Reference ``StorageCheckpoint``: a per-key lock makes acquire/write atomic.

    Mirrors the semantics of a real ``INSERT ... ON CONFLICT DO NOTHING
    RETURNING``: the existence check and the write happen while holding a
    single lock scoped to ``(document_digest, image_id)``, so two concurrent
    callers for the same section can never both invoke ``produce`` nor both
    persist a checkpoint.
    """

    def __init__(self, existing: Mapping[str, Iterable[ClipCheckpoint]] | None = None) -> None:
        self._confirmed: dict[tuple[str, str], ClipCheckpoint] = {}
        self._bytes: dict[tuple[str, str], bytes] = {}
        self._locks: dict[tuple[str, str], Lock] = {}
        self._locks_guard = Lock()
        self._dead_letters: dict[tuple[str, str], DeadLetter] = {}
        self.produce_calls: list[str] = []
        if existing:
            for document_digest, checkpoints in existing.items():
                for checkpoint in checkpoints:
                    self._confirmed[(document_digest, checkpoint.image_id)] = checkpoint

    def load_confirmed(self, document_digest: str) -> tuple[ClipCheckpoint, ...]:
        return tuple(
            checkpoint for (doc_digest, _image_id), checkpoint in self._confirmed.items() if doc_digest == document_digest
        )

    def _lock_for(self, key: tuple[str, str]) -> Lock:
        with self._locks_guard:
            lock = self._locks.get(key)
            if lock is None:
                lock = Lock()
                self._locks[key] = lock
            return lock

    def acquire_and_confirm(
        self,
        document_digest: str,
        image_id: str,
        content_digest: str,
        produce: Callable[[], tuple[ClipCheckpoint, bytes]],
    ) -> ClipCheckpoint:
        key = (document_digest, image_id)
        with self._lock_for(key):
            existing = self._confirmed.get(key)
            if existing is not None and existing.content_digest == content_digest:
                return existing
            self.produce_calls.append(image_id)
            checkpoint, clip_bytes = produce()
            self._confirmed[key] = checkpoint
            self._bytes[key] = clip_bytes
            return checkpoint

    def record_dead_letter(self, document_digest: str, image_id: str, reason: str) -> DeadLetter:
        key = (document_digest, image_id)
        with self._lock_for(key):
            existing = self._dead_letters.get(key)
            if existing is not None:
                return existing
            dead_letter = DeadLetter(image_id=image_id, reason=reason)
            self._dead_letters[key] = dead_letter
            return dead_letter

    def dead_letters_for(self, document_digest: str) -> tuple[DeadLetter, ...]:
        return tuple(
            dead_letter for (doc_digest, _image_id), dead_letter in self._dead_letters.items() if doc_digest == document_digest
        )


@dataclass(frozen=True)
class VeoSettings:
    timeout_s: float = 60.0
    max_retries: int = 3
    backoff_base_s: float = 1.0
    backoff_cap_s: float = 20.0
    jitter_ratio: float = 0.1
    model: str = DEFAULT_VEO_MODEL


def _object_key(document_digest: str, section: str) -> str:
    return f"veo-clips/{document_digest[:16]}/{_slugify_section(section)}.mp4"


def _classify_failure_reason(exc: BaseException) -> str:
    if isinstance(exc, VeoTransientError):
        return f"transient_exhausted:{exc.__class__.__name__}"
    return f"definitive:{exc.__class__.__name__}"


class VeoAudioTrackDetectedError(RuntimeError):
    """Definitive: a Veo response declared an audio track; never retried.

    ``_classify_failure_reason`` treats this like any other non-transient
    error (``definitive:VeoAudioTrackDetectedError``), so it is dead-lettered
    the same way as a quota or validation failure. It is deliberately raised
    outside ``run_with_retry``: a Veo response that isn't silent isn't a
    retryable network hiccup, and retrying it would just spend another call
    for the same non-conforming result.
    """


class VeoInvalidClipContainerError(RuntimeError):
    """Definitive: a Veo response is not a well-formed MP4 container; never retried.

    ``mp4_has_audio_track`` deliberately treats malformed/non-MP4 bytes as
    "no audio track found" so it never raises on a partial fixture — but
    that must never be read as "therefore a valid silent MP4". This check is
    the strict counterpart: it is what actually rejects arbitrary or
    truncated bytes before ``mp4_has_audio_track`` is even consulted, so a
    non-conforming Veo response can't slip through as a confirmed clip just
    because it happens to declare no audio track.
    """


def _iter_mp4_boxes(data: bytes, start: int, end: int):
    """Yield ``(box_type, payload_start, payload_end)`` for top-level MP4 boxes in ``data[start:end]``.

    Stops silently on the first malformed or truncated box rather than
    raising: this parser exists only to detect an audio track, never to
    fully decode a clip, and a synthetic or partial byte stream should read
    as having no more boxes, not crash the caller.
    """
    pos = start
    while pos + 8 <= end:
        size = int.from_bytes(data[pos : pos + 4], "big")
        box_type = data[pos + 4 : pos + 8]
        header_len = 8
        if size == 1:
            if pos + 16 > end:
                break
            size = int.from_bytes(data[pos + 8 : pos + 16], "big")
            header_len = 16
        elif size == 0:
            size = end - pos
        if size < header_len or pos + size > end:
            break
        yield box_type, pos + header_len, pos + size
        pos += size


_KNOWN_TOP_LEVEL_MP4_BOX_TYPES = frozenset(
    {
        b"ftyp",
        b"moov",
        b"mdat",
        b"free",
        b"skip",
        b"wide",
        b"pnot",
        b"mfra",
        b"meta",
        b"moof",
        b"styp",
        b"sidx",
        b"ssix",
        b"prft",
        b"uuid",
    }
)


def _is_well_formed_mp4_container(data: bytes) -> bool:
    """True only if ``data`` is a minimally valid MP4/ISO-base-media container.

    Box framing alone (sizes, nesting) is not sufficient: an arbitrary,
    unrecognized box type of an otherwise valid size — e.g. a 12-byte blob
    that merely parses as one top-level box — must still be rejected, or any
    garbage sized to look like a box would pass as a "container". So, on top
    of ``_iter_mp4_boxes``'s framing (but never stopping silently here: any
    truncated box, a size overrunning the buffer, or trailing bytes left over
    after the last box fails the check, and empty bytes fail too), every
    top-level box type must be one of the standard ISO/IEC 14496-12 box
    types, and a ``moov`` box — the mandatory movie-metadata box every
    non-fragmented MP4 file has — must be present among them. This is the
    check that actually rejects a non-MP4 or garbled Veo response — not the
    absence of a ``soun`` handler, which only means "no audio track found in
    an otherwise valid container" — before it can ever reach the checkpoint
    as a confirmed clip.
    """
    if not data:
        return False
    pos = 0
    end = len(data)
    box_types: list[bytes] = []
    while pos < end:
        if pos + 8 > end:
            return False
        size = int.from_bytes(data[pos : pos + 4], "big")
        box_type = data[pos + 4 : pos + 8]
        header_len = 8
        if size == 1:
            if pos + 16 > end:
                return False
            size = int.from_bytes(data[pos + 8 : pos + 16], "big")
            header_len = 16
        elif size == 0:
            size = end - pos
        if size < header_len or pos + size > end:
            return False
        if box_type not in _KNOWN_TOP_LEVEL_MP4_BOX_TYPES:
            return False
        box_types.append(box_type)
        pos += size
    return bool(box_types) and pos == end and b"moov" in box_types


def mp4_has_audio_track(data: bytes) -> bool:
    """True only if a well-formed moov/trak/mdia/hdlr chain declares a 'soun' handler.

    Walks exactly that chain — the only reliable place an MP4 declares a
    track's kind — so it works regardless of ftyp/mdat ordering and never
    inspects raw sample data. Malformed, truncated or non-MP4 bytes are
    treated as silent (returns ``False``): a Veo transport fake used in
    tests never returns a spec-complete container, and a genuinely
    non-conforming Veo response still surfaces through the caller's own
    dead-letter path, not through this parser raising.
    """
    for moov_type, moov_start, moov_end in _iter_mp4_boxes(data, 0, len(data)):
        if moov_type != b"moov":
            continue
        for trak_type, trak_start, trak_end in _iter_mp4_boxes(data, moov_start, moov_end):
            if trak_type != b"trak":
                continue
            for mdia_type, mdia_start, mdia_end in _iter_mp4_boxes(data, trak_start, trak_end):
                if mdia_type != b"mdia":
                    continue
                for hdlr_type, hdlr_start, hdlr_end in _iter_mp4_boxes(data, mdia_start, mdia_end):
                    if hdlr_type != b"hdlr" or hdlr_end - hdlr_start < 12:
                        continue
                    handler_type = data[hdlr_start + 8 : hdlr_start + 12]
                    if handler_type == b"soun":
                        return True
    return False


def run_with_retry(
    operation: Callable[[], T],
    *,
    is_transient: Callable[[BaseException], bool],
    max_retries: int,
    backoff_base_s: float,
    backoff_cap_s: float,
    sleep: Callable[[float], None] = time.sleep,
    rand: Callable[[], float] = random.random,
    jitter_ratio: float = 0.1,
    on_retry: Callable[[int, float], None] | None = None,
) -> T:
    """Run ``operation`` with bounded exponential backoff and post-cap jitter.

    Only exceptions satisfying ``is_transient`` are retried, up to
    ``max_retries`` additional attempts; any other exception (including a
    ``TimeoutError``) propagates immediately as definitive, with zero retries.

    The exponential delay is capped at ``backoff_cap_s`` first; jitter is
    added to that capped value; the jittered result is capped again at
    ``backoff_cap_s``. Jitter can therefore only pull the final wait toward
    the cap, never push it past that bound — the prior incident this guards
    against added jitter after capping without a final re-cap, letting the
    delay exceed ``backoff_cap_s``.
    """
    attempt = 0
    while True:
        try:
            return operation()
        except BaseException as exc:
            if not is_transient(exc) or attempt >= max_retries:
                raise
        attempt += 1
        capped = min(backoff_cap_s, backoff_base_s * (2 ** (attempt - 1)))
        jittered = capped + rand() * capped * jitter_ratio
        delay = min(jittered, backoff_cap_s)
        if on_retry is not None:
            on_retry(attempt, delay)
        sleep(delay)


def generate_clips_for_sections(
    manifest: PdfImageManifest,
    transport: VeoTransport,
    checkpoint: StorageCheckpoint,
    settings: VeoSettings | None = None,
    sleep: Callable[[float], None] = time.sleep,
    rand: Callable[[], float] = random.random,
    env: Mapping[str, str] | None = None,
) -> VeoGenerationResult:
    """Generate one silent clip per section (``manifest.groups``), strictly in
    section order — never one clip per image.

    ``ensure_gemini_configured`` runs first, before any transport call: a
    missing or malformed GEMINI_API_KEY blocks the whole run without ever
    reaching Gemini/Veo, and without logging the key's value.

    ``manifest.groups`` is used when present; a manifest built without groups
    (e.g. constructed by hand in a test) is grouped on the fly via
    ``group_entries_by_section``, so both call shapes behave identically. Every
    clip is generated with the single imposed ``build_section_prompt()`` text
    and a duration from ``compute_section_duration_s(len(group.entries))``.
    Every section is resolved through ``checkpoint.acquire_and_confirm``,
    keyed by ``(document_digest, section)`` with the section's combined image
    digest (``_combined_content_digest``): a section already confirmed with a
    matching digest is reused without calling ``transport``; otherwise the
    transport call (wrapped in ``run_with_retry``) runs exactly once per key,
    even under concurrent invocation for the same section, because the
    checkpoint's acquire/write is atomic. A definitive failure is first
    persisted via ``checkpoint.record_dead_letter`` (deduplicated by
    ``document_digest``/section), then raised as ``VeoGenerationFailure`` whose
    ``partial_result`` reflects every section already confirmed so far. A
    successful transport response is additionally validated as a well-formed
    MP4 container (``_is_well_formed_mp4_container``, raising
    ``VeoInvalidClipContainerError`` otherwise) and checked for an audio
    track (``mp4_has_audio_track``, raising ``VeoAudioTrackDetectedError``)
    before its checkpoint is confirmed — both handled exactly like any other
    definitive failure: dead-lettered, never retried.
    """
    ensure_gemini_configured(env)
    settings = settings or VeoSettings()
    groups = manifest.groups or group_entries_by_section(manifest.entries)
    clips: list[ClipCheckpoint] = []
    prompt = build_section_prompt()

    for group in groups:
        entries = group.entries
        duration_s = compute_section_duration_s(len(entries))
        content_digest = _combined_content_digest(entries)

        def produce(
            group: SectionGroup = group,
            duration_s: float = duration_s,
            content_digest: str = content_digest,
        ) -> tuple[ClipCheckpoint, bytes]:
            clip_bytes = run_with_retry(
                lambda: transport.generate_clip(
                    prompt, group.entries, duration_s, settings.model, settings.timeout_s
                ),
                is_transient=lambda exc: isinstance(exc, VeoTransientError),
                max_retries=settings.max_retries,
                backoff_base_s=settings.backoff_base_s,
                backoff_cap_s=settings.backoff_cap_s,
                sleep=sleep,
                rand=rand,
                jitter_ratio=settings.jitter_ratio,
                on_retry=lambda attempt, delay: LOGGER.warning(
                    "veo generation retry %s/%s for section %s in %.3fs",
                    attempt,
                    settings.max_retries,
                    group.section,
                    delay,
                ),
            )
            if not _is_well_formed_mp4_container(clip_bytes):
                raise VeoInvalidClipContainerError(
                    f"veo returned a non-MP4 response for section {group.section!r}"
                )
            if mp4_has_audio_track(clip_bytes):
                raise VeoAudioTrackDetectedError(
                    f"veo returned a clip with an audio track for section {group.section!r}"
                )
            new_checkpoint = ClipCheckpoint(
                image_id=group.section,
                object_key=_object_key(manifest.document_digest, group.section),
                duration_s=duration_s,
                content_digest=content_digest,
                image_count=len(group.entries),
            )
            return new_checkpoint, clip_bytes

        try:
            confirmed = checkpoint.acquire_and_confirm(manifest.document_digest, group.section, content_digest, produce)
        except BaseException as exc:
            dead_letter = checkpoint.record_dead_letter(
                manifest.document_digest, group.section, _classify_failure_reason(exc)
            )
            failure = VeoGenerationFailure(dead_letter)
            failure.partial_result = VeoGenerationResult(document_digest=manifest.document_digest, clips=tuple(clips))
            raise failure from exc

        clips.append(confirmed)

    return VeoGenerationResult(document_digest=manifest.document_digest, clips=tuple(clips))
