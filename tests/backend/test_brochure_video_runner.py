"""Tests déterministes du runner brochure -> vidéo (plan.json T1 S1/S2/S4).

Toutes les étapes (Veo, ffmpeg, Storage) sont injectées en mémoire : aucun
appel réseau réel, aucun ffmpeg réel, aucune attente de 600 secondes (horloge
``now`` injectée).
"""

from __future__ import annotations

import json
import hashlib
import subprocess

import pytest

from workers.brochure_video_runner import (
    JOB_TIMEOUT_S,
    AtomicJobStateStore,
    InvalidJobInputError,
    JobAlreadyRunningError,
    run_brochure_video_job,
)
from workers.job_contract import JobStatus
from workers.veo_generator import (
    ClipCheckpoint,
)
from workers.video_assembler import (
    CONTAINER_FORMAT,
    SUPABASE_DB_URL_VAR,
    SUPABASE_SERVICE_ROLE_KEY_VAR,
    SUPABASE_URL_VAR,
    InMemoryPublishCheckpoint,
    PublishedArtifact,
)

FAKE_SUPABASE_ENV = {
    SUPABASE_URL_VAR: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY_VAR: "fake-service-role-key-sentinel",
    SUPABASE_DB_URL_VAR: "postgresql://fake/db",
}

UPLOAD_REF = "uploads/brochure.pdf"


# ---------------------------------------------------------------------------
# Hand-rolled minimal PDF fixture (same approach as test_pdf_image_extractor.py)
# ---------------------------------------------------------------------------

IMAGE_A0 = bytes(range(0xA0, 0xB0))


def _dict_object(num: int, body: str) -> bytes:
    return f"{num} 0 obj\n".encode("ascii") + body.encode("ascii") + b"\nendobj\n"


def _image_object(num: int, data: bytes) -> bytes:
    body = (
        f"<< /Type /XObject /Subtype /Image /Width 4 /Height 4 "
        f"/ColorSpace /DeviceGray /BitsPerComponent 8 /Length {len(data)} >>"
    )
    return f"{num} 0 obj\n".encode("ascii") + body.encode("ascii") + b"\nstream\n" + data + b"\nendstream\nendobj\n"


def _content_object(num: int, op_names: list[str]) -> bytes:
    ops = "".join(f"/{name} Do\n" for name in op_names)
    data = ops.encode("ascii")
    body = f"<< /Length {len(data)} >>"
    return f"{num} 0 obj\n".encode("ascii") + body.encode("ascii") + b"\nstream\n" + data + b"\nendstream\nendobj\n"


def _page_object(num: int, parent: int, xobject_names: dict[str, int], contents: int) -> bytes:
    xobject_entries = " ".join(f"/{name} {ref} 0 R" for name, ref in xobject_names.items())
    body = (
        f"<< /Type /Page /Parent {parent} 0 R "
        f"/Resources << /XObject << {xobject_entries} >> >> "
        f"/Contents {contents} 0 R /MediaBox [0 0 200 200] >>"
    )
    return _dict_object(num, body)


