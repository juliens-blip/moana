"""Injectable Veo clip generation with deterministic, idempotent per-section checkpointing.

Consumes the ``PdfImageManifest`` produced by ``workers/pdf_image_extractor.py``
(same document-derived ``image_id``, same stable order) and generates exactly
one five-second clip per manifest entry. The Veo/Gemini transport and the
Storage checkpoint are both injection points (``VeoTransport``,
``StorageCheckpoint``): this module never imports a concrete SDK or performs
network I/O itself, mirroring the transport-injection pattern already used by
``workers/yatco_aggregation.py``.

Idempotent resume: the checkpoint manifest is read before any transport call,
and only sections missing from it (or whose source content changed) are
regenerated. Each successful clip is persisted immediately, so a crash or a
definitive failure mid-run never loses already-completed work, and a rerun
never re-contacts the transport for a section it already has.

GEMINI_API_KEY validation and its absence-from-logs invariant are enforced by
``workers/startup_checks.py``; this module only holds that same boundary by
never logging a header, a signed URL or any transport secret.
"""

from __future__ import annotations

import hashlib
import logging
import random
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Protocol

from workers.pdf_image_extractor import ManifestEntry, PdfImageManifest

LOGGER = logging.getLogger("moana.veo_generator")

# Veo 3.1 accepts discrete integer durations; six seconds is supported by the
# lite preview model and leaves enough room for a visible image animation.
CLIP_DURATION_S = 6.0
VEO_PROMPT_VERSION = "dynamic-editorial-v2"

_FIDELITY_PROMPT_SUFFIX = (
    " Depict strictly and only what is present in the source image: never invent, "
    "add, embellish, or exaggerate any detail, object, feature, or motion that is "
    "not directly shown."
)

_PREMIUM_VISUAL_DIRECTION = (
    " Create premium luxury-yacht brokerage footage with photorealistic detail, "
    "refined natural color grading, balanced exposure, clean highlights, realistic "
    "materials, stable gimbal-like camera motion, and strong temporal consistency. "
    "Give every shot a purposeful editorial progression and visible cinematic energy "
    "rather than passive drift: establish the space, execute one confident camera "
    "move, then finish on a strong reveal or detail that motivates the next cut. "
    "Use controlled acceleration and easing while keeping the result elegant, never "
    "frantic. Avoid flicker, warping, morphing, artificial sharpening, and cheap "
    "slideshow or Ken Burns aesthetics."
)

_BROKERAGE_LOGO_DIRECTION = (
    " If the brochure supplies or visibly contains the yacht brokerage agency logo, "
    "preserve its exact design and spelling as a persistent, static, very light "
    "semi-transparent watermark for the entire clip, around 8-12 percent opacity, "
    "placed in a background-safe corner or quiet negative-space area. It must never "
    "obscure the yacht or interior. Never redesign, crop into, zoom toward, animate, "
    "enlarge, or turn the logo into a full-screen image or the main subject. If no "
    "brokerage logo is actually available in the source material, do not invent one."
)

_INTERIOR_ROOM_TOUR_DIRECTION = (
    " If the source depicts a yacht interior, make the six-second shot feel like an "
    "active, premium room tour with three clear beats: begin with a wide spatial "
    "establishing view, move decisively through the room with a forward dolly or "
    "curved lateral track and strong natural parallax, then reveal a meaningful "
    "feature, sightline, doorway, or adjacent space. Let the camera arc around real "
    "furniture and use visible doorways to create momentum toward the next room, but "
    "only when that route is genuinely visible. End with directional motion that can "
    "cut naturally into the next interior section. Do not use passive hovering, a "
    "simple zoom-in, zoom-out, or static pan, and never invent an unseen room or an "
    "impossible camera path."
)

_EDITORIAL_TEXT_DIRECTION = (
    " Use brochure text selectively as polished editorial graphics, never as generic "
    "decoration. On opening or identity imagery, when the yacht name is clearly "
    "legible in the source, introduce that exact yacht name during the first moments "
    "as a refined cinematic title, then fade it cleanly. Across later sections, when "
    "useful facts such as builder, model, year, length, performance, accommodation, "
    "or location are clearly visible in the source, present only those exact facts one "
    "at a time as restrained, well-spaced lower-thirds or section cards. Keep overlays "
    "brief, crisp, correctly spelled, and integrated with the composition. Never "
    "invent a yacht name, specification, claim, price, or unreadable decorative text; "
    "when exact wording is not confidently readable, show no text."
)


class VeoTransientError(RuntimeError):
    """Raised by a ``VeoTransport`` for a retryable failure (rate limit, network)."""


@dataclass(frozen=True)
class DeadLetter:
    """Terminal failure record; ``image_id`` is the section still missing a clip."""

    image_id: str
    reason: str


class VeoGenerationFailure(RuntimeError):
    """Definitive failure: transient retries exhausted or a non-retryable error.

    ``partial_result`` carries every clip already checkpointed before this
    failure, so a caller can report progress without re-deriving it.
    """

    def __init__(self, dead_letter: DeadLetter) -> None:
        super().__init__(dead_letter.reason)
        self.dead_letter = dead_letter
        self.partial_result: VeoGenerationResult | None = None


@dataclass(frozen=True)
class ClipCheckpoint:
    """One persisted clip: deterministic object key, exact duration, source digest."""

    image_id: str
    object_key: str
    duration_s: float
    content_digest: str


