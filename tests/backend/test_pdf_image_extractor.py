"""Tests déterministes de l'extraction d'images PDF (plan.json T2 S1/S2/S3).

Audit S2 : aucun test backend existant (grep sur tests/) ne référence
``pdf_image_extractor``, ``extract_pdf_images`` ou ``PdfExtractionError``
avant ce fichier — pas de contrat préexistant à aligner.

Toutes les fixtures PDF sont construites à la main en octets bruts, sans
bibliothèque PDF tierce et sans accès réseau. Les octets d'image utilisent
uniquement des valeurs >= 0x80 (hors plage ASCII) pour ne jamais collisionner
avec les marqueurs texte du format (``obj``, ``stream``, des chiffres, etc.).
"""

from __future__ import annotations

import hashlib
import json
import struct
import zlib

import pytest

from workers.gemini_pdf_classifier import (
    SUGGESTED_SECTION_CATEGORIES,
    ClassificationSettings,
    ClassificationTransientError,
    GeminiClassificationError,
    build_classification_prompt,
    make_gemini_flash_classifier,
)
from workers.pdf_image_extractor import (
    ExtractedImage,
    PdfExtractionError,
    build_manifest,
    classify_image,
    extract_pdf_images,
    group_entries_by_section,
)

# ---------------------------------------------------------------------------
# Fixture PDF builder (hand-rolled, no third-party dependency)
# ---------------------------------------------------------------------------

IMAGE_A0 = bytes(range(0xA0, 0xB0))
IMAGE_A1 = bytes(range(0xC0, 0xD0))
IMAGE_B0 = bytes(range(0xE0, 0xF0))


def _dict_object(num: int, body: str) -> bytes:
    return f"{num} 0 obj\n".encode("ascii") + body.encode("ascii") + b"\nendobj\n"


def _image_object(num: int, data: bytes, width: int = 4, height: int = 4) -> bytes:
    body = (
        f"<< /Type /XObject /Subtype /Image /Width {width} /Height {height} "
        f"/ColorSpace /DeviceGray /BitsPerComponent 8 /Length {len(data)} >>"
    )
    return (
        f"{num} 0 obj\n".encode("ascii")
        + body.encode("ascii")
        + b"\nstream\n"
        + data
        + b"\nendstream\nendobj\n"
    )


def _content_object(num: int, op_names: list[str]) -> bytes:
    ops = "".join(f"/{name} Do\n" for name in op_names)
    data = ops.encode("ascii")
    body = f"<< /Length {len(data)} >>"
    return (
        f"{num} 0 obj\n".encode("ascii")
        + body.encode("ascii")
        + b"\nstream\n"
        + data
        + b"\nendstream\nendobj\n"
    )


def _page_object(num: int, parent: int, xobject_names: dict[str, int], contents: int) -> bytes:
    xobject_entries = " ".join(f"/{name} {ref} 0 R" for name, ref in xobject_names.items())
    body = (
        f"<< /Type /Page /Parent {parent} 0 R "
        f"/Resources << /XObject << {xobject_entries} >> >> "
        f"/Contents {contents} 0 R /MediaBox [0 0 200 200] >>"
    )
    return _dict_object(num, body)


def _build_two_page_pdf(page1_images: list[bytes], page2_images: list[bytes]) -> bytes:
    """Assembles a 2-page PDF: page 1 embeds ``page1_images`` in order via
    ``/Im0 Do``, ``/Im1 Do``… and page 2 embeds ``page2_images`` the same way.
    """
    page1_num = 3
    img1_nums = list(range(4, 4 + len(page1_images)))
    content1_num = (img1_nums[-1] if img1_nums else 3) + 1
    page2_num = content1_num + 1
    img2_nums = list(range(page2_num + 1, page2_num + 1 + len(page2_images)))
    content2_num = (img2_nums[-1] if img2_nums else page2_num) + 1

    parts = [b"%PDF-1.4\n"]
    parts.append(_dict_object(1, "<< /Type /Catalog /Pages 2 0 R >>"))
    parts.append(_dict_object(2, f"<< /Type /Pages /Kids [{page1_num} 0 R {page2_num} 0 R] /Count 2 >>"))

    names1 = {f"Im{i}": n for i, n in enumerate(img1_nums)}
    parts.append(_page_object(page1_num, 2, names1, content1_num))
    for n, data in zip(img1_nums, page1_images):
        parts.append(_image_object(n, data))
    parts.append(_content_object(content1_num, list(names1.keys())))

    names2 = {f"Im{i}": n for i, n in enumerate(img2_nums)}
    parts.append(_page_object(page2_num, 2, names2, content2_num))
    for n, data in zip(img2_nums, page2_images):
        parts.append(_image_object(n, data))
    parts.append(_content_object(content2_num, list(names2.keys())))

    parts.append(b"%%EOF\n")
    return b"".join(parts)


