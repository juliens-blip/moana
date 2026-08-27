"""Job envelope contract for the upload → status → result worker pipeline.

Covers only the observable contract of a job moving through its three
phases (upload, status, result); PDF extraction, Veo generation, ffmpeg
assembly and the Supabase Storage upload are out of scope here and live in
the workers that consume this envelope.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Any


class JobPhase(str, Enum):
    UPLOAD = "upload"
    STATUS = "status"
    RESULT = "result"


class JobStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    DONE = "done"
    ERROR = "error"


_VALID_PHASES = frozenset(phase.value for phase in JobPhase)
_VALID_STATUSES = frozenset(status.value for status in JobStatus)


class JobContractError(ValueError):
    """Raised when a job envelope violates the upload/status/result contract."""


@dataclass(frozen=True)
class JobError:
    """Explicit terminal error data — never a bare bool or free-form string."""

    code: str
    message: str

    def __post_init__(self) -> None:
        if not self.code or not self.code.strip():
            raise JobContractError("JobError.code is required")
        if not self.message or not self.message.strip():
            raise JobContractError("JobError.message is required")


@dataclass(frozen=True)
class UploadStatusResultJob:
    """Envelope for a job moving through the upload, status, and result phases.

    ``phase`` is constrained to exactly one of the three stable identifiers
    (never free text, never more than one at a time), and ``result``/``error``
    are mutually exclusive so a terminal failure can never also carry a
    partial success payload.
    """

    job_id: str
    upload_ref: str
    phase: str
    status: str
    result: dict[str, Any] | None = None
    error: JobError | None = None

    def __post_init__(self) -> None:
        if not self.job_id or not self.job_id.strip():
            raise JobContractError("job_id is required")
        if not self.upload_ref or not self.upload_ref.strip():
            raise JobContractError("upload_ref is required")
        if self.phase not in _VALID_PHASES:
            raise JobContractError(f"phase must be one of {sorted(_VALID_PHASES)}, got {self.phase!r}")
        if self.status not in _VALID_STATUSES:
            raise JobContractError(f"status must be one of {sorted(_VALID_STATUSES)}, got {self.status!r}")
        if self.result is not None and not isinstance(self.result, dict):
            raise JobContractError(f"result must be a dict or None, got {type(self.result).__name__}")
        if self.error is not None and not isinstance(self.error, JobError):
            raise JobContractError(f"error must be a JobError or None, got {type(self.error).__name__}")
        if self.result is not None and self.error is not None:
            raise JobContractError("result and error are mutually exclusive")
        if self.status == JobStatus.ERROR.value and self.error is None:
            raise JobContractError("status 'error' requires explicit error data")
        if self.status != JobStatus.ERROR.value and self.error is not None:
            raise JobContractError("error data is only valid when status is 'error'")
