"""Injectable Veo clip generation with deterministic, idempotent per-section checkpointing.

Consumes the ``PdfImageManifest`` produced by ``workers/pdf_image_extractor.py``
(same document-derived ``image_id``, same stable order) and generates exactly
one six-second clip per manifest entry. The Veo/Gemini transport and the
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
import json
import logging
import random
import time
from collections.abc import Callable
from dataclasses import dataclass
from typing import Protocol, TypeVar

from workers.pdf_image_extractor import ManifestEntry, PdfImageManifest

LOGGER = logging.getLogger("moana.veo_generator")
T = TypeVar("T")

# Veo 3.1 accepts discrete integer durations; six seconds is supported by the
# lite preview model and leaves enough room for a visible image animation.
CLIP_DURATION_S = 6.0
VEO_PROMPT_VERSION = "sequenced-editorial-v3"


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


@dataclass(frozen=True)
class VeoPromptContext:
    """Brochure-wide, Gemini-verified text made available to every clip prompt."""

    yacht_name: str | None = None
    verified_facts: tuple[str, ...] = ()


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
    # 240s: a Vertex AI Veo generate_videos operation is a long-running poll
    # (Google recommends checking every 10-15s) that has taken several
    # minutes for a real clip in manual testing — 60s dated from before this
    # transport ever reached a real generation in production and was never
    # measured against actual latency. A larger budget is harmless for
    # GeminiVeoTransport too (it only ever waits less).
    timeout_s: float = 240.0
    max_retries: int = 1
    backoff_base_s: float = 10.0
    backoff_cap_s: float = 60.0


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
    """Run an operation with bounded exponential backoff and capped jitter."""
    attempt = 0
    while True:
        try:
            return operation()
        except BaseException as exc:
            if not is_transient(exc) or attempt >= max_retries:
                raise
        attempt += 1
        capped = min(backoff_cap_s, backoff_base_s * (2 ** (attempt - 1)))
        delay = min(capped + rand() * capped * jitter_ratio, backoff_cap_s)
        if on_retry is not None:
            on_retry(attempt, delay)
        sleep(delay)


def _quoted(value: str) -> str:
    """Clearly delimit brochure-derived prompt data as a JSON string."""
    return json.dumps(value, ensure_ascii=False)


def build_section_prompt(
    entry: ManifestEntry,
    sequence_index: int = 1,
    total_sequences: int = 1,
    context: VeoPromptContext | None = None,
    video_style: str = "classique",
) -> str:
    """Build one deterministic six-second prompt within a larger brochure video."""
    if total_sequences < 1:
        raise ValueError("total_sequences must be positive")
    if sequence_index < 1 or sequence_index > total_sequences:
        raise ValueError("sequence_index must be between 1 and total_sequences")

    context = context or VeoPromptContext()
    if len(context.verified_facts) > 3:
        raise ValueError("verified_facts must contain at most three items")
    yacht_clause = (
        f" for the motor yacht {_quoted(context.yacht_name)}" if context.yacht_name else ""
    )
    assembly_clause = (
        "will later be assembled with the other sequence clips into one complete brochure video"
        if total_sequences > 1
        else "is the complete six-second brochure video"
    )
    ending_direction = (
        "Create a purposeful ending movement or visual reveal that can cut naturally into "
        "the following shot. Do not depict, anticipate, or invent spaces that are not visible "
        "in the supplied source image."
        if sequence_index < total_sequences
        else "Finish on a strong, composed concluding view appropriate to the final sequence. "
        "Do not imply, depict, or invent a subsequent space that is not visible in the supplied "
        "source image."
    )
    if context.verified_facts:
        verified_facts = "\n".join(f"- {_quoted(fact)}" for fact in context.verified_facts)
        facts_block = f"Verified brochure facts:\n{verified_facts}"
    else:
        facts_block = "No verified facts available; display no factual overlay."

    if video_style == "focus_interieurs":
        focus_interieurs_block = (
            "\n\nFOCUS INTERIEURS EDIT\n\n"
            "This clip belongs to a \"focus interieurs\" edit: a brief exterior establishing block "
            "followed by a longer, detailed interior tour. If the source depicts an interior, film it "
            "unhurried and intimate — take the full six seconds to reveal craftsmanship, materials, "
            "layout and real detail rather than a quick establishing pass. If the source depicts an "
            "exterior, deck or flybridge, keep the coverage brief and wide — a single clean "
            "establishing movement, since this edit dedicates most of its runtime to interiors, not "
            "exteriors."
        )
    else:
        focus_interieurs_block = ""

    if sequence_index == 1 and context.yacht_name:
        overlay_direction = (
            f"For this opening sequence, introduce the exact yacht name "
            f"{_quoted(context.yacht_name)} as a refined cinematic title during the first "
            "moments, then fade it cleanly. Do not display a factual lower-third in the "
            "same clip."
        )
    elif context.verified_facts:
        overlay_direction = (
            "For this subsequent sequence, display at most one contextually relevant "
            "verified fact as a restrained, well-spaced lower-third or section card. "
            "Only display a fact when it is relevant to the section currently shown."
        )
    else:
        overlay_direction = "Display no title, factual lower-third, or section card."

    return f"""Generate one individual, strictly {CLIP_DURATION_S:.1f}-second sequence clip for a larger luxury-yacht brokerage video.

