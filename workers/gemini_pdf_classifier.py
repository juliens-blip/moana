"""Injectable Gemini Flash PDF-image classifier: one call per image, one section label out.

Consumes one ``workers/pdf_image_extractor.py`` ``ExtractedImage`` at a time
and returns exactly one section label, so it plugs directly into
``build_manifest``'s ``strategy`` injection point (``ClassifierStrategy``).
Every image is sent for classification exactly once: retries only replay the
same single image against a transient failure, they never duplicate a
successful call. ``SUGGESTED_SECTION_CATEGORIES`` is offered to the model as
a preference, never a hardcoded taxonomy — a relevant free-form label is
accepted just as readily, but a response is rejected outright if it is not
strict JSON carrying exactly one non-empty ``section`` string.

No concrete SDK is imported; ``GeminiClassifierTransport`` is the sole
injection point, mirroring ``workers/gemini_veo_generator.py``'s
``VeoTransport``. The production transport sends the API key only as the
``x-goog-api-key`` header and never logs it, matching
``workers/brochure_video_runner.py``'s ``GeminiVeoTransport``.
"""

from __future__ import annotations

import base64
import hashlib
import json
import logging
import random
import time
import urllib.error
import urllib.request
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from typing import Protocol

from workers.gemini_veo_generator import run_with_retry
from workers.pdf_image_extractor import ExtractedImage, PdfExtractionError

LOGGER = logging.getLogger("moana.gemini_pdf_classifier")

DEFAULT_MODEL = "gemini-2.5-flash"

# Preferred, non-exhaustive business categories for a yacht brochure image
# (route_team.json constraints). The model is free to return any other
# relevant, non-empty label instead when none of these five clearly fits.
SUGGESTED_SECTION_CATEGORIES = (
    "Hero/Identité",
    "Vie à bord–Extérieurs",
    "Vie à bord–Intérieurs",
    "Performance & Technique",
    "Commercial/Closing",
)


class ClassificationTransientError(RuntimeError):
    """Raised by a ``GeminiClassifierTransport`` for a retryable failure (rate limit, network)."""


class GeminiClassificationError(PdfExtractionError):
    """Raised when the model's response is not strict JSON with exactly one section label."""


class GeminiClassifierTransport(Protocol):
    """Injectable Gemini Flash transport — no concrete SDK is imported here.

    Implementations raise ``ClassificationTransientError`` for retryable
    failures (rate limit, network); any other exception is treated as
    definitive. ``timeout`` bounds this single attempt.
    """

    def classify(self, image: ExtractedImage, prompt: str, timeout: float) -> str: ...


@dataclass(frozen=True)
class ClassificationSettings:
    timeout_s: float = 30.0
    max_retries: int = 3
    backoff_base_s: float = 1.0
    backoff_cap_s: float = 10.0
    jitter_ratio: float = 0.1


MAX_EDITORIAL_FACTS = 3


@dataclass(frozen=True)
class EditorialFact:
    """One short, brochure-backed fact selected for a restrained lower-third."""

    label: str
    value: str

    @property
    def display_text(self) -> str:
        return f"{self.label} — {self.value}"


@dataclass(frozen=True)
class BrochureEditorialPlan:
    """Validated creative decisions made once from the complete brochure."""

    sections: tuple[tuple[str, str], ...] = ()
    logo_image_id: str | None = None
    yacht_name: str | None = None
    facts: tuple[EditorialFact, ...] = ()

    def section_for(self, image_id: str) -> str | None:
        return dict(self.sections).get(image_id)


class GeminiBrochureDirectorTransport(Protocol):
    def direct(
        self,
        pdf_bytes: bytes,
        images: Sequence[ExtractedImage],
        image_ids: Sequence[str],
        prompt: str,
        timeout: float,
    ) -> str: ...