def _single_image_pdf(data: bytes = IMAGE_A0) -> bytes:
    parts = [b"%PDF-1.4\n"]
    parts.append(_dict_object(1, "<< /Type /Catalog /Pages 2 0 R >>"))
    parts.append(_dict_object(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>"))
    parts.append(_page_object(3, 2, {"Im0": 4}, 5))
    parts.append(_image_object(4, data))
    parts.append(_content_object(5, ["Im0"]))
    parts.append(b"%%EOF\n")
    return b"".join(parts)


# ---------------------------------------------------------------------------
# In-memory collaborator fakes
# ---------------------------------------------------------------------------


class FakeVeoStorageCheckpoint:
    def __init__(self) -> None:
        self._by_document: dict[str, list[ClipCheckpoint]] = {}
        self.persisted: list[str] = []

    def load_manifest(self, document_digest: str) -> tuple[ClipCheckpoint, ...]:
        return tuple(self._by_document.get(document_digest, ()))

    def persist_clip(self, document_digest: str, checkpoint: ClipCheckpoint, clip_bytes: bytes) -> None:
        self._by_document.setdefault(document_digest, []).append(checkpoint)
        self.persisted.append(checkpoint.image_id)


class FakeVeoTransport:
    def __init__(self, fail_with: Exception | None = None) -> None:
        self._fail_with = fail_with
        self.calls: list[str] = []

    def generate_clip(self, prompt: str, entry, timeout: float) -> bytes:
        self.calls.append(entry.image_id)
        if self._fail_with is not None:
            raise self._fail_with
        return f"clip-bytes-{entry.image_id}".encode()


class FakeClipSource:
    def __init__(self) -> None:
        self.calls: list[str] = []

    def download_clip(self, object_key: str, timeout: float) -> bytes:
        self.calls.append(object_key)
        return f"clip-bytes-{object_key}".encode()


def _ok_run(command, **kwargs):
    output_path = command[-1]
    with open(output_path, "wb") as handle:
        handle.write(b"fake-mp4-bytes")
    return subprocess.CompletedProcess(command, 0, stdout=b"", stderr=b"")


def _no_sleep(_seconds: float) -> None:
    return None


def _fixed_rand() -> float:
    return 0.0


def _write_job_inputs(tmp_path, pdf_bytes: bytes) -> tuple:
    pdf_path = tmp_path / "input.pdf"
    pdf_path.write_bytes(pdf_bytes)
    import hashlib

    marker_path = tmp_path / "manifest.json"
    marker_path.write_text(json.dumps({"document_digest": hashlib.sha256(pdf_bytes).hexdigest()}))
    return pdf_path, marker_path


def _run_kwargs(tmp_path, state_dir, **overrides):
    kwargs = {
        "job_id": "job-1",
        "upload_ref": UPLOAD_REF,
        "state_store": AtomicJobStateStore(state_dir),
        "veo_transport": FakeVeoTransport(),
        "veo_checkpoint": FakeVeoStorageCheckpoint(),
        "clip_source": FakeClipSource(),
        "publish_checkpoint": InMemoryPublishCheckpoint(),
        "run": _ok_run,
        "sleep": _no_sleep,
        "rand": _fixed_rand,
        "env": FAKE_SUPABASE_ENV,
        "now": lambda: 0.0,
    }
    kwargs.update(overrides)
    return kwargs


# ---------------------------------------------------------------------------
# S1/S2 acceptance: order, states, done result, replay
# ---------------------------------------------------------------------------


def test_job_pipeline_order_and_states(tmp_path) -> None:
    pdf_path, marker_path = _write_job_inputs(tmp_path, _single_image_pdf())
    state_dir = tmp_path / "state"
    veo_transport = FakeVeoTransport()
    clip_source = FakeClipSource()
    publish_checkpoint = InMemoryPublishCheckpoint()
    store = AtomicJobStateStore(state_dir)

    envelope = run_brochure_video_job(
        **_run_kwargs(
            tmp_path,
            state_dir,
            pdf_path=pdf_path,
            manifest_marker_path=marker_path,
            state_store=store,
            veo_transport=veo_transport,
            clip_source=clip_source,
            publish_checkpoint=publish_checkpoint,
        )
    )

    assert envelope.status == JobStatus.DONE.value
    assert envelope.result["object_key"].endswith(f".{CONTAINER_FORMAT}")
    # Veo ran before ffmpeg/publish: the clip it produced is the one downloaded.
    assert len(veo_transport.calls) == 1
    assert clip_source.calls == [f"veo-clips/{clip_source.calls[0].split('/')[1]}/{veo_transport.calls[0]}.mp4"]
    assert publish_checkpoint.produce_calls  # publish ran exactly once

    state = store.load("job-1")
    assert state.status == "done"
    assert state.result == envelope.result


def test_replay_of_done_job_is_a_pure_read(tmp_path) -> None:
    pdf_path, marker_path = _write_job_inputs(tmp_path, _single_image_pdf())
    state_dir = tmp_path / "state"
    store = AtomicJobStateStore(state_dir)

    first = run_brochure_video_job(
        **_run_kwargs(tmp_path, state_dir, pdf_path=pdf_path, manifest_marker_path=marker_path, state_store=store)
    )
    assert first.status == JobStatus.DONE.value

    replay_veo = FakeVeoTransport(fail_with=RuntimeError("must never be called"))
    replay_clip_source = FakeClipSource()
    replay_publish = InMemoryPublishCheckpoint()
    second = run_brochure_video_job(
        **_run_kwargs(
            tmp_path,
            state_dir,
            pdf_path=pdf_path,
            manifest_marker_path=marker_path,
            state_store=store,
            veo_transport=replay_veo,
            clip_source=replay_clip_source,
            publish_checkpoint=replay_publish,
        )
    )

    assert second.status == JobStatus.DONE.value
    assert second.result == first.result
    assert replay_veo.calls == []
    assert replay_clip_source.calls == []
    assert replay_publish.produce_calls == []


def test_fresh_job_reuses_existing_final_video_before_any_veo_call(tmp_path) -> None:
    """Un nouvel identifiant de job pour le même PDF doit réutiliser la
    publication vérifiée, sans dépenser un nouvel appel Veo."""

    pdf_bytes = _single_image_pdf()
    pdf_path, marker_path = _write_job_inputs(tmp_path, pdf_bytes)
    state_dir = tmp_path / "state"
    document_digest = hashlib.sha256(pdf_bytes).hexdigest()
    publish_checkpoint = InMemoryPublishCheckpoint()
    expected_key = f"videos/{document_digest[:16]}/{document_digest}.mp4"
    publish_checkpoint.acquire_and_publish(
        document_digest,
        document_digest,
        lambda: (
            PublishedArtifact(
                object_key=expected_key,
                content_digest=hashlib.sha256(b"existing-video").hexdigest(),
            ),
            b"existing-video",
        ),
    )
    veo_transport = FakeVeoTransport(fail_with=RuntimeError("Veo must never be called"))
    clip_source = FakeClipSource()

    envelope = run_brochure_video_job(
        **_run_kwargs(
            tmp_path,
            state_dir,
            pdf_path=pdf_path,
            manifest_marker_path=marker_path,
            veo_transport=veo_transport,
            clip_source=clip_source,
            publish_checkpoint=publish_checkpoint,
        )
    )

    assert envelope.status == JobStatus.DONE.value
    assert envelope.result["object_key"] == expected_key
    assert veo_transport.calls == []
    assert clip_source.calls == []


def test_concurrent_run_for_same_job_is_serialized(tmp_path) -> None:
    pdf_path, marker_path = _write_job_inputs(tmp_path, _single_image_pdf())
    state_dir = tmp_path / "state"
    store = AtomicJobStateStore(state_dir)

    with store.acquire("job-1"), pytest.raises(JobAlreadyRunningError):
        run_brochure_video_job(
            **_run_kwargs(
                tmp_path, state_dir, pdf_path=pdf_path, manifest_marker_path=marker_path, state_store=store
            )
        )


def test_definitive_veo_failure_records_failed_state(tmp_path) -> None:
    pdf_path, marker_path = _write_job_inputs(tmp_path, _single_image_pdf())
    state_dir = tmp_path / "state"
    store = AtomicJobStateStore(state_dir)

    envelope = run_brochure_video_job(
        **_run_kwargs(
            tmp_path,
            state_dir,
            pdf_path=pdf_path,
            manifest_marker_path=marker_path,
            state_store=store,
            veo_transport=FakeVeoTransport(fail_with=ValueError("boom")),
        )
    )

    assert envelope.status == JobStatus.ERROR.value
    assert envelope.error is not None
    assert "ValueError" in envelope.error.message

    state = store.load("job-1")
    assert state.status == "failed"
    assert "ValueError" in state.reason


def test_timeout_after_600_seconds_uses_injected_clock(tmp_path) -> None:
    pdf_path, marker_path = _write_job_inputs(tmp_path, _single_image_pdf())
    state_dir = tmp_path / "state"
    store = AtomicJobStateStore(state_dir)
    veo_transport = FakeVeoTransport()

    clock = iter([0.0, JOB_TIMEOUT_S + 1.0])

    envelope = run_brochure_video_job(
        **_run_kwargs(
            tmp_path,
            state_dir,
            pdf_path=pdf_path,
            manifest_marker_path=marker_path,
            state_store=store,
            veo_transport=veo_transport,
            now=lambda: next(clock),
        )
    )

    assert envelope.status == JobStatus.ERROR.value
    assert "BrochureVideoTimeoutError" in envelope.error.message
    assert veo_transport.calls == []  # timeout fired before the Veo stage ran

    state = store.load("job-1")
    assert state.status == "failed"


# ---------------------------------------------------------------------------
# Input validation acceptance
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("bad_job_id", ["", "../etc/passwd", "job/with/slash", "a" * 129])
def test_unsafe_or_empty_job_id_is_rejected(tmp_path, bad_job_id) -> None:
    pdf_path, marker_path = _write_job_inputs(tmp_path, _single_image_pdf())
    state_dir = tmp_path / "state"
    store = AtomicJobStateStore(state_dir)

    with pytest.raises(InvalidJobInputError):
        run_brochure_video_job(
            **_run_kwargs(
                tmp_path,
                state_dir,
                job_id=bad_job_id,
                pdf_path=pdf_path,
                manifest_marker_path=marker_path,
                state_store=store,
            )
        )


def test_missing_pdf_path_is_rejected(tmp_path) -> None:
    _, marker_path = _write_job_inputs(tmp_path, _single_image_pdf())
    state_dir = tmp_path / "state"
    store = AtomicJobStateStore(state_dir)

    with pytest.raises(InvalidJobInputError):
        run_brochure_video_job(
            **_run_kwargs(
                tmp_path,
                state_dir,
                pdf_path=tmp_path / "does-not-exist.pdf",
                manifest_marker_path=marker_path,
                state_store=store,
            )
        )


def test_marker_digest_mismatch_is_rejected_as_failed_state(tmp_path) -> None:
    pdf_path, _ = _write_job_inputs(tmp_path, _single_image_pdf())
    state_dir = tmp_path / "state"
    store = AtomicJobStateStore(state_dir)
    marker_path = tmp_path / "manifest.json"
    marker_path.write_text(json.dumps({"document_digest": "0" * 64}))

    envelope = run_brochure_video_job(
        **_run_kwargs(
            tmp_path,
            state_dir,
            pdf_path=pdf_path,
            manifest_marker_path=marker_path,
            state_store=store,
        )
    )

    assert envelope.status == JobStatus.ERROR.value
    assert "InvalidJobInputError" in envelope.error.message
    assert store.load("job-1").status == "failed"
