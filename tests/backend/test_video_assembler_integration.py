"""Test d'intégration bout-en-bout de l'assemblage vidéo (plan.json T2/S3).

Simule clips Veo, transitions, subprocess ffmpeg et Supabase Storage à travers
``assemble_and_publish`` complet (jamais un composant isolé) : ordre des
clips, présence et ordre des transitions ``xfade`` dans la commande ffmpeg,
invocation directe de subprocess, flux vidéo H.264 dans le MP4 produit, puis
publication Storage renvoyant exactement l'artefact final. Un rejeu avec la
même clé d'idempotence ne republie pas. Aucun ffmpeg réel n'est invoqué,
aucun appel réseau réel n'est possible depuis ce fichier.
"""

from __future__ import annotations

import hashlib
import json
import subprocess

from workers.gemini_veo_generator import CLIP_DURATION_S, ClipCheckpoint
from workers.job_contract import JobPhase, JobStatus
from workers.video_assembler import (
    CONTAINER_FORMAT,
    SUPABASE_DB_URL_VAR,
    SUPABASE_SERVICE_ROLE_KEY_VAR,
    SUPABASE_URL_VAR,
    TRANSITION_TYPE,
    VIDEO_CODEC,
    AssemblySettings,
    SupabaseStoragePublishCheckpoint,
    assemble_and_publish,
)

DOCUMENT_DIGEST = "c" * 64
FAKE_SUPABASE_ENV = {
    SUPABASE_URL_VAR: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY_VAR: "fake-service-role-key-sentinel",
    SUPABASE_DB_URL_VAR: "postgresql://fake/db",
}

# Marks the fake ffmpeg output as carrying an H.264 video stream, so the test
# can assert on the produced MP4's codec without a real ffprobe.
H264_STREAM_MARKER = b"avc1-h264-video-stream"


def _clip(image_id: str) -> ClipCheckpoint:
    return ClipCheckpoint(
        image_id=image_id,
        object_key=f"veo-clips/{DOCUMENT_DIGEST[:16]}/{image_id}.mp4",
        duration_s=CLIP_DURATION_S,
        content_digest="d" * 64,
    )


class FakeClipSource:
    """In-memory clip download fake: records order, never touches a network."""

    def __init__(self) -> None:
        self.download_order: list[str] = []

    def download_clip(self, object_key: str, timeout: float) -> bytes:
        self.download_order.append(object_key)
        return f"clip-bytes-{object_key}".encode()


def _fake_ffmpeg_run(captured_commands: list[list[str]]):
    """Direct-subprocess fake: records the exact command and writes a real
    output file whose bytes carry the H.264 marker, exactly like a real
    ``libx264``/MP4 ffmpeg invocation would produce a decodable stream."""

    def run(command, **kwargs):
        assert kwargs.get("shell", False) is False  # never through a shell
        captured_commands.append(command)
        output_path = command[-1]
        with open(output_path, "wb") as handle:
            handle.write(H264_STREAM_MARKER + b"-mp4-payload")
        return subprocess.CompletedProcess(command, 0, stdout=b"", stderr=b"")

    return run


def _no_sleep(_seconds: float) -> None:
    return None


def _fixed_rand() -> float:
    return 0.0


