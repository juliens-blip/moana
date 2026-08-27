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
import json
import logging
import random
import time
import urllib.error
import urllib.request
from collections.abc import Callable
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