def build_brochure_direction_prompt(image_ids: Sequence[str]) -> str:
    """Ask Gemini for sections, one real broker logo and minimal key facts."""
    candidates = ", ".join(image_ids)
    categories = ", ".join(SUGGESTED_SECTION_CATEGORIES)
    return (
        "Act as the editorial director for a premium yacht brokerage video. Analyze the complete PDF "
        "and every candidate image supplied after it. Return decisions grounded only in the brochure. "
        f"Candidate image_ids are: {candidates}. Classify every image_id exactly once; prefer these "
        f"section labels when appropriate: {categories}. Identify logo_image_id only when the candidate "
        "is the actual BROKERAGE AGENCY logo, not the yacht name, builder, shipyard, model badge, flag, "
        "certification mark, or decorative icon. Return null if no agency logo candidate is certain. "
        "Extract the exact yacht_name only when explicitly present. Select zero to three facts maximum, "
        "ordered by editorial importance and appearance flow. Keep only high-value facts such as builder "
        "or model, year and length, accommodation, or a distinctive verified performance fact. Do not "
        "include phone numbers, emails, URLs, legal text, repeated facts, generic slogans, or invented "
        "claims. Each label must be at most 24 characters and each value at most 48 characters. "
        "Respond as strict JSON with exactly these keys: "
        '{"sections":[{"image_id":"...","section":"..."}],"logo_image_id":null,'
        '"yacht_name":null,"facts":[{"label":"...","value":"..."}]}. '
        "Use JSON null, not an empty string, for absent logo or yacht name."
    )


def _clean_optional_text(value: object, field: str, max_length: int) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str) or not value.strip():
        raise GeminiClassificationError(f"director field {field} must be null or a non-empty string")
    clean = " ".join(value.split())
    if len(clean) > max_length:
        raise GeminiClassificationError(f"director field {field} exceeds {max_length} characters")
    return clean


def parse_brochure_direction_response(raw_response: str, image_ids: Sequence[str]) -> BrochureEditorialPlan:
    try:
        payload = json.loads(raw_response)
    except (json.JSONDecodeError, TypeError) as exc:
        raise GeminiClassificationError(f"director response is not valid JSON: {exc}") from exc
    expected_keys = {"sections", "logo_image_id", "yacht_name", "facts"}
    if not isinstance(payload, dict) or set(payload) != expected_keys:
        raise GeminiClassificationError("director response has an invalid top-level shape")

    allowed_ids = tuple(image_ids)
    raw_sections = payload["sections"]
    if not isinstance(raw_sections, list) or len(raw_sections) != len(allowed_ids):
        raise GeminiClassificationError("director must classify every candidate image exactly once")
    sections: list[tuple[str, str]] = []
    seen: set[str] = set()
    for item in raw_sections:
        if not isinstance(item, dict) or set(item) != {"image_id", "section"}:
            raise GeminiClassificationError("director section entry has an invalid shape")
        image_id = item["image_id"]
        section = item["section"]
        if image_id not in allowed_ids or image_id in seen:
            raise GeminiClassificationError("director returned an unknown or duplicate image_id")
        if not isinstance(section, str) or not section.strip():
            raise GeminiClassificationError("director section must be a non-empty string")
        seen.add(image_id)
        sections.append((image_id, " ".join(section.split())[:80]))
    if seen != set(allowed_ids):
        raise GeminiClassificationError("director omitted a candidate image_id")

    logo_image_id = payload["logo_image_id"]
    if logo_image_id is not None and logo_image_id not in allowed_ids:
        raise GeminiClassificationError("director logo_image_id is not a supplied candidate")
    yacht_name = _clean_optional_text(payload["yacht_name"], "yacht_name", 80)

    raw_facts = payload["facts"]
    if not isinstance(raw_facts, list) or len(raw_facts) > MAX_EDITORIAL_FACTS:
        raise GeminiClassificationError(f"director facts must contain at most {MAX_EDITORIAL_FACTS} items")
    facts: list[EditorialFact] = []
    seen_facts: set[str] = set()
    for item in raw_facts:
        if not isinstance(item, dict) or set(item) != {"label", "value"}:
            raise GeminiClassificationError("director fact entry has an invalid shape")
        label = _clean_optional_text(item["label"], "fact.label", 24)
        value = _clean_optional_text(item["value"], "fact.value", 48)
        if label is None or value is None:
            raise GeminiClassificationError("director fact label and value cannot be null")
        dedupe_key = f"{label.casefold()}\0{value.casefold()}"
        if dedupe_key in seen_facts:
            raise GeminiClassificationError("director returned a duplicate fact")
        seen_facts.add(dedupe_key)
        facts.append(EditorialFact(label=label, value=value))

    return BrochureEditorialPlan(
        sections=tuple(sections),
        logo_image_id=logo_image_id,
        yacht_name=yacht_name,
        facts=tuple(facts),
    )