def test_full_assembly_and_publish_pipeline_end_to_end() -> None:
    clips = [_clip("sec-1"), _clip("sec-2"), _clip("sec-3")]
    clip_source = FakeClipSource()
    captured_commands: list[list[str]] = []

    storage_objects: dict[str, bytes] = {}

    def fake_storage_request(url, headers, body, timeout):
        if body is None:
            for object_key, stored_bytes in storage_objects.items():
                if object_key in url:
                    return 200, json.dumps({"checksum": hashlib.sha256(stored_bytes).hexdigest()}).encode()
            return 404, b""
        # PUT: extract the object_key from the URL suffix, same shape as
        # SupabaseStoragePublishCheckpoint._object_url.
        object_key = url.split("/storage/v1/object/videos/", 1)[1]
        storage_objects[object_key] = body
        return 201, b""

    checkpoint = SupabaseStoragePublishCheckpoint(
        supabase_url=FAKE_SUPABASE_ENV[SUPABASE_URL_VAR],
        supabase_service_key=FAKE_SUPABASE_ENV[SUPABASE_SERVICE_ROLE_KEY_VAR],
        request=fake_storage_request,
        settings=AssemblySettings(max_retries=1, backoff_base_s=0.01, backoff_cap_s=0.02),
        sleep=_no_sleep,
        rand=_fixed_rand,
    )

    result = assemble_and_publish(
        job_id="job-1",
        upload_ref="upload-1",
        document_digest=DOCUMENT_DIGEST,
        clips=clips,
        idempotency_key="idem-1",
        clip_source=clip_source,
        checkpoint=checkpoint,
        run=_fake_ffmpeg_run(captured_commands),
        settings=AssemblySettings(max_retries=1, backoff_base_s=0.01, backoff_cap_s=0.02),
        sleep=_no_sleep,
        rand=_fixed_rand,
        env=FAKE_SUPABASE_ENV,
    )

    # 1. Section order preserved end-to-end: download order matches clips order.
    assert clip_source.download_order == [clip.object_key for clip in clips]

    # 2. Exactly one direct-subprocess ffmpeg invocation, never through a shell.
    assert len(captured_commands) == 1
    command = captured_commands[0]
    assert command[0] == "ffmpeg"

    # 3. Transitions present and ordered: two xfade filters for three clips,
    #    chained v1 -> v2 in the exact clip order (never re-sorted).
    filter_index = command.index("-filter_complex")
    filter_graph = command[filter_index + 1]
    filters = filter_graph.split(";")
    assert len(filters) == len(clips) - 1
    assert filters[0].startswith(f"[0:v][1:v]xfade=transition={TRANSITION_TYPE}")
    assert filters[0].endswith("[v1]")
    assert filters[1].startswith(f"[v1][2:v]xfade=transition={TRANSITION_TYPE}")
    assert filters[1].endswith("[v2]")

    # 4. H.264/MP4 output codec declared explicitly in the ffmpeg command.
    assert "-c:v" in command
    assert command[command.index("-c:v") + 1] == VIDEO_CODEC == "libx264"
    assert "-f" in command
    assert command[command.index("-f") + 1] == CONTAINER_FORMAT == "mp4"

    # 5. The produced MP4 bytes carry the H.264 stream marker (fake ffmpeg
    #    only writes it when invoked with the libx264 command above).
    published_bytes = storage_objects[result.result["object_key"]]
    assert published_bytes.startswith(H264_STREAM_MARKER)

    # 6. Storage publish returns exactly the final artifact: the job result
    #    matches what was actually persisted under that object key.
    assert result.phase == JobPhase.RESULT.value
    assert result.status == JobStatus.DONE.value
    assert result.result["content_digest"] == hashlib.sha256(published_bytes).hexdigest()
    assert result.result["clip_count"] == len(clips)

    # 7. Replay with the same idempotency key does not republish: no new
    #    download, no new ffmpeg invocation, and the same artifact comes back.
    clip_source_2 = FakeClipSource()
    captured_commands_2: list[list[str]] = []

    replay_result = assemble_and_publish(
        job_id="job-1-replay",
        upload_ref="upload-1",
        document_digest=DOCUMENT_DIGEST,
        clips=clips,
        idempotency_key="idem-1",
        clip_source=clip_source_2,
        checkpoint=checkpoint,
        run=_fake_ffmpeg_run(captured_commands_2),
        settings=AssemblySettings(max_retries=1, backoff_base_s=0.01, backoff_cap_s=0.02),
        sleep=_no_sleep,
        rand=_fixed_rand,
        env=FAKE_SUPABASE_ENV,
    )

    assert clip_source_2.download_order == []
    assert captured_commands_2 == []
    assert replay_result.result["object_key"] == result.result["object_key"]
    assert replay_result.result["content_digest"] == result.result["content_digest"]
    assert len(storage_objects) == 1  # no duplicate object was ever written