HARD PRIORITIES (follow in this order)

1. Photorealism and physical plausibility.
2. Exact fidelity to the supplied source image.
3. Clear, elegant coverage of the visible boat and its real details.
4. Correct, minimal brochure typography only when it can be rendered perfectly.
5. Cinematic camera movement.

This is a source-to-video reconstruction, not an imaginative yacht commercial. The supplied image is
the sole visual authority. Never replace it with a generic luxury-yacht shot, stock footage, a new
design, or a more attractive interpretation. Every visible frame must remain recognizably the same
yacht, space, layout, materials and environment as the source.

This clip represents sequence {sequence_index} of {total_sequences}{yacht_clause} and {assembly_clause}.

Faithfully depict section {_quoted(entry.section)} exactly as shown in the supplied source image.

SEQUENCE CONTINUITY

Give this shot an editorial role appropriate to its position in the sequence: establish the yacht and its surroundings near the beginning, progressively reveal exterior decks, amenities, living areas and accommodations through the middle, or provide an elegant concluding impression near the end.

{ending_direction}

Within the fixed six-second duration, adapt the visual rhythm to the source content. Richly detailed spaces may receive a more progressive camera movement, while simpler images should remain concise and elegant without passive drifting or unnecessary repetition.

VISUAL STYLE

Create premium luxury-yacht brokerage footage with photorealistic detail, refined natural color grading, balanced exposure and clean highlights, realistic materials and reflections, stable gimbal-like camera motion, strong spatial and temporal consistency, controlled acceleration, and natural easing.

Use exactly one motivated camera move over the six seconds: begin with a stable readable composition,
move through the visible space with realistic parallax, and end on a composed detail or sightline that
is already present. Use physically plausible lens perspective, scale, reflections, shadows and water.
Keep the yacht as the unmistakable subject; do not spend the shot on sky, sea, empty walls or abstract
close-ups. Never use a static zoom, passive pan, slideshow, or Ken Burns effect.

INTERIOR DIRECTION

If the source depicts a yacht interior, create an active premium room tour using only spatial information genuinely visible in the image. Begin by establishing the space, then use a forward dolly or curved lateral track with strong natural parallax around visible furniture. Finish by revealing a real feature, sightline, doorway, window, or adjacent space only when it is genuinely visible.

Never invent an unseen room, hidden feature, doorway, furniture element, or impossible camera path.

EXTERIOR AND AMENITY DIRECTION

If the source depicts an exterior, deck, upper-deck amenity, tender, water toy, or surrounding environment, choose one purposeful cinematic movement appropriate to what is actually visible. This may include a controlled lateral track, gentle orbit, forward reveal, elevated establishing movement, or progressive detail shot.

Preserve the yacht's exact geometry, proportions, hull lines, materials, surroundings, equipment, and identifying features.
{focus_interieurs_block}
LOGO WATERMARK

If the brokerage agency logo is clearly and unambiguously visible in the supplied source material, preserve its exact design, proportions, colors, and spelling as a persistent, static, very light semi-transparent watermark for the entire clip at approximately 8-12 percent opacity.

Place it in a background-safe corner or quiet negative-space area. Never obscure the yacht, interior, people, or important details. Never redesign, animate, enlarge, distort, crop, rewrite, or turn the logo into the main subject. If no genuine brokerage agency logo is available, do not invent or display one.

TYPOGRAPHY AND VERIFIED OVERLAYS

Use only the following text extracted and verified from the brochure:

{f"Yacht name: {_quoted(context.yacht_name)}" if context.yacht_name else "No yacht name was verified. Do not display a yacht title."}
{facts_block}

{overlay_direction}

TEXT RENDERING RULES (strict)

Render zero or one text element at a time, never a paragraph or a collage of labels. The only allowed
strings are the yacht name and the exact verified facts listed immediately above. Do not copy other
brochure text from the image, because it may be unreadable or be part of the artwork. Prefer no text
over a spelling, digit, accent, unit, logo, or layout error. Keep text away from the yacht's key lines
and do not let typography cover a face, window, helm, furniture, hull marking, or safety equipment.

Reproduce every supplied word, number, unit, capitalization, punctuation mark, and spelling exactly. Never shorten, rewrite, complete, normalize, translate, estimate, round, or invent any text.

Never generate prices, contact details, phone numbers, email addresses, URLs, slogans, specifications, claims, or decorative pseudo-text unless they are explicitly included in the verified values above.

Keep all typography crisp, minimal, correctly spelled, safely positioned, and visually integrated with the composition. If a verified value cannot be rendered confidently and legibly, show no text instead.

FIDELITY AND RESTRICTIONS

Except for the explicitly supplied and verified typography and logo instructions above, depict strictly and only what is present in the supplied source image.

Never invent, add, remove, embellish, extrapolate, or exaggerate any detail, object, feature, space, person, weather condition, movement, equipment, capability, or yacht specification that is not directly supported by the source material. Do not open a door into an unseen room, add people, crew, cushions, glassware, wake, waves, or moving water unless they are visible in the source. Preserve proportions and architectural geometry frame by frame.

Avoid passive hovering, static pans, simple zoom-ins or zoom-outs, Ken Burns effects, cheap slideshow aesthetics, flicker, exposure pumping, warping, morphing, unstable geometry, duplicated or disappearing objects, artificial sharpening, unrealistic reflections, unreadable or invented text, and impossible camera movements."""


def _object_key(document_digest: str, image_id: str, video_style: str = "classique") -> str:
    # A non-classique style segment keeps its clips in a separate Storage
    # namespace: the same image_id gets genuinely different clip content
    # (different prompt) per style, and the classique path must stay byte-for
    # -byte unchanged so existing checkpoints/clips are never invalidated.
    style_segment = "" if video_style == "classique" else f"{video_style}/"
    return f"veo-clips/{document_digest[:16]}/{VEO_PROMPT_VERSION}/{style_segment}{image_id}.mp4"


def build_clip_content_digest(entry: ManifestEntry, prompt: str | None = None) -> str:
    """Bind a checkpoint to source pixels and the exact creative prompt."""
    active_prompt = prompt if prompt is not None else build_section_prompt(entry)
    return hashlib.sha256(
        f"{VEO_PROMPT_VERSION}\0{entry.content_digest}\0{active_prompt}".encode()
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
    prompt_context: VeoPromptContext | None = None,
    settings: VeoSettings | None = None,
    sleep: Callable[[float], None] = time.sleep,
    rand: Callable[[], float] = random.random,
    video_style: str = "classique",
) -> VeoGenerationResult:
    """Generate one six-second clip per manifest entry, resuming idempotently.

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
    total_sequences = len(manifest.entries)
    for sequence_index, entry in enumerate(manifest.entries, start=1):
        prompt = build_section_prompt(entry, sequence_index, total_sequences, prompt_context, video_style)
        expected_content_digest = build_clip_content_digest(entry, prompt)
        cached = existing.get(entry.image_id)
        if cached is not None and cached.content_digest == expected_content_digest:
            clips.append(cached)
            continue

        try:
            clip_bytes = _generate_with_retry(transport, prompt, entry, settings, sleep, rand)
        except VeoGenerationFailure as exc:
            exc.partial_result = VeoGenerationResult(document_digest=manifest.document_digest, clips=tuple(clips))
            raise

        new_checkpoint = ClipCheckpoint(
            image_id=entry.image_id,
            object_key=_object_key(manifest.document_digest, entry.image_id, video_style),
            duration_s=CLIP_DURATION_S,
            content_digest=expected_content_digest,
        )
        checkpoint.persist_clip(manifest.document_digest, new_checkpoint, clip_bytes)
        clips.append(new_checkpoint)

    return VeoGenerationResult(document_digest=manifest.document_digest, clips=tuple(clips))