def build_classification_prompt() -> str:
    """Deterministic prompt: same text every call, so only the image varies."""
    categories = ", ".join(SUGGESTED_SECTION_CATEGORIES)
    return (
        "Classify this yacht brochure image into exactly one section label. "
        f"Prefer one of these categories when it clearly fits: {categories}. "
        "If none of them fits, return a short, relevant free-form label instead "
        "of forcing one of the preferred categories. Depict only what the image "
        "shows: never invent a label unrelated to its content. If the image is "
        "primarily a yacht brokerage agency logo or brand mark, use the exact "
        "free-form label 'Brokerage Logo/Branding'. "
        'Respond with strict JSON of the form {"section": "<label>"} and nothing else.'
    )


def _parse_classification_response(raw_response: str) -> str:
    try:
        payload = json.loads(raw_response)
    except (json.JSONDecodeError, TypeError) as exc:
        raise GeminiClassificationError(f"classifier response is not valid JSON: {exc}") from exc
    if not isinstance(payload, dict) or set(payload.keys()) != {"section"}:
        raise GeminiClassificationError(
            "classifier response must be a JSON object with exactly one 'section' key"
        )
    label = payload["section"]
    if not isinstance(label, str) or not label.strip():
        raise GeminiClassificationError("classifier response 'section' must be a non-empty string")
    return label.strip()


def make_gemini_flash_classifier(
    transport: GeminiClassifierTransport,
    settings: ClassificationSettings | None = None,
    sleep: Callable[[float], None] = time.sleep,
    rand: Callable[[], float] = random.random,
) -> Callable[[ExtractedImage], str]:
    """Build a ``ClassifierStrategy`` (``ExtractedImage -> str``) bound to ``transport``.

    Each call sends its image to ``transport.classify`` exactly once per
    attempt; only a ``ClassificationTransientError`` is retried (bounded
    exponential backoff, capped and jittered, via ``run_with_retry``). An
    invalid response (``GeminiClassificationError``) is never retried — it is
    a definitive rejection of that attempt, not a transient failure to
    recover from. Returns a pure function suitable for
    ``pdf_image_extractor.build_manifest``'s ``strategy`` argument.
    """
    settings = settings or ClassificationSettings()
    prompt = build_classification_prompt()

    def classify(image: ExtractedImage) -> str:
        def attempt() -> str:
            raw_response = transport.classify(image, prompt, settings.timeout_s)
            return _parse_classification_response(raw_response)

        return run_with_retry(
            attempt,
            is_transient=lambda exc: isinstance(exc, ClassificationTransientError),
            max_retries=settings.max_retries,
            backoff_base_s=settings.backoff_base_s,
            backoff_cap_s=settings.backoff_cap_s,
            sleep=sleep,
            rand=rand,
            jitter_ratio=settings.jitter_ratio,
            on_retry=lambda attempt_n, delay: LOGGER.warning(
                "gemini pdf classification retry %s/%s in %.3fs", attempt_n, settings.max_retries, delay
            ),
        )

    return classify


