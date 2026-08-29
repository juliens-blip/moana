"""Production ``VeoTransport`` backed by Vertex AI Veo (``google-genai``, ``vertexai=True``).

Replaces ``workers/brochure_video_runner.py``'s ``GeminiVeoTransport`` (Gemini
AI Studio's paid ``generativelanguage.googleapis.com`` API, authenticated
with ``GEMINI_API_KEY_PAYFUL``) as the default Veo video-generation backend.
``GeminiVeoTransport`` is kept in place, untouched, as a rollback — selected
via ``VEO_PROVIDER=gemini_ai_studio`` (see
``workers/brochure_video_runner.py``'s ``select_veo_transport``).

This module never imports ``GEMINI_API_KEY_PAYFUL`` or talks to
``generativelanguage.googleapis.com``: authentication is Application
Default Credentials, or ``GOOGLE_APPLICATION_CREDENTIALS`` pointing at a
service-account JSON file kept outside the repository (never committed,
never logged). ``google.genai`` is imported lazily, only inside the methods
that actually need it, so constructing a ``VertexVeoTransport`` — or even
importing this module — never requires the dependency to be installed or
network access to be available; the same pattern used by every other
transport in this codebase (``GeminiVeoTransport``,
``GeminiFlashBrochureDirectorTransport``) for their concrete SDK imports.

Implements the exact same ``VeoTransport`` protocol as
``workers/veo_generator.py`` — ``generate_clip(prompt, entry, timeout) ->
bytes`` — so ``workers/brochure_video_runner.py``'s ``run_brochure_video_job``
and every downstream collaborator (checkpoint, ``video_assembler.py``,
Supabase Storage) work unmodified regardless of which transport is wired in.
"""

from __future__ import annotations

import time
from collections.abc import Callable, Mapping

from workers.pdf_image_extractor import ManifestEntry
from workers.veo_generator import VeoTransientError

# Veo 3.1 Lite: Google's lowest-cost Veo 3.1 tier on Vertex AI, chosen for
# high-volume brochure-video generation over the "fast"/full tiers.
DEFAULT_VEO_MODEL = "veo-3.1-lite-generate-001"
DEFAULT_LOCATION = "us-central1"
DEFAULT_ASPECT_RATIO = "16:9"
DEFAULT_DURATION_S = 6
DEFAULT_RESOLUTION = "1080p"

# Only these three durations are accepted by Veo's text/image-to-video
# endpoint; any other value is a definitive configuration error, not a
# transport failure — caught and rejected before any network call.
ALLOWED_DURATIONS_S: tuple[int, ...] = (4, 6, 8)

# Google's own guidance for polling a generate_videos long-running
# operation: check every 10-15 seconds, never tighter.
DEFAULT_POLL_INTERVAL_S = 12.0

GCP_PROJECT_ID_VAR = "GCP_PROJECT_ID"
GCP_LOCATION_VAR = "GCP_LOCATION"
VEO_MODEL_VAR = "VEO_MODEL"
VEO_DEFAULT_DURATION_SECONDS_VAR = "VEO_DEFAULT_DURATION_SECONDS"


class VertexVeoConfigurationError(RuntimeError):
    """Raised for invalid Vertex Veo configuration (e.g. an unsupported clip duration)."""


def validate_duration_s(value: int) -> int:
    """Reject any duration outside Veo's accepted set ``{4, 6, 8}`` seconds."""
    if value not in ALLOWED_DURATIONS_S:
        raise VertexVeoConfigurationError(
            f"unsupported Veo clip duration {value}s: must be one of {ALLOWED_DURATIONS_S}"
        )
    return value


def _parse_duration_s(env: Mapping[str, str]) -> int:
    raw = env.get(VEO_DEFAULT_DURATION_SECONDS_VAR, "").strip()
    if not raw:
        return DEFAULT_DURATION_S
    try:
        value = int(raw)
    except ValueError as exc:
        raise VertexVeoConfigurationError(
            f"{VEO_DEFAULT_DURATION_SECONDS_VAR} must be an integer, got {raw!r}"
        ) from exc
    return validate_duration_s(value)


def _is_transient_vertex_error(exc: BaseException) -> bool:
    """Rate limit (429) or server-side (5xx) failures are retryable; anything
    else (auth, invalid argument, quota exhausted permanently, ...) is not."""
    from google.genai import errors as genai_errors

    if isinstance(exc, genai_errors.APIError):
        code = getattr(exc, "code", None)
        return code == 429 or (isinstance(code, int) and 500 <= code < 600)
    return isinstance(exc, (TimeoutError, ConnectionError, OSError))


