"""Unit tests for ``workers/vertex_veo_transport.py``.

No network access, no ``google.genai`` import at collection time: only the
duration validation and config-parsing helpers are exercised, exactly like
``workers/vertex_veo_transport.py`` itself never imports ``google.genai``
until a transport method actually runs. The ``generate_clip`` response
parsing tests below need a real ``types.Image``/``types.GenerateVideosConfig``
to construct, so that section is skipped (not failed) when ``google-genai``
isn't installed, via ``pytest.importorskip`` — mirroring this project's
existing pattern for genuinely optional dependencies (see the 7 pre-existing
skips in the full backend suite).
"""

from __future__ import annotations

import pytest

from workers.vertex_veo_transport import (
    DEFAULT_DURATION_S,
    DEFAULT_RESOLUTION,
    DEFAULT_VEO_MODEL,
    GCP_PROJECT_ID_VAR,
    VEO_DEFAULT_DURATION_SECONDS_VAR,
    VertexVeoConfigurationError,
    VertexVeoTransport,
    build_vertex_veo_transport,
    validate_duration_s,
)


@pytest.mark.parametrize("duration", [4, 6, 8])
def test_validate_duration_s_accepts_allowed_values(duration: int) -> None:
    assert validate_duration_s(duration) == duration


@pytest.mark.parametrize("duration", [0, 1, 2, 3, 5, 7, 9, 10, 60])
def test_validate_duration_s_rejects_unsupported_values(duration: int) -> None:
    with pytest.raises(VertexVeoConfigurationError) as excinfo:
        validate_duration_s(duration)
    assert str(duration) in str(excinfo.value)


def test_build_vertex_veo_transport_requires_gcp_project_id() -> None:
    with pytest.raises(VertexVeoConfigurationError) as excinfo:
        build_vertex_veo_transport({})
    assert GCP_PROJECT_ID_VAR in str(excinfo.value)


def test_build_vertex_veo_transport_defaults_duration_when_unset() -> None:
    transport = build_vertex_veo_transport({GCP_PROJECT_ID_VAR: "p"})
    assert transport._duration_s == DEFAULT_DURATION_S


def test_build_vertex_veo_transport_defaults_to_veo_3_1_lite() -> None:
    transport = build_vertex_veo_transport({GCP_PROJECT_ID_VAR: "p"})
    assert transport._model == DEFAULT_VEO_MODEL == "veo-3.1-lite-generate-001"
    assert transport._resolution == DEFAULT_RESOLUTION == "1080p"


def test_build_vertex_veo_transport_rejects_invalid_duration_env_value() -> None:
    with pytest.raises(VertexVeoConfigurationError):
        build_vertex_veo_transport({GCP_PROJECT_ID_VAR: "p", VEO_DEFAULT_DURATION_SECONDS_VAR: "5"})


def test_build_vertex_veo_transport_rejects_non_integer_duration_env_value() -> None:
    with pytest.raises(VertexVeoConfigurationError):
        build_vertex_veo_transport({GCP_PROJECT_ID_VAR: "p", VEO_DEFAULT_DURATION_SECONDS_VAR: "six"})


def test_build_vertex_veo_transport_accepts_explicit_valid_duration() -> None:
    transport = build_vertex_veo_transport({GCP_PROJECT_ID_VAR: "p", VEO_DEFAULT_DURATION_SECONDS_VAR: "8"})
    assert transport._duration_s == 8


# --- generate_clip response parsing: no operation.error, but no usable video ---

genai = pytest.importorskip("google.genai")


class _FakeOperations:
    def get(self, operation):  # pragma: no cover - polling is never reached in these tests
        return operation


class _FakeModels:
    def __init__(self, operation) -> None:
        self._operation = operation
        self.calls: list[dict] = []

    def generate_videos(self, **kwargs):
        self.calls.append(kwargs)
        return self._operation


class _FakeClient:
    def __init__(self, operation) -> None:
        self.models = _FakeModels(operation)
        self.operations = _FakeOperations()


def _entry():
    from workers.pdf_image_extractor import ManifestEntry

    return ManifestEntry(
        image_id="test",
        page_index=0,
        occurrence_index=0,
        section="test",
        content_digest="test",
        byte_length=3,
        image_data=b"jpg",
        mime_type="image/jpeg",
    )


def _transport_with_operation(operation) -> VertexVeoTransport:
    transport = VertexVeoTransport(project_id="p")
    transport._client = _FakeClient(operation)
    return transport


def test_generate_clip_surfaces_rai_filter_reason_when_no_videos_generated() -> None:
    import types as pytypes

    operation = pytypes.SimpleNamespace(
        done=True,
        error=None,
        result=pytypes.SimpleNamespace(
            generated_videos=[],
            rai_media_filtered_count=1,
            rai_media_filtered_reasons=["Person generation blocked"],
        ),
    )
    transport = _transport_with_operation(operation)
    with pytest.raises(RuntimeError) as excinfo:
        transport.generate_clip("prompt", _entry(), timeout=30.0)
    assert "rai_media_filtered_count=1" in str(excinfo.value)
    assert "Person generation blocked" in str(excinfo.value)


def test_generate_clip_surfaces_gcs_uri_when_no_inline_bytes() -> None:
    import types as pytypes

    operation = pytypes.SimpleNamespace(
        done=True,
        error=None,
        result=pytypes.SimpleNamespace(
            generated_videos=[
                pytypes.SimpleNamespace(video=pytypes.SimpleNamespace(video_bytes=None, uri="gs://bucket/clip.mp4"))
            ],
        ),
    )
    transport = _transport_with_operation(operation)
    with pytest.raises(RuntimeError) as excinfo:
        transport.generate_clip("prompt", _entry(), timeout=30.0)
    assert "gs://bucket/clip.mp4" in str(excinfo.value)


def test_generate_clip_returns_inline_video_bytes_on_success() -> None:
    import types as pytypes

    operation = pytypes.SimpleNamespace(
        done=True,
        error=None,
        result=pytypes.SimpleNamespace(
            generated_videos=[pytypes.SimpleNamespace(video=pytypes.SimpleNamespace(video_bytes=b"clip-bytes"))],
        ),
    )
    transport = _transport_with_operation(operation)
    assert transport.generate_clip("prompt", _entry(), timeout=30.0) == b"clip-bytes"


def test_generate_clip_requests_1080p_and_no_audio() -> None:
    import types as pytypes

    operation = pytypes.SimpleNamespace(
        done=True,
        error=None,
        result=pytypes.SimpleNamespace(
            generated_videos=[pytypes.SimpleNamespace(video=pytypes.SimpleNamespace(video_bytes=b"clip-bytes"))],
        ),
    )
    transport = _transport_with_operation(operation)
    transport.generate_clip("prompt", _entry(), timeout=30.0)

    (call,) = transport._client.models.calls
    assert call["model"] == "veo-3.1-lite-generate-001"
    assert call["config"].resolution == "1080p"
    assert call["config"].generate_audio is False