def _single_image_pdf(data: bytes) -> bytes:
    return _build_two_page_pdf([data], [])


# ---------------------------------------------------------------------------
# S1/acceptance: deterministic extraction, order and manifest replay
# ---------------------------------------------------------------------------


def test_deterministic_extraction_and_manifest() -> None:
    pdf_bytes = _build_two_page_pdf([IMAGE_A0, IMAGE_A1], [IMAGE_B0])

    images_first = extract_pdf_images(pdf_bytes)
    images_second = extract_pdf_images(pdf_bytes)
    assert images_first == images_second

    assert [(img.page_index, img.occurrence_index, img.data) for img in images_first] == [
        (0, 0, IMAGE_A0),
        (0, 1, IMAGE_A1),
        (1, 0, IMAGE_B0),
    ]

    manifest_first = build_manifest(pdf_bytes)
    manifest_second = build_manifest(pdf_bytes)
    assert manifest_first == manifest_second
    assert manifest_first.document_digest == hashlib.sha256(pdf_bytes).hexdigest()

    entry_ids = [entry.image_id for entry in manifest_first.entries]
    assert len(entry_ids) == len(set(entry_ids)) == 3
    assert all(manifest_first.document_digest[:16] in entry_id for entry_id in entry_ids)

    assert [e.page_index for e in manifest_first.entries] == [0, 0, 1]
    assert [e.occurrence_index for e in manifest_first.entries] == [0, 1, 0]


def test_identifiers_are_distinct_between_documents() -> None:
    pdf_one = _single_image_pdf(IMAGE_A0)
    pdf_two = _single_image_pdf(IMAGE_B0)

    manifest_one = build_manifest(pdf_one)
    manifest_two = build_manifest(pdf_two)

    id_one = manifest_one.entries[0].image_id
    id_two = manifest_two.entries[0].image_id
    assert id_one != id_two
    assert manifest_one.document_digest != manifest_two.document_digest


def test_no_uuid_or_timestamp_component_in_identifier() -> None:
    pdf_bytes = _single_image_pdf(IMAGE_A0)
    manifest_a = build_manifest(pdf_bytes)
    manifest_b = build_manifest(pdf_bytes)
    # A random UUID or a wall-clock timestamp would make two builds diverge.
    assert manifest_a.entries[0].image_id == manifest_b.entries[0].image_id


def test_pdf_without_images_is_not_an_error() -> None:
    pdf_bytes = _build_two_page_pdf([], [])
    images = extract_pdf_images(pdf_bytes)
    assert images == ()
    manifest = build_manifest(pdf_bytes)
    assert manifest.entries == ()
    assert manifest.document_digest == hashlib.sha256(pdf_bytes).hexdigest()


# ---------------------------------------------------------------------------
# S1/acceptance: injectable, content-driven classification (no fixed taxonomy)
# ---------------------------------------------------------------------------