class GeminiFlashClassifierTransport:
    """Production ``GeminiClassifierTransport``: Gemini Flash ``generateContent`` over stdlib ``urllib``.

    Sends the image inline (base64) alongside the prompt to
    ``models/{model}:generateContent`` and returns the first candidate's raw
    text, which the caller (``make_gemini_flash_classifier``) then parses as
    the strict-JSON section label. The API key is read once at construction
    and only ever sent as the ``x-goog-api-key`` header, never logged.
    """

    def __init__(
        self,
        api_key: str,
        model: str = DEFAULT_MODEL,
        base_url: str = "https://generativelanguage.googleapis.com/v1beta",
    ) -> None:
        self._headers = {"x-goog-api-key": api_key, "Content-Type": "application/json"}
        self._model = model
        self._base_url = base_url.rstrip("/")

    def _mime_type(self, image: ExtractedImage) -> str:
        if image.color_space in ("DCTDecode", "JPXDecode"):
            return "image/jpeg"
        return "image/jpeg"

    def classify(self, image: ExtractedImage, prompt: str, timeout: float) -> str:
        body = json.dumps(
            {
                "contents": [
                    {
                        "parts": [
                            {"text": prompt},
                            {
                                "inline_data": {
                                    "mime_type": self._mime_type(image),
                                    "data": base64.b64encode(image.data).decode("ascii"),
                                }
                            },
                        ]
                    }
                ],
                "generationConfig": {"responseMimeType": "application/json"},
            }
        ).encode("utf-8")
        request = urllib.request.Request(
            f"{self._base_url}/models/{self._model}:generateContent",
            data=body,
            headers=self._headers,
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                payload = json.loads(response.read())
        except urllib.error.HTTPError as exc:
            if exc.code == 429 or 500 <= exc.code < 600:
                raise ClassificationTransientError(f"gemini flash classify http_{exc.code}") from exc
            raise RuntimeError(f"gemini flash classify request failed with status {exc.code}") from exc
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            raise ClassificationTransientError(f"gemini flash classify network_error:{exc.__class__.__name__}") from exc

        try:
            candidates = payload["candidates"]
            text = candidates[0]["content"]["parts"][0]["text"]
        except (KeyError, IndexError, TypeError) as exc:
            raise GeminiClassificationError("gemini flash response missing candidate text") from exc
        if not isinstance(text, str):
            raise GeminiClassificationError("gemini flash response candidate text is not a string")
        return text


def _director_image_id(document_digest: str, image: ExtractedImage) -> str:
    return f"{document_digest[:16]}:{image.page_index:04d}:{image.occurrence_index:04d}"


def make_gemini_brochure_director(
    transport: GeminiBrochureDirectorTransport,
    settings: ClassificationSettings | None = None,
) -> Callable[[bytes, Sequence[ExtractedImage]], BrochureEditorialPlan]:
    """Build the one-call-per-brochure editorial director."""
    settings = settings or ClassificationSettings(max_retries=0)

    def direct(pdf_bytes: bytes, images: Sequence[ExtractedImage]) -> BrochureEditorialPlan:
        document_digest = hashlib.sha256(pdf_bytes).hexdigest()
        image_ids = tuple(_director_image_id(document_digest, image) for image in images)
        prompt = build_brochure_direction_prompt(image_ids)

        def attempt() -> BrochureEditorialPlan:
            raw = transport.direct(pdf_bytes, images, image_ids, prompt, settings.timeout_s)
            return parse_brochure_direction_response(raw, image_ids)

        return run_with_retry(
            attempt,
            is_transient=lambda exc: isinstance(exc, ClassificationTransientError),
            max_retries=settings.max_retries,
            backoff_base_s=settings.backoff_base_s,
            backoff_cap_s=settings.backoff_cap_s,
            jitter_ratio=settings.jitter_ratio,
        )

    return direct


class GeminiFlashBrochureDirectorTransport:
    """Send the complete PDF and labelled logo candidates in one Gemini call."""

    def __init__(
        self,
        api_key: str,
        model: str = DEFAULT_MODEL,
        base_url: str = "https://generativelanguage.googleapis.com/v1beta",
    ) -> None:
        self._headers = {"x-goog-api-key": api_key, "Content-Type": "application/json"}
        self._model = model
        self._base_url = base_url.rstrip("/")

    def direct(
        self,
        pdf_bytes: bytes,
        images: Sequence[ExtractedImage],
        image_ids: Sequence[str],
        prompt: str,
        timeout: float,
    ) -> str:
        parts: list[dict] = [
            {"text": prompt},
            {"inline_data": {"mime_type": "application/pdf", "data": base64.b64encode(pdf_bytes).decode("ascii")}},
        ]
        for image_id, image in zip(image_ids, images, strict=True):
            parts.append({"text": f"candidate image_id: {image_id}"})
            parts.append(
                {
                    "inline_data": {
                        "mime_type": "image/jpeg",
                        "data": base64.b64encode(image.data).decode("ascii"),
                    }
                }
            )
        body = json.dumps(
            {
                "contents": [{"parts": parts}],
                "generationConfig": {"responseMimeType": "application/json"},
            }
        ).encode("utf-8")
        request = urllib.request.Request(
            f"{self._base_url}/models/{self._model}:generateContent",
            data=body,
            headers=self._headers,
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                payload = json.loads(response.read())
        except urllib.error.HTTPError as exc:
            if exc.code == 429 or 500 <= exc.code < 600:
                raise ClassificationTransientError(f"gemini brochure director http_{exc.code}") from exc
            raise RuntimeError(f"gemini brochure director request failed with status {exc.code}") from exc
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            raise ClassificationTransientError(
                f"gemini brochure director network_error:{exc.__class__.__name__}"
            ) from exc
        try:
            text = payload["candidates"][0]["content"]["parts"][0]["text"]
        except (KeyError, IndexError, TypeError) as exc:
            raise GeminiClassificationError("gemini director response missing candidate text") from exc
        if not isinstance(text, str):
            raise GeminiClassificationError("gemini director response candidate text is not a string")
        return text