class VertexVeoTransport:
    """Production ``VeoTransport``: Vertex AI Veo long-running video generation.

    One clip per call, image-to-video from ``entry.image_data``. Polls the
    ``generate_videos`` operation every ``poll_interval_s`` (default 12s,
    within Google's recommended 10-15s window) until ``operation.done``,
    bounded by ``timeout`` (the same per-attempt budget every other
    transport in this codebase receives from its caller). Returns the
    generated clip's raw MP4 bytes — never writes a file itself, mirroring
    ``GeminiVeoTransport.generate_clip``'s contract exactly.
    """

    def __init__(
        self,
        project_id: str,
        location: str = DEFAULT_LOCATION,
        model: str = DEFAULT_VEO_MODEL,
        duration_s: int = DEFAULT_DURATION_S,
        aspect_ratio: str = DEFAULT_ASPECT_RATIO,
        resolution: str = DEFAULT_RESOLUTION,
        poll_interval_s: float = DEFAULT_POLL_INTERVAL_S,
        sleep: Callable[[float], None] = time.sleep,
    ) -> None:
        self._project_id = project_id
        self._location = location
        self._model = model
        self._duration_s = validate_duration_s(duration_s)
        self._aspect_ratio = aspect_ratio
        self._resolution = resolution
        self._poll_interval_s = poll_interval_s
        self._sleep = sleep
        self._client = None

    def _get_client(self):
        if self._client is None:
            from google import genai  # optional dependency: imported lazily, only here

            self._client = genai.Client(
                vertexai=True,
                project=self._project_id,
                location=self._location,
            )
        return self._client

    def generate_clip(self, prompt: str, entry: ManifestEntry, timeout: float) -> bytes:
        if not entry.image_data:
            raise RuntimeError("vertex veo source image is missing")

        from google.genai import types  # noqa: I001 - optional dependency, imported lazily

        client = self._get_client()
        try:
            operation = client.models.generate_videos(
                model=self._model,
                prompt=prompt,
                image=types.Image(image_bytes=entry.image_data, mime_type=entry.mime_type),
                config=types.GenerateVideosConfig(
                    aspect_ratio=self._aspect_ratio,
                    duration_seconds=self._duration_s,
                    resolution=self._resolution,
                    generate_audio=False,
                    person_generation="allow_adult",
                ),
            )
        except Exception as exc:
            if _is_transient_vertex_error(exc):
                raise VeoTransientError(f"vertex veo request failed: {exc.__class__.__name__}: {exc}") from exc
            raise RuntimeError(f"vertex veo request failed: {exc.__class__.__name__}: {exc}") from exc

        deadline = time.monotonic() + timeout
        while not operation.done:
            if time.monotonic() >= deadline:
                raise RuntimeError(f"vertex veo generation timed out for {entry.image_id}")
            self._sleep(self._poll_interval_s)
            try:
                operation = client.operations.get(operation)
            except Exception as exc:
                if _is_transient_vertex_error(exc):
                    raise VeoTransientError(f"vertex veo poll failed: {exc.__class__.__name__}: {exc}") from exc
                raise RuntimeError(f"vertex veo poll failed: {exc.__class__.__name__}: {exc}") from exc

        if operation.error:
            raise RuntimeError(f"vertex veo generation failed: {operation.error}")

        result = operation.result
        generated_videos = getattr(result, "generated_videos", None) if result is not None else None
        if not generated_videos:
            # An empty result with no ``operation.error`` is Vertex's shape for
            # Responsible AI content filtering: the request succeeded but no
            # video was produced. Surfacing the filter count/reasons (when the
            # SDK response carries them) is the only way to diagnose this from
            # the job log instead of a bare "missing video bytes".
            filtered_count = getattr(result, "rai_media_filtered_count", None)
            filtered_reasons = getattr(result, "rai_media_filtered_reasons", None)
            raise RuntimeError(
                "vertex veo operation returned no generated videos "
                f"(rai_media_filtered_count={filtered_count}, rai_media_filtered_reasons={filtered_reasons})"
            )

        video = getattr(generated_videos[0], "video", None)
        video_bytes = getattr(video, "video_bytes", None) if video is not None else None
        if not video_bytes:
            # Some Veo configurations (an explicit output GCS URI) return the
            # clip as a Cloud Storage reference instead of inline bytes. This
            # transport only ever requests inline bytes (no output_gcs_uri is
            # set above), so a bare ``uri`` here means Vertex changed shape
            # underneath us, not that the request failed — worth surfacing,
            # not worth guessing a download implementation for.
            uri = getattr(video, "uri", None) if video is not None else None
            raise RuntimeError(f"vertex veo operation returned no inline video bytes (uri={uri!r})")
        return video_bytes


def build_vertex_veo_transport(env: Mapping[str, str]) -> VertexVeoTransport:
    """Construct the production ``VertexVeoTransport`` from ``GCP_PROJECT_ID``,
    ``GCP_LOCATION`` (default ``us-central1``), ``VEO_MODEL`` (default
    ``veo-3.1-lite-generate-001``), and ``VEO_DEFAULT_DURATION_SECONDS``
    (default 6, must be 4/6/8). Does not itself check
    ``GOOGLE_APPLICATION_CREDENTIALS`` — that is
    ``workers/startup_checks.py``'s job, run once before any collaborator is
    built. Raises ``VertexVeoConfigurationError`` for an invalid duration.
    """
    project_id = env.get(GCP_PROJECT_ID_VAR, "").strip()
    if not project_id:
        raise VertexVeoConfigurationError(f"Missing configuration: {GCP_PROJECT_ID_VAR}")
    location = env.get(GCP_LOCATION_VAR, "").strip() or DEFAULT_LOCATION
    model = env.get(VEO_MODEL_VAR, "").strip() or DEFAULT_VEO_MODEL
    duration_s = _parse_duration_s(env)
    return VertexVeoTransport(
        project_id=project_id,
        location=location,
        model=model,
        duration_s=duration_s,
    )
