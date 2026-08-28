"""Unit tests for ``workers/vertex_veo_transport.py``.

No network access, no ``google.genai`` import at collection time: only the
duration validation and config-parsing helpers are exercised, exactly like
``workers/vertex_veo_transport.py`` itself never imports ``google.genai``
until a transport method actually runs.
"""

from __future__ import annotations

import pytest

from workers.vertex_veo_transport import (
    DEFAULT_DURATION_S,
    GCP_PROJECT_ID_VAR,
    VEO_DEFAULT_DURATION_SECONDS_VAR,
    VertexVeoConfigurationError,
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


def test_build_vertex_veo_transport_rejects_invalid_duration_env_value() -> None:
    with pytest.raises(VertexVeoConfigurationError):
        build_vertex_veo_transport({GCP_PROJECT_ID_VAR: "p", VEO_DEFAULT_DURATION_SECONDS_VAR: "5"})


def test_build_vertex_veo_transport_rejects_non_integer_duration_env_value() -> None:
    with pytest.raises(VertexVeoConfigurationError):
        build_vertex_veo_transport({GCP_PROJECT_ID_VAR: "p", VEO_DEFAULT_DURATION_SECONDS_VAR: "six"})


def test_build_vertex_veo_transport_accepts_explicit_valid_duration() -> None:
    transport = build_vertex_veo_transport({GCP_PROJECT_ID_VAR: "p", VEO_DEFAULT_DURATION_SECONDS_VAR: "8"})
    assert transport._duration_s == 8
