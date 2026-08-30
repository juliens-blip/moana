"""Deterministic tests for brochure-level editorial selection and FFmpeg branding."""

from __future__ import annotations

import hashlib
import json
import subprocess
import zlib

import pytest

from tests.backend.test_brochure_video_runner import (
    FAKE_SUPABASE_ENV,
    IMAGE_A0,
    FakeClipSource,
    FakeVeoStorageCheckpoint,
    FakeVeoTransport,
    _content_object,
    _dict_object,
    _fixed_rand,
    _image_object,
    _no_sleep,
    _page_object,
    _write_job_inputs,
)
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


# IMPORTANT — what these fixtures are NOT: they are not, and must never be read as, a stand-in
# for a real user-uploaded brochure PDF. No captured-and-sanitized real file is used here,
# because none is available in this sandboxed environment (production brochures are
# customer-confidential) — and fabricating a fake "captured on <date> from <source>" comment
# would be worse than admitting that. So instead of claiming external representativeness this
# scope does not have, these bytes are narrowed to exactly what they really are: white-box
# unit-test inputs for gemini_pdf_classifier._text_showing_strings/_extract_pdf_text, built
# byte-by-byte to drive specific branches of THIS repo's own tokenizer (comment skipping,
# BI/ID/EI inline-image skipping, BDC marked-content-dictionary skipping, Tj/TJ operator-token
# boundaries) against the public ISO 32000-1:2008 PDF grammar those functions implement
# (§7.5.2 object/stream structure, §7.4.4 FlateDecode, §8.9.7 inline images, §9.4.3
# Tj/TJ) — the same internal contract the extractor already round-trips in
# test_pdf_image_extractor.py, not an assumed shape of an external upload.
def _pdf_from_content_ops(ops: bytes, *, compress: bool = True) -> bytes:
    """One-page PDF whose sole content stream is exactly ``ops`` (raw content-stream operators)."""
    if compress:
        stream_bytes = zlib.compress(ops)
        stream_dict = f"<< /Length {len(stream_bytes)} /Filter /FlateDecode >>"
    else:
        stream_bytes = ops
        stream_dict = f"<< /Length {len(stream_bytes)} >>"
    content_obj = b"4 0 obj\n" + stream_dict.encode("ascii") + b"\nstream\n" + stream_bytes + b"\nendstream\nendobj\n"
    return b"".join(
        [
            b"%PDF-1.4\n",
            _dict_object(1, "<< /Type /Catalog /Pages 2 0 R >>"),
            _dict_object(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>"),
            _page_object(3, 2, {}, 4),
            content_obj,
            b"%%EOF\n",
        ]
    )


def _text_pdf(*lines: str, compress: bool = True) -> bytes:
    """One-page PDF whose content stream draws ``lines`` via genuine ``Tj`` text-showing
    operators (optionally FlateDecode-compressed, matching how virtually every real-world
    brochure stores its content stream). See the provenance note above ``_pdf_from_content_ops``.
    """
    ops = []
    y = 700
    for line in lines:
        escaped = line.replace("\\", r"\\").replace("(", r"\(").replace(")", r"\)")
        ops.append(f"BT /F1 12 Tf 72 {y} Td ({escaped}) Tj ET\n")
        y -= 20
    return _pdf_from_content_ops("".join(ops).encode("latin-1"), compress=compress)


def _pdf_with_image_and_text(image_data: bytes, contents_text: str, *, compress: bool = True) -> bytes:
    """One-page PDF with both an image XObject (``image_data`` as its raw, undeclared-filter
    payload) and a *separate*, genuine ``/Contents`` text stream drawing ``contents_text``.
    Used to prove grounding only ever reads a page's own ``/Contents``, never an XObject's
    payload — see the provenance note above ``_pdf_from_content_ops``.
    """
    ops = f"BT /F1 12 Tf 72 700 Td ({contents_text}) Tj ET\n".encode("latin-1")
    if compress:
        stream_bytes = zlib.compress(ops)
        stream_dict = f"<< /Length {len(stream_bytes)} /Filter /FlateDecode >>"
    else:
        stream_bytes = ops
        stream_dict = f"<< /Length {len(stream_bytes)} >>"
    content_obj = b"5 0 obj\n" + stream_dict.encode("ascii") + b"\nstream\n" + stream_bytes + b"\nendstream\nendobj\n"
    return b"".join(
        [
            b"%PDF-1.4\n",
            _dict_object(1, "<< /Type /Catalog /Pages 2 0 R >>"),
            _dict_object(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>"),
            _page_object(3, 2, {"Im0": 4}, 5),
            _image_object(4, image_data),
            content_obj,
            b"%%EOF\n",
        ]
    )


# FlateDecode-compressed by default (see _text_pdf's docstring): this is the
# realistic case, and it is what parse_brochure_direction_response's grounding
# must decompress correctly to find these facts at all.
_GROUNDED_BROCHURE_BYTES = _text_pdf("M/Y EXAMPLE", "Example Yachts", "42 m", "10 in 5 cabins")


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

    plan = parse_brochure_direction_response(json.dumps(payload), image_ids, _GROUNDED_BROCHURE_BYTES)

    assert plan.logo_image_id == image_ids[1]
    assert plan.yacht_name == "M/Y EXAMPLE"
    assert len(plan.facts) == MAX_EDITORIAL_FACTS == 3
    assert plan.facts[1].display_text == "Length — 42 m"


def test_director_neutralizes_yacht_name_and_facts_absent_from_the_brochure_bytes() -> None:
    image_ids = ("doc:0000:0000",)
    # a real, FlateDecode-compressed brochure spec sheet that draws "Length 42m" and
    # "Guests 10 cabins" but never prints a yacht name or a top speed, unlike the
    # invented ones Gemini returns below.
    pdf_bytes = _text_pdf("Length 42m", "Guests 10 cabins")
    payload = {
        "sections": [{"image_id": image_ids[0], "section": "Hero/Identité"}],
        "logo_image_id": None,
        "yacht_name": "M/Y INVENTED",
        "facts": [
            {"label": "Length", "value": "42m"},
            {"label": "Speed", "value": "38 knots"},
        ],
    }

    plan = parse_brochure_direction_response(json.dumps(payload), image_ids, pdf_bytes)

    assert plan.yacht_name is None, "a name absent from the brochure's own bytes must never survive"
    assert [fact.label for fact in plan.facts] == ["Length"], "only the brochure-grounded fact survives"


def test_director_grounds_facts_through_flatedecode_decompression() -> None:
    """Explicit compressed-content-stream case: grounding must decompress before matching,
    not scan the raw (compressed, non-ASCII) stream bytes."""
    image_ids = ("doc:0000:0000",)
    compressed_pdf = _text_pdf("Top Speed 32 knots", compress=True)
    uncompressed_pdf = _text_pdf("Top Speed 32 knots", compress=False)
    payload = {
        "sections": [{"image_id": image_ids[0], "section": "Hero/Identité"}],
        "logo_image_id": None,
        "yacht_name": None,
        "facts": [{"label": "Speed", "value": "32 knots"}],
    }

    plan_compressed = parse_brochure_direction_response(json.dumps(payload), image_ids, compressed_pdf)
    plan_uncompressed = parse_brochure_direction_response(json.dumps(payload), image_ids, uncompressed_pdf)

    assert [fact.label for fact in plan_compressed.facts] == ["Speed"], (
        "a fact printed only inside a FlateDecode-compressed content stream must still ground"
    )
    assert plan_compressed.facts == plan_uncompressed.facts


def test_director_ignores_text_shaped_bytes_inside_an_image_xobject() -> None:
    """Adversarial: an image XObject whose decoded payload happens to spell a Tj-shaped
    operator sequence must never ground a claim — only a page's own /Contents can."""
    image_ids = ("doc:0000:0000",)
    pdf_bytes = _pdf_with_image_and_text(
        image_data=b"BT (M/Y INVENTED) Tj ET",
        contents_text="Length 42m",
    )
    payload = {
        "sections": [{"image_id": image_ids[0], "section": "Hero/Identité"}],
        "logo_image_id": None,
        "yacht_name": "M/Y INVENTED",
        "facts": [{"label": "Length", "value": "42m"}],
    }

    plan = parse_brochure_direction_response(json.dumps(payload), image_ids, pdf_bytes)

    assert plan.yacht_name is None, "text-shaped bytes inside an image XObject must never ground a claim"
    assert [fact.label for fact in plan.facts] == ["Length"]


def test_director_ignores_strings_between_bt_et_that_are_not_tj_operands() -> None:
    """Adversarial: a string that sits between BT/ET but is not itself a Tj/TJ operand (here,
    a marked-content /ActualText property value) must not ground a claim — only the operand
    of the real Tj immediately after it may."""
    image_ids = ("doc:0000:0000",)
    ops = (
        "BT /Span << /ActualText (Hidden Fact) >> BDC "
        "/F1 12 Tf 72 700 Td (Real Text) Tj EMC ET\n"
    ).encode("latin-1")
    pdf_bytes = _pdf_from_content_ops(ops)
    payload = {
        "sections": [{"image_id": image_ids[0], "section": "Hero/Identité"}],
        "logo_image_id": None,
        "yacht_name": None,
        "facts": [
            {"label": "Hidden", "value": "Hidden Fact"},
            {"label": "Real", "value": "Real Text"},
        ],
    }

    plan = parse_brochure_direction_response(json.dumps(payload), image_ids, pdf_bytes)

    assert [fact.label for fact in plan.facts] == ["Real"], (
        "a marked-content property string (not a Tj/TJ operand) must not ground a fact"
    )


def test_director_ignores_a_tj_sequence_inside_a_pdf_comment() -> None:
    """Adversarial: a (name) Tj sequence written inside a PDF comment (% to end of line) is
    never rendered by any PDF viewer and must not ground a claim — only the real Tj after it
    may."""
    image_ids = ("doc:0000:0000",)
    ops = (
        "% (M/Y INVENTED) Tj -- not real content, just a comment\n"
        "BT /F1 12 Tf 72 700 Td (Real Text) Tj ET\n"
    ).encode("latin-1")
    pdf_bytes = _pdf_from_content_ops(ops)
    payload = {
        "sections": [{"image_id": image_ids[0], "section": "Hero/Identité"}],
        "logo_image_id": None,
        "yacht_name": "M/Y INVENTED",
        "facts": [{"label": "Real", "value": "Real Text"}],
    }

    plan = parse_brochure_direction_response(json.dumps(payload), image_ids, pdf_bytes)

    assert plan.yacht_name is None, "a Tj sequence written inside a PDF comment must never ground a claim"
    assert [fact.label for fact in plan.facts] == ["Real"]


def test_director_ignores_text_shaped_bytes_inside_an_inline_image() -> None:
    """Adversarial: a BI...ID...EI inline image's raw binary payload (embedded directly in
    the /Contents stream, unlike a separate XObject) happens to spell a Tj-shaped operator
    sequence; it must not ground a claim — only the real Tj after it may."""
    image_ids = ("doc:0000:0000",)
    ops = (
        b"BT ET\n"
        b"q 4 0 0 4 72 700 cm\n"
        b"BI /W 1 /H 1 /BPC 8 /CS /G ID "
        b"(M/Y INVENTED) Tj"  # raw inline-image sample bytes, not real operators
        b" EI\nQ\n"
        b"BT /F1 12 Tf 72 650 Td (Real Text) Tj ET\n"
    )
    pdf_bytes = _pdf_from_content_ops(ops)
    payload = {
        "sections": [{"image_id": image_ids[0], "section": "Hero/Identité"}],
        "logo_image_id": None,
        "yacht_name": "M/Y INVENTED",
        "facts": [{"label": "Real", "value": "Real Text"}],
    }

    plan = parse_brochure_direction_response(json.dumps(payload), image_ids, pdf_bytes)

    assert plan.yacht_name is None, "text-shaped bytes inside an inline image must never ground a claim"
    assert [fact.label for fact in plan.facts] == ["Real"]


def test_director_rejects_overloaded_unknown_or_duplicate_content() -> None:
    image_ids = ("doc:0000:0000",)
    base = {
        "sections": [{"image_id": image_ids[0], "section": "Hero/Identité"}],
        "logo_image_id": None,
        "yacht_name": "EXAMPLE",
        "facts": [{"label": f"Fact {index}", "value": str(index)} for index in range(4)],
    }
    with pytest.raises(GeminiClassificationError, match="at most"):
        parse_brochure_direction_response(json.dumps(base), image_ids, _GROUNDED_BROCHURE_BYTES)

    base["facts"] = []
    base["logo_image_id"] = "unknown"
    with pytest.raises(GeminiClassificationError, match="logo_image_id"):
        parse_brochure_direction_response(json.dumps(base), image_ids, _GROUNDED_BROCHURE_BYTES)


def test_director_prompt_demands_real_broker_logo_and_sparse_verified_facts() -> None:
    prompt = build_brochure_direction_prompt(("img-1", "img-2"))

    assert "actual BROKERAGE AGENCY logo" in prompt
    assert "never the yacht name, builder, shipyard" in prompt
    assert "zero to three facts maximum" in prompt
    assert "Do not include phone numbers, emails, URLs" in prompt
    assert "invented claims" in prompt


def test_director_prompt_forbids_inventing_logo_or_yacht_name() -> None:
    prompt = build_brochure_direction_prompt(("img-1", "img-2"))

    assert "not fully certain" in prompt
    assert "a missed logo is always preferable to a wrong one" in prompt
    assert "never infer, guess, complete, or normalize it" in prompt
    assert "return null rather than a plausible-sounding name" in prompt
    assert "Never invent, estimate, round, or infer a fact" in prompt


def test_director_leaves_yacht_name_null_when_not_explicitly_present() -> None:
    image_ids = ("doc:0000:0000",)
    payload = {
        "sections": [{"image_id": image_ids[0], "section": "Hero/Identité"}],
        "logo_image_id": None,
        "yacht_name": None,
        "facts": [],
    }

    plan = parse_brochure_direction_response(json.dumps(payload), image_ids, _GROUNDED_BROCHURE_BYTES)

    assert plan.yacht_name is None
    assert plan.logo_image_id is None


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
    assert len(transport.prompts) == 1
    generated_prompt = transport.prompts[0]
    assert "sequence 1 of 1" in generated_prompt
    assert 'for the motor yacht "M/Y EXAMPLE"' in generated_prompt
    assert '"Builder — Example Yachts"' in generated_prompt
    assert '"Length — 42 m"' in generated_prompt
    assert '"Guests — 10 in 5 cabins"' in generated_prompt
    assert "{YACHT_NAME}" not in generated_prompt
    assert "{VERIFIED_FACTS}" not in generated_prompt
    assert len(recorded_commands) == 2, "assembly plus one deterministic branding pass"
    branding_command = recorded_commands[1]
    filter_graph = branding_command[branding_command.index("-filter_complex") + 1]
    assert "colorchannelmixer=aa=0.10" in filter_graph
    assert "overlay=W-w-W*0.025:H-h-H*0.035" in filter_graph
    assert "drawtext=" not in filter_graph, "editorial text overlays were dropped: too slow on production hardware"
    assert "-shortest" in branding_command
    assert branding_command[branding_command.index("-t") + 1] == "6.00", (
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