@dataclass(frozen=True)
class VeoGenerationResult:
    document_digest: str
    clips: tuple[ClipCheckpoint, ...]


class VeoTransport(Protocol):
    """Injectable Veo/Gemini transport — no concrete SDK is imported here.

    Implementations raise ``VeoTransientError`` for retryable failures (rate
    limit, network); any other exception (including a timeout) is treated as
    definitive. ``timeout`` bounds this single attempt.
    """

    def generate_clip(self, prompt: str, entry: ManifestEntry, timeout: float) -> bytes: ...


class StorageCheckpoint(Protocol):
    """Injectable Storage checkpoint — no concrete client is imported here."""

    def load_manifest(self, document_digest: str) -> tuple[ClipCheckpoint, ...]: ...

    def persist_clip(self, document_digest: str, checkpoint: ClipCheckpoint, clip_bytes: bytes) -> None: ...


@dataclass(frozen=True)
class VeoSettings:
    timeout_s: float = 60.0
    max_retries: int = 1
    backoff_base_s: float = 10.0
    backoff_cap_s: float = 60.0


def build_section_prompt(entry: ManifestEntry) -> str:
    """Deterministic prompt for one section: same entry always yields same text."""
    return (
        f"Generate a strictly {CLIP_DURATION_S:.1f}-second video clip faithfully "
        f"depicting section '{entry.section}' exactly as shown in the source image "
        f"(content digest {entry.content_digest[:12]})."
        + _PREMIUM_VISUAL_DIRECTION
        + _BROKERAGE_LOGO_DIRECTION
        + _INTERIOR_ROOM_TOUR_DIRECTION
        + _EDITORIAL_TEXT_DIRECTION
        + _FIDELITY_PROMPT_SUFFIX
    )


def _object_key(document_digest: str, image_id: str) -> str:
    return f"veo-clips/{document_digest[:16]}/{VEO_PROMPT_VERSION}/{image_id}.mp4"


def build_clip_content_digest(entry: ManifestEntry) -> str:
    """Bind a checkpoint to both source pixels and the creative prompt version."""
    return hashlib.sha256(
        f"{VEO_PROMPT_VERSION}\0{entry.content_digest}".encode("utf-8")
    ).hexdigest()


def _generate_with_retry(
    transport: VeoTransport,
    prompt: str,
    entry: ManifestEntry,
    settings: VeoSettings,
    sleep: Callable[[float], None],
    rand: Callable[[], float],
) -> bytes:
    attempt = 0
    while True:
        try:
            return transport.generate_clip(prompt, entry, settings.timeout_s)
        except VeoTransientError as exc:
            if attempt >= settings.max_retries:
                raise VeoGenerationFailure(
                    DeadLetter(image_id=entry.image_id, reason=f"transient_exhausted:{exc.__class__.__name__}")
                ) from exc
        except Exception as exc:
            raise VeoGenerationFailure(
                DeadLetter(image_id=entry.image_id, reason=f"definitive:{exc.__class__.__name__}")
            ) from exc

        attempt += 1
        sleep_s = min(settings.backoff_cap_s, settings.backoff_base_s * (2 ** (attempt - 1)))
        sleep_s += rand() * sleep_s * 0.1
        LOGGER.warning(
            "veo generation retry %s/%s for section %s in %.1fs",
            attempt,
            settings.max_retries,
            entry.image_id,
            sleep_s,
        )
        sleep(sleep_s)


def generate_section_clips(
    manifest: PdfImageManifest,
    transport: VeoTransport,
    checkpoint: StorageCheckpoint,
    settings: VeoSettings | None = None,
    sleep: Callable[[float], None] = time.sleep,
    rand: Callable[[], float] = random.random,
) -> VeoGenerationResult:
    """Generate one five-second clip per manifest entry, resuming idempotently.

    Reads ``checkpoint.load_manifest`` first, before any transport call. A
    manifest entry whose ``image_id`` already has a checkpoint with a matching
    ``content_digest`` is reused as-is and never regenerated. Every newly
    generated clip is persisted immediately via ``checkpoint.persist_clip``,
    so a definitive failure partway through still leaves prior clips
    checkpointed; the raised ``VeoGenerationFailure.partial_result`` reflects
    exactly that already-persisted progress.
    """
    settings = settings or VeoSettings()
    existing = {entry.image_id: entry for entry in checkpoint.load_manifest(manifest.document_digest)}

    clips: list[ClipCheckpoint] = []
    for entry in manifest.entries:
        expected_content_digest = build_clip_content_digest(entry)
        cached = existing.get(entry.image_id)
        if cached is not None and cached.content_digest == expected_content_digest:
            clips.append(cached)
            continue

        prompt = build_section_prompt(entry)
        try:
            clip_bytes = _generate_with_retry(transport, prompt, entry, settings, sleep, rand)
        except VeoGenerationFailure as exc:
            exc.partial_result = VeoGenerationResult(document_digest=manifest.document_digest, clips=tuple(clips))
            raise

        new_checkpoint = ClipCheckpoint(
            image_id=entry.image_id,
            object_key=_object_key(manifest.document_digest, entry.image_id),
            duration_s=CLIP_DURATION_S,
            content_digest=expected_content_digest,
        )
        checkpoint.persist_clip(manifest.document_digest, new_checkpoint, clip_bytes)
        clips.append(new_checkpoint)

    return VeoGenerationResult(document_digest=manifest.document_digest, clips=tuple(clips))