def test_content_driven_injectable_sections() -> None:
    pdf_bytes = _build_two_page_pdf([IMAGE_A0, IMAGE_A1], [IMAGE_B0])
    images = extract_pdf_images(pdf_bytes)

    def _label_by_first_byte(image: ExtractedImage) -> str:
        return f"label-{image.data[0]:02x}"

    labels = [classify_image(image, _label_by_first_byte) for image in images]
    assert labels == [
        f"label-{IMAGE_A0[0]:02x}",
        f"label-{IMAGE_A1[0]:02x}",
        f"label-{IMAGE_B0[0]:02x}",
    ]
    # Distinct content produces distinct labels — nothing pulled from a
    # closed vocabulary of section names.
    assert len(set(labels)) == 3

    # Replaying classification with the same strategy on the same content is
    # stable, which is what makes the manifest replayable end to end.
    manifest_first = build_manifest(pdf_bytes, _label_by_first_byte)
    manifest_second = build_manifest(pdf_bytes, _label_by_first_byte)
    assert [e.section for e in manifest_first.entries] == labels
    assert manifest_first == manifest_second


def test_default_classifier_is_content_driven_not_position_driven() -> None:
    # Same image content placed at two different positions (page 1 occurrence
    # 0, and page 2 occurrence 0) must get the same label from the default
    # classifier, because it is derived only from content, never from
    # position — and it must differ from a page holding different content.
    pdf_bytes = _build_two_page_pdf([IMAGE_A0], [IMAGE_A0])
    manifest = build_manifest(pdf_bytes)
    assert manifest.entries[0].section == manifest.entries[1].section

    other_pdf = _build_two_page_pdf([IMAGE_A0], [IMAGE_B0])
    other_manifest = build_manifest(other_pdf)
    assert other_manifest.entries[0].section != other_manifest.entries[1].section


def test_classifier_strategy_must_return_non_empty_string() -> None:
    pdf_bytes = _single_image_pdf(IMAGE_A0)
    images = extract_pdf_images(pdf_bytes)

    with pytest.raises(PdfExtractionError):
        classify_image(images[0], lambda image: "")

    with pytest.raises(PdfExtractionError):
        classify_image(images[0], lambda image: None)  # type: ignore[arg-type, return-value]


def test_classify_image_normalizes_surrounding_whitespace() -> None:
    pdf_bytes = _single_image_pdf(IMAGE_A0)
    images = extract_pdf_images(pdf_bytes)
    assert classify_image(images[0], lambda image: "  padded-label  \n") == "padded-label"


# ---------------------------------------------------------------------------
# S1/acceptance: explicit, dedicated error for invalid PDF bytes
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "invalid_bytes",
    [
        pytest.param(b"", id="empty"),
        pytest.param(b"not a pdf at all, just plain text", id="missing-header"),
        pytest.param(b"%PDF-1.4\n%%EOF\n", id="header-only-no-objects"),
        pytest.param(
            b"%PDF-1.4\n1 0 obj\n42\nendobj\n%%EOF\n",
            id="object-not-a-dictionary",
        ),
        pytest.param(
            b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R\n%%EOF\n",
            id="unterminated-dictionary",
        ),
        pytest.param(
            b"%PDF-1.4\n"
            b"1 0 obj\n<< /Type /XObject /Subtype /Image /Length 999 >>\n"
            b"stream\nAB\nendstream\nendobj\n%%EOF\n",
            id="stream-length-mismatch",
        ),
        pytest.param(
            b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n%%EOF\n",
            id="dangling-pages-reference",
        ),
    ],
)
def test_invalid_pdf_error(invalid_bytes: bytes) -> None:
    with pytest.raises(PdfExtractionError):
        extract_pdf_images(invalid_bytes)


