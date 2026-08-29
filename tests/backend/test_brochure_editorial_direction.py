"""Deterministic tests for brochure-level editorial selection and FFmpeg branding."""

from __future__ import annotations

import hashlib
import json
import subprocess

import pytest

from workers.brochure_video_runner import AtomicJobStateStore, run_brochure_video_job
from workers.gemini_pdf_classifier import (
    MAX_EDITORIAL_FACTS,
    BrochureEditorialPlan,
    EditorialFact,
    GeminiClassificationError,
    build_brochure_direction_prompt,
    parse_brochure_direction_response,
)
from workers.video_assembler import InMemoryPublishCheckpoint

from tests.backend.test_brochure_video_runner import (
    FAKE_SUPABASE_ENV,
    FakeClipSource,
    FakeVeoStorageCheckpoint,
    FakeVeoTransport,
    IMAGE_A0,
    _content_object,
    _dict_object,
    _fixed_rand,
    _image_object,
    _no_sleep,
    _page_object,
    _write_job_inputs,
)


def _two_image_pdf() -> bytes:
    photo = IMAGE_A0
    logo = bytes(range(0xB0, 0xC0))
    return b"".join(
        [
            b"%PDF-1.4\n",
            _dict_object(1, "<< /Type /Catalog /Pages 2 0 R >>"),
            _dict_object(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>"),
            _page_object(3, 2, {"Photo": 4, "Logo": 6}, 5),
            _image_object(4, photo),
            _content_object(5, ["Photo", "Logo"]),
            _image_object(6, logo),
            b"%%EOF\n",
        ]
    )


def test_director_accepts_one_logo_and_at_most_three_priority_facts() -> None:
    image_ids = ("doc:0000:0000", "doc:0000:0001")
    payload = {
        "sections": [
            {"image_id": image_ids[0], "section": "Hero/Identité"},
            {"image_id": image_ids[1], "section": "Brokerage Logo/Branding"},
        ],
        "logo_image_id": image_ids[1],
        "yacht_name": "M/Y EXAMPLE",
        "facts": [
            {"label": "Builder", "value": "Example Yachts"},
            {"label": "Length", "value": "42 m"},
            {"label": "Guests", "value": "10 in 5 cabins"},
        ],
    }

    plan = parse_brochure_direction_response(json.dumps(payload), image_ids)

    assert plan.logo_image_id == image_ids[1]
    assert plan.yacht_name == "M/Y EXAMPLE"
    assert len(plan.facts) == MAX_EDITORIAL_FACTS == 3
    assert plan.facts[1].display_text == "Length — 42 m"


def test_director_rejects_overloaded_unknown_or_duplicate_content() -> None:
    image_ids = ("doc:0000:0000",)
    base = {
        "sections": [{"image_id": image_ids[0], "section": "Hero/Identité"}],
        "logo_image_id": None,
        "yacht_name": "EXAMPLE",
        "facts": [{"label": f"Fact {index}", "value": str(index)} for index in range(4)],
    }
    with pytest.raises(GeminiClassificationError, match="at most"):
        parse_brochure_direction_response(json.dumps(base), image_ids)

    base["facts"] = []
    base["logo_image_id"] = "unknown"
    with pytest.raises(GeminiClassificationError, match="logo_image_id"):
        parse_brochure_direction_response(json.dumps(base), image_ids)


def test_director_prompt_demands_real_broker_logo_and_sparse_verified_facts() -> None:
    prompt = build_brochure_direction_prompt(("img-1", "img-2"))

    assert "actual BROKERAGE AGENCY logo" in prompt
    assert "not the yacht name, builder, shipyard" in prompt
    assert "zero to three facts maximum" in prompt
    assert "Do not include phone numbers, emails, URLs" in prompt
    assert "invented claims" in prompt


def test_runner_skips_logo_clip_and_adds_persistent_logo_watermark_only(tmp_path) -> None:
    pdf_bytes = _two_image_pdf()
    pdf_path, marker_path = _write_job_inputs(tmp_path, pdf_bytes)
    digest = hashlib.sha256(pdf_bytes).hexdigest()
    photo_id = f"{digest[:16]}:0000:0000"
    logo_id = f"{digest[:16]}:0000:0001"
    transport = FakeVeoTransport()
    recorded_commands: list[list[str]] = []

    def director(_pdf_bytes, images):
        assert len(images) == 2
        return BrochureEditorialPlan(
            sections=((photo_id, "Hero/Identité"), (logo_id, "Brokerage Logo/Branding")),
            logo_image_id=logo_id,
            yacht_name="M/Y EXAMPLE",
            facts=(
                EditorialFact("Builder", "Example Yachts"),
                EditorialFact("Length", "42 m"),
                EditorialFact("Guests", "10 in 5 cabins"),
            ),
        )

    def successful_ffmpeg(command, **kwargs):
        recorded_commands.append(command)
        with open(command[-1], "wb") as handle:
            handle.write(b"fake-mp4")
        return subprocess.CompletedProcess(command, 0, stdout=b"", stderr=b"")

    envelope = run_brochure_video_job(
        job_id="editorial-job",
        pdf_path=pdf_path,
        manifest_marker_path=marker_path,
        upload_ref="uploads/editorial-job/input.pdf",
        state_store=AtomicJobStateStore(tmp_path / "state"),
        veo_transport=transport,
        veo_checkpoint=FakeVeoStorageCheckpoint(),
        clip_source=FakeClipSource(),
        publish_checkpoint=InMemoryPublishCheckpoint(),
        editorial_director=director,
        run=successful_ffmpeg,
        sleep=_no_sleep,
        rand=_fixed_rand,
        env=FAKE_SUPABASE_ENV,
        now=lambda: 0.0,
    )

    assert envelope.status == "done"
    assert transport.calls == [photo_id], "the broker logo must never become its own Veo clip"
    assert len(recorded_commands) == 2, "assembly plus one deterministic branding pass"
    branding_command = recorded_commands[1]
    filter_graph = branding_command[branding_command.index("-filter_complex") + 1]
    assert "colorchannelmixer=aa=0.10" in filter_graph
    assert "overlay=W-w-W*0.025:H-h-H*0.035" in filter_graph
    assert "drawtext=" not in filter_graph, "editorial text overlays were dropped: too slow on production hardware"
    assert "-shortest" in branding_command
    assert branding_command[branding_command.index("-t") + 1] == "5.00", (
        "-t must bound the output to the base video's real duration: -shortest alone does not "
        "reliably terminate a -loop 1 (infinite) logo input routed through filter_complex"
    )


def test_runner_fails_before_veo_when_required_editorial_direction_is_unavailable(tmp_path) -> None:
    pdf_bytes = _two_image_pdf()
    pdf_path, marker_path = _write_job_inputs(tmp_path, pdf_bytes)
    transport = FakeVeoTransport()

    def unavailable_director(_pdf_bytes, _images):
        raise RuntimeError("simulated director outage")

    envelope = run_brochure_video_job(
        job_id="editorial-failure",
        pdf_path=pdf_path,
        manifest_marker_path=marker_path,
        upload_ref="uploads/editorial-failure/input.pdf",
        state_store=AtomicJobStateStore(tmp_path / "state-failure"),
        veo_transport=transport,
        veo_checkpoint=FakeVeoStorageCheckpoint(),
        clip_source=FakeClipSource(),
        publish_checkpoint=InMemoryPublishCheckpoint(),
        editorial_director=unavailable_director,
        run=lambda *_args, **_kwargs: (_ for _ in ()).throw(AssertionError("ffmpeg must not run")),
        sleep=_no_sleep,
        rand=_fixed_rand,
        env=FAKE_SUPABASE_ENV,
        now=lambda: 0.0,
    )

    assert envelope.status == "error"
    assert "BrochureEditorialDirectionError" in envelope.error.message
    assert transport.calls == [], "Veo credits must not be spent without a valid editorial plan"