def test_indirect_stream_length_falls_back_to_endstream_marker() -> None:
    """A stream's /Length may legally be an indirect reference (`N G R`)
    instead of a literal integer — real-world exports (Word/LibreOffice,
    some scanners) do this. This single-pass parser cannot resolve indirect
    references (the target object may not be parsed yet), so it must fall
    back to locating the literal `endstream` marker instead of raising
    `PdfExtractionError`, matching the "non-literal /Length" production bug.
    """
    image_body = (
        "<< /Type /XObject /Subtype /Image /Width 4 /Height 4 "
        "/ColorSpace /DeviceGray /BitsPerComponent 8 /Length 7 0 R >>"
    )
    image_obj = (
        b"4 0 obj\n" + image_body.encode("ascii") + b"\nstream\n" + IMAGE_A0 + b"\nendstream\nendobj\n"
    )
    pdf_bytes = b"".join(
        [
            b"%PDF-1.4\n",
            _dict_object(1, "<< /Type /Catalog /Pages 2 0 R >>"),
            _dict_object(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>"),
            _page_object(3, 2, {"Im0": 4}, 5),
            image_obj,
            _content_object(5, ["Im0"]),
            # Deliberately no object 7: this parser never resolves indirect
            # /Length references, so it must never even try to look one up.
            b"%%EOF\n",
        ]
    )
    images = extract_pdf_images(pdf_bytes)
    assert len(images) == 1
    assert images[0].data == IMAGE_A0


def test_non_dictionary_indirect_object_is_skipped_not_fatal() -> None:
    """A perfectly valid PDF may hold indirect objects that are not
    dictionaries — most commonly a bare integer used as the target of
    another object's indirect /Length (production bug: `object N is not a
    dictionary`, one object number after the indirect-/Length fallback
    above). This parser never resolves indirect references by number, so
    such an object is simply irrelevant noise and must be skipped, not
    treated as document corruption.
    """
    image_body = (
        "<< /Type /XObject /Subtype /Image /Width 4 /Height 4 "
        "/ColorSpace /DeviceGray /BitsPerComponent 8 /Length 7 0 R >>"
    )
    image_obj = (
        b"4 0 obj\n" + image_body.encode("ascii") + b"\nstream\n" + IMAGE_A0 + b"\nendstream\nendobj\n"
    )
    pdf_bytes = b"".join(
        [
            b"%PDF-1.4\n",
            _dict_object(1, "<< /Type /Catalog /Pages 2 0 R >>"),
            _dict_object(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>"),
            _page_object(3, 2, {"Im0": 4}, 5),
            image_obj,
            _content_object(5, ["Im0"]),
            b"7 0 obj\n16\nendobj\n",  # bare integer, not a dictionary
            b"%%EOF\n",
        ]
    )
    images = extract_pdf_images(pdf_bytes)
    assert len(images) == 1
    assert images[0].data == IMAGE_A0


def test_chained_flate_then_dct_filter_is_decoded() -> None:
    """A JPEG XObject is sometimes additionally Flate-wrapped by the PDF
    writer: /Filter [/FlateDecode /DCTDecode]. Filters apply in listed
    order — undo Flate first, then the DCT (JPEG) bytes are the final,
    self-contained payload with nothing left to decode. The production bug
    (`unsupported stream filter ['FlateDecode', 'DCTDecode']`) came from
    treating any array /Filter as a single unsupported value.
    """
    fake_jpeg = bytes(range(0x80, 0x90)) * 4  # stand-in DCT payload
    compressed = zlib.compress(fake_jpeg)
    image_body = (
        "<< /Type /XObject /Subtype /Image /Width 4 /Height 4 "
        f"/Filter [/FlateDecode /DCTDecode] /Length {len(compressed)} >>"
    )
    image_obj = (
        b"4 0 obj\n" + image_body.encode("ascii") + b"\nstream\n" + compressed + b"\nendstream\nendobj\n"
    )
    pdf_bytes = b"".join(
        [
            b"%PDF-1.4\n",
            _dict_object(1, "<< /Type /Catalog /Pages 2 0 R >>"),
            _dict_object(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>"),
            _page_object(3, 2, {"Im0": 4}, 5),
            image_obj,
            _content_object(5, ["Im0"]),
            b"%%EOF\n",
        ]
    )
    images = extract_pdf_images(pdf_bytes)
    assert len(images) == 1
    assert images[0].data == fake_jpeg
    assert images[0].mime_type == "image/jpeg"


def test_flate_rgb_image_with_soft_mask_is_encoded_as_valid_rgba_png() -> None:
    """Raw Flate samples must never be sent to Gemini under an image/jpeg MIME."""
    rgb = bytes((255, 0, 0, 0, 255, 0))  # two pixels: red then green
    alpha = bytes((255, 0))
    compressed_rgb = zlib.compress(rgb)
    compressed_alpha = zlib.compress(alpha)
    parts = [b"%PDF-1.4\n"]
    parts.append(_dict_object(1, "<< /Type /Catalog /Pages 2 0 R >>"))
    parts.append(_dict_object(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>"))
    parts.append(_page_object(3, 2, {"Im0": 4}, 6))
    parts.append(
        b"4 0 obj\n"
        + (
            f"<< /Type /XObject /Subtype /Image /Width 2 /Height 1 /ColorSpace /DeviceRGB "
            f"/BitsPerComponent 8 /Filter /FlateDecode /SMask 5 0 R /Length {len(compressed_rgb)} >>\n"
        ).encode("ascii")
        + b"stream\n"
        + compressed_rgb
        + b"\nendstream\nendobj\n"
    )
    parts.append(
        b"5 0 obj\n"
        + (
            f"<< /Type /XObject /Subtype /Image /Width 2 /Height 1 /ColorSpace /DeviceGray "
            f"/BitsPerComponent 8 /Filter /FlateDecode /Length {len(compressed_alpha)} >>\n"
        ).encode("ascii")
        + b"stream\n"
        + compressed_alpha
        + b"\nendstream\nendobj\n"
    )
    parts.append(_content_object(6, ["Im0"]))
    parts.append(b"%%EOF\n")

    pdf_bytes = b"".join(parts)
    images = extract_pdf_images(pdf_bytes)

    assert len(images) == 1
    image = images[0]
    assert image.mime_type == "image/png"
    assert image.data.startswith(b"\x89PNG\r\n\x1a\n")

    # Decode the sole IDAT chunk: filter byte + two RGBA pixels.
    offset = 8
    idat = b""
    while offset < len(image.data):
        length = struct.unpack(">I", image.data[offset : offset + 4])[0]
        kind = image.data[offset + 4 : offset + 8]
        payload = image.data[offset + 8 : offset + 8 + length]
        if kind == b"IDAT":
            idat += payload
        offset += 12 + length
    assert zlib.decompress(idat) == b"\x00\xff\x00\x00\xff\x00\xff\x00\x00"

    manifest = build_manifest(pdf_bytes)
    assert manifest.entries[0].mime_type == "image/png"
    assert manifest.entries[0].image_data == image.data


def test_invalid_pdf_error_rejects_non_bytes_input() -> None:
    with pytest.raises(PdfExtractionError):
        extract_pdf_images("not-bytes")  # type: ignore[arg-type]


def test_invalid_pdf_never_produces_a_partial_manifest() -> None:
    corrupt = b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R\n%%EOF\n"
    with pytest.raises(PdfExtractionError):
        build_manifest(corrupt)


# ---------------------------------------------------------------------------
# S2/acceptance: section grouping — unique assignment, PDF order, replay stability
# ---------------------------------------------------------------------------


def test_group_entries_by_section_unique_assignment_and_order() -> None:
    pdf_bytes = _build_two_page_pdf([IMAGE_A0, IMAGE_A1], [IMAGE_B0])

    def _label_by_page(image: ExtractedImage) -> str:
        return "cover" if image.page_index == 0 else "gallery"

    manifest = build_manifest(pdf_bytes, _label_by_page)

    # Every entry appears in exactly one group.
    grouped_ids = [entry.image_id for group in manifest.groups for entry in group.entries]
    assert sorted(grouped_ids) == sorted(entry.image_id for entry in manifest.entries)
    assert len(grouped_ids) == len(set(grouped_ids))

    # Groups appear in first-seen order and preserve PDF (page, occurrence) order within each group.
    assert [group.section for group in manifest.groups] == ["cover", "gallery"]
    cover_positions = [(e.page_index, e.occurrence_index) for e in manifest.groups[0].entries]
    assert cover_positions == sorted(cover_positions)
    assert cover_positions == [(0, 0), (0, 1)]
    assert [(e.page_index, e.occurrence_index) for e in manifest.groups[1].entries] == [(1, 0)]


def test_group_entries_by_section_replay_is_value_equal() -> None:
    pdf_bytes = _build_two_page_pdf([IMAGE_A0, IMAGE_A1], [IMAGE_B0])

    def _label_by_page(image: ExtractedImage) -> str:
        return "cover" if image.page_index == 0 else "gallery"

    manifest_first = build_manifest(pdf_bytes, _label_by_page)
    manifest_second = build_manifest(pdf_bytes, _label_by_page)
    assert manifest_first.groups == manifest_second.groups
    assert group_entries_by_section(manifest_first.entries) == manifest_first.groups


def test_group_entries_by_section_default_fallback_classifier() -> None:
    # No strategy injected: pdf_image_extractor's own content-derived fallback
    # still produces a well-formed, exhaustive grouping.
    pdf_bytes = _build_two_page_pdf([IMAGE_A0], [IMAGE_A0])
    manifest = build_manifest(pdf_bytes)
    assert sum(len(group.entries) for group in manifest.groups) == len(manifest.entries)
    # Same content at two positions gets the same default label, so it lands in one group.
    assert len(manifest.groups) == 1
    assert len(manifest.groups[0].entries) == 2


def test_group_entries_by_section_empty_manifest() -> None:
    pdf_bytes = _build_two_page_pdf([], [])
    manifest = build_manifest(pdf_bytes)
    assert manifest.groups == ()


# ---------------------------------------------------------------------------
# S1/S4 acceptance: injectable Gemini Flash classifier — one call per image,
# strict single-label JSON, suggested categories, bounded retry/backoff,
# definitive rejection of invalid responses — no real network call.
# ---------------------------------------------------------------------------


class _FakeGeminiTransport:
    """Deterministic in-memory ``GeminiClassifierTransport`` double: no network I/O."""

    def __init__(self, responses_by_digest: dict[str, list[str]]) -> None:
        self._responses_by_digest = {k: list(v) for k, v in responses_by_digest.items()}
        self.calls: list[str] = []

    def classify(self, image: ExtractedImage, prompt: str, timeout: float) -> str:
        assert isinstance(prompt, str) and prompt.strip()
        assert timeout > 0
        self.calls.append(image.content_digest)
        queue = self._responses_by_digest[image.content_digest]
        response = queue.pop(0)
        if isinstance(response, Exception):
            raise response
        return response


def test_gemini_classifier_sends_each_image_exactly_once() -> None:
    pdf_bytes = _build_two_page_pdf([IMAGE_A0, IMAGE_A1], [IMAGE_B0])
    images = extract_pdf_images(pdf_bytes)

    transport = _FakeGeminiTransport(
        {
            images[0].content_digest: ['{"section": "exterior"}'],
            images[1].content_digest: ['{"section": "interior"}'],
            images[2].content_digest: ['{"section": "cockpit-lounge"}'],
        }
    )
    classify = make_gemini_flash_classifier(transport)
    manifest = build_manifest(pdf_bytes, classify)

    assert [entry.section for entry in manifest.entries] == ["exterior", "interior", "cockpit-lounge"]
    # Exactly one transport call per distinct image — never re-classified.
    assert transport.calls == [images[0].content_digest, images[1].content_digest, images[2].content_digest]


def test_gemini_classifier_prefers_suggested_categories_but_accepts_free_form() -> None:
    prompt = build_classification_prompt()
    assert len(SUGGESTED_SECTION_CATEGORIES) == 5
    for category in SUGGESTED_SECTION_CATEGORIES:
        assert category in prompt
    assert "Brokerage Logo/Branding" in prompt

    pdf_bytes = _single_image_pdf(IMAGE_A0)
    images = extract_pdf_images(pdf_bytes)

    # A suggested business category round-trips unchanged.
    suggested = SUGGESTED_SECTION_CATEGORIES[0]
    transport = _FakeGeminiTransport({images[0].content_digest: [json.dumps({"section": suggested})]})
    classify = make_gemini_flash_classifier(transport)
    assert classify(images[0]) == suggested

    # A relevant free-form label outside the suggested five is accepted too.
    transport = _FakeGeminiTransport({images[0].content_digest: ['{"section": "helipad"}']})
    classify = make_gemini_flash_classifier(transport)
    assert classify(images[0]) == "helipad"


def test_gemini_classifier_rejects_malformed_response_without_retry() -> None:
    pdf_bytes = _single_image_pdf(IMAGE_A0)
    images = extract_pdf_images(pdf_bytes)

    for bad_response in ["not json", '{"section": ""}', "{}", '{"section": "a", "extra": "b"}', '{"section": 5}']:
        transport = _FakeGeminiTransport({images[0].content_digest: [bad_response]})
        classify = make_gemini_flash_classifier(transport)
        with pytest.raises(GeminiClassificationError):
            classify(images[0])
        # A definitive (non-transient) rejection is never retried.
        assert transport.calls == [images[0].content_digest]


def test_gemini_classifier_retries_transient_failures_then_succeeds() -> None:
    pdf_bytes = _single_image_pdf(IMAGE_A0)
    images = extract_pdf_images(pdf_bytes)
    transport = _FakeGeminiTransport(
        {
            images[0].content_digest: [
                ClassificationTransientError("rate_limited"),
                ClassificationTransientError("rate_limited"),
                '{"section": "exterior"}',
            ]
        }
    )
    sleeps: list[float] = []
    classify = make_gemini_flash_classifier(
        transport,
        settings=ClassificationSettings(max_retries=3, backoff_base_s=0.01, backoff_cap_s=0.05),
        sleep=sleeps.append,
        rand=lambda: 0.0,
    )
    assert classify(images[0]) == "exterior"
    assert len(transport.calls) == 3
    assert len(sleeps) == 2


def test_gemini_classifier_definitive_after_retries_exhausted() -> None:
    pdf_bytes = _single_image_pdf(IMAGE_A0)
    images = extract_pdf_images(pdf_bytes)
    transport = _FakeGeminiTransport(
        {
            images[0].content_digest: [
                ClassificationTransientError("rate_limited"),
                ClassificationTransientError("rate_limited"),
                ClassificationTransientError("rate_limited"),
            ]
        }
    )
    classify = make_gemini_flash_classifier(
        transport,
        settings=ClassificationSettings(max_retries=2, backoff_base_s=0.01, backoff_cap_s=0.05),
        sleep=lambda _s: None,
        rand=lambda: 0.0,
    )
    with pytest.raises(ClassificationTransientError):
        classify(images[0])
    # max_retries=2 caps at 3 total attempts (1 initial + 2 retries), never a 4th.
    assert len(transport.calls) == 3


def test_gemini_classifier_wired_into_manifest_grouping() -> None:
    pdf_bytes = _build_two_page_pdf([IMAGE_A0, IMAGE_A1], [IMAGE_B0])
    images = extract_pdf_images(pdf_bytes)
    transport = _FakeGeminiTransport(
        {
            images[0].content_digest: ['{"section": "exterior"}'],
            images[1].content_digest: ['{"section": "interior"}'],
            images[2].content_digest: ['{"section": "exterior"}'],
        }
    )
    classify = make_gemini_flash_classifier(transport)

    manifest_first = build_manifest(pdf_bytes, classify)
    transport_replay = _FakeGeminiTransport(
        {
            images[0].content_digest: ['{"section": "exterior"}'],
            images[1].content_digest: ['{"section": "interior"}'],
            images[2].content_digest: ['{"section": "exterior"}'],
        }
    )
    manifest_second = build_manifest(pdf_bytes, make_gemini_flash_classifier(transport_replay))

    assert manifest_first == manifest_second
    assert [group.section for group in manifest_first.groups] == ["exterior", "interior"]
    assert len(manifest_first.groups[0].entries) == 2
    assert len(manifest_first.groups[1].entries) == 1
