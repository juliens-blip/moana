"""Deterministic PDF image extraction with injectable, content-driven sections.

Reads embedded image XObjects from a PDF, in page order and content-stream
occurrence order, and assembles a replayable manifest: same bytes in always
produce the same order, the same document-derived identifiers and the same
manifest out. Classification into sections is a pure injection point
(``classify_image``'s ``strategy`` argument) — this module never hardcodes a
section taxonomy; its own fallback label is derived only from the extracted
image bytes.

No PDF library is added here (none is requested by the plan, and none of
``pypdf``/``PyMuPDF`` is installed in this environment): objects are located
by scanning for indirect object markers (``N G obj`` … ``endobj``) directly,
the same recovery strategy tolerant PDF readers fall back to when a
cross-reference table is missing or broken. This keeps parsing dependency-free
and fully deterministic, at the cost of not supporting compressed object
streams (PDF 1.5+ ``/Type /ObjStm``) or encrypted documents — both are out of
scope for this worker's contract.

Veo generation, ffmpeg assembly, Supabase Storage/SQL and GEMINI_API_KEY
validation are handled by the neighboring workers (see
``workers/startup_checks.py``, ``workers/job_contract.py``); this module only
turns PDF bytes into an ordered, idempotent image manifest.
"""

from __future__ import annotations

import hashlib
import re
import struct
import zlib
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from typing import Any


class PdfExtractionError(ValueError):
    """Raised when the given bytes cannot be parsed as an extractable PDF."""


@dataclass(frozen=True)
class _Ref:
    number: int


@dataclass(frozen=True)
class _PdfObject:
    number: int
    generation: int
    value: Any
    stream: bytes | None


@dataclass(frozen=True)
class ExtractedImage:
    """One image XObject, positioned by page and by occurrence within it."""

    page_index: int
    occurrence_index: int
    object_number: int
    data: bytes
    width: int | None
    height: int | None
    color_space: str | None
    content_digest: str
    mime_type: str = "image/jpeg"


@dataclass(frozen=True)
class ManifestEntry:
    image_id: str
    page_index: int
    occurrence_index: int
    section: str
    content_digest: str
    byte_length: int
    image_data: bytes = b""
    mime_type: str = "image/jpeg"


@dataclass(frozen=True)
class SectionGroup:
    """One section's entries, in their original page/occurrence order."""

    section: str
    entries: tuple[ManifestEntry, ...]


@dataclass(frozen=True)
class PdfImageManifest:
    document_digest: str
    entries: tuple[ManifestEntry, ...]
    groups: tuple[SectionGroup, ...] = ()


ClassifierStrategy = Callable[[ExtractedImage], str]


_HEADER_RE = re.compile(rb"%PDF-\d+\.\d+")
_OBJ_RE = re.compile(rb"(?P<num>\d+)\s+(?P<gen>\d+)\s+obj")
_STREAM_KW = b"stream"
_ENDSTREAM_KW = b"endstream"
_REF_RE = re.compile(rb"(\d+)\s+(\d+)\s+R(?![A-Za-z0-9])")
# PDF numbers may omit the leading zero (for example ``.00`` in a
# transformation matrix), which is valid PDF syntax.
_NUM_RE = re.compile(rb"[+-]?(?:\d+\.\d+|\.\d+|\d+)")
_NAME_RE = re.compile(rb"/([A-Za-z0-9_.+#-]+)")
_DO_OP_RE = re.compile(rb"/([A-Za-z0-9_.+#-]+)\s+Do\b")

_MAX_PAGE_TREE_DEPTH = 32


# ---------------------------------------------------------------------------
# Minimal PDF object scanner (dependency-free, xref-independent)
# ---------------------------------------------------------------------------


def _skip_ws(data: bytes, pos: int) -> int:
    n = len(data)
    while pos < n:
        char = data[pos : pos + 1]
        if char in b" \t\r\n\f\x00":
            pos += 1
            continue
        if char == b"%":
            end = data.find(b"\n", pos)
            pos = end + 1 if end != -1 else n
            continue
        break
    return pos


def _parse_value(data: bytes, pos: int) -> tuple[Any, int]:
    pos = _skip_ws(data, pos)
    if data.startswith(b"<<", pos):
        return _parse_dict(data, pos)
    if data.startswith(b"[", pos):
        return _parse_array(data, pos)
    if data.startswith(b"(", pos):
        return _parse_literal_string(data, pos)
    if data.startswith(b"<", pos):
        return _parse_hex_string(data, pos)
    if data.startswith(b"/", pos):
        match = _NAME_RE.match(data, pos)
        if not match:
            raise PdfExtractionError(f"malformed name token at offset {pos}")
        return match.group(1).decode("latin-1"), match.end()
    match = _REF_RE.match(data, pos)
    if match:
        return _Ref(int(match.group(1))), match.end()
    match = _NUM_RE.match(data, pos)
    if match:
        text = match.group(0)
        value: Any = float(text) if b"." in text else int(text)
        return value, match.end()
    if data.startswith(b"true", pos):
        return True, pos + 4
    if data.startswith(b"false", pos):
        return False, pos + 5
    if data.startswith(b"null", pos):
        return None, pos + 4
    raise PdfExtractionError(f"unsupported PDF token at offset {pos}")


def _parse_literal_string(data: bytes, pos: int) -> tuple[str, int]:
    """Parse a PDF literal string, including escaped/nested parentheses."""
    pos += 1  # consume "("
    depth = 1
    result = bytearray()
    while pos < len(data):
        char = data[pos]
        pos += 1
        if char == ord("\\"):
            if pos >= len(data):
                break
            escaped = data[pos]
            pos += 1
            escapes = {
                ord("n"): ord("\n"), ord("r"): ord("\r"), ord("t"): ord("\t"),
                ord("b"): ord("\b"), ord("f"): ord("\f"),
            }
            if escaped in escapes:
                result.append(escapes[escaped])
            elif escaped in (ord("("), ord(")"), ord("\\")):
                result.append(escaped)
            elif 48 <= escaped <= 55:
                octal = bytes([escaped])
                while len(octal) < 3 and pos < len(data) and 48 <= data[pos] <= 55:
                    octal += bytes([data[pos]])
                    pos += 1
                result.append(int(octal, 8))
            elif escaped in (ord("\n"), ord("\r")):
                if escaped == ord("\r") and pos < len(data) and data[pos] == ord("\n"):
                    pos += 1
            else:
                result.append(escaped)
        elif char == ord("("):
            depth += 1
            result.append(char)
        elif char == ord(")"):
            depth -= 1
            if depth == 0:
                return result.decode("latin-1"), pos
            result.append(char)
        else:
            result.append(char)
    raise PdfExtractionError("unterminated PDF literal string")


def _parse_hex_string(data: bytes, pos: int) -> tuple[str, int]:
    """Parse a PDF hexadecimal string (``<...>``), padded when necessary."""
    pos += 1  # consume "<"
    end = data.find(b">", pos)
    if end == -1:
        raise PdfExtractionError("unterminated PDF hexadecimal string")
    raw = re.sub(rb"\s+", b"", data[pos:end])
    if len(raw) % 2:
        raw += b"0"
    try:
        return bytes.fromhex(raw.decode("ascii")).decode("latin-1"), end + 1
    except (UnicodeDecodeError, ValueError) as exc:
        raise PdfExtractionError("malformed PDF hexadecimal string") from exc


def _parse_dict(data: bytes, pos: int) -> tuple[dict[str, Any], int]:
    pos += 2  # consume "<<"
    result: dict[str, Any] = {}
    while True:
        pos = _skip_ws(data, pos)
        if data.startswith(b">>", pos):
            return result, pos + 2
        if pos >= len(data):
            raise PdfExtractionError("unterminated PDF dictionary")
        match = _NAME_RE.match(data, pos)
        if not match:
            raise PdfExtractionError(f"expected dictionary key at offset {pos}")
        key = match.group(1).decode("latin-1")
        value, pos = _parse_value(data, match.end())
        result[key] = value


def _parse_array(data: bytes, pos: int) -> tuple[list[Any], int]:
    pos += 1  # consume "["
    items: list[Any] = []
    while True:
        pos = _skip_ws(data, pos)
        if data.startswith(b"]", pos):
            return items, pos + 1
        if pos >= len(data):
            raise PdfExtractionError("unterminated PDF array")
        value, pos = _parse_value(data, pos)
        items.append(value)


def _parse_objects(data: bytes) -> dict[int, _PdfObject]:
    objects: dict[int, _PdfObject] = {}
    for match in _OBJ_RE.finditer(data):
        num = int(match.group("num"))
        gen = int(match.group("gen"))
        pos = _skip_ws(data, match.end())
        if not data.startswith(b"<<", pos):
            # A perfectly valid PDF may hold plenty of indirect objects that
            # are not dictionaries — most commonly a bare integer used as the
            # target of another object's indirect /Length (see the fallback
            # above). This parser never resolves indirect references by
            # number, so such objects are never looked up; skip them instead
            # of treating a document-wide-normal pattern as corruption.
            continue
        value, pos = _parse_dict(data, pos)
        pos = _skip_ws(data, pos)
        stream_bytes: bytes | None = None
        if data.startswith(_STREAM_KW, pos):
            pos += len(_STREAM_KW)
            if data.startswith(b"\r\n", pos):
                pos += 2
            elif data.startswith(b"\n", pos):
                pos += 1
            else:
                raise PdfExtractionError(f"object {num} stream keyword not followed by EOL")
            length = value.get("Length")
            if isinstance(length, int):
                stream_bytes = data[pos : pos + length]
                pos = _skip_ws(data, pos + length)
                if not data.startswith(_ENDSTREAM_KW, pos):
                    raise PdfExtractionError(f"object {num} stream length does not match its endstream marker")
            else:
                # /Length is an indirect reference (e.g. "45 0 R") or missing.
                # This single-pass parser never resolves indirect references
                # (the referenced object may not be parsed yet) — same
                # recovery strategy tolerant PDF readers fall back to: locate
                # the literal "endstream" marker instead of trusting a count.
                marker_pos = data.find(_ENDSTREAM_KW, pos)
                if marker_pos == -1:
                    raise PdfExtractionError(f"object {num} stream has no endstream marker")
                stream_bytes = data[pos:marker_pos]
                # The spec requires a single EOL before "endstream" that is
                # not part of the stream payload; strip it if present.
                if stream_bytes.endswith(b"\r\n"):
                    stream_bytes = stream_bytes[:-2]
                elif stream_bytes.endswith((b"\n", b"\r")):
                    stream_bytes = stream_bytes[:-1]
        objects[num] = _PdfObject(num, gen, value, stream_bytes)
    if not objects:
        raise PdfExtractionError("no PDF objects found")

    # PDF 1.5+ files may store page-tree dictionaries inside compressed
    # object streams. Expand those dictionaries so the xref-independent
    # recovery parser can resolve /Pages and /Kids like regular objects.
    for container in tuple(objects.values()):
        if not isinstance(container.value, dict) or container.value.get("Type") != "ObjStm" or container.stream is None:
            continue
        decoded = _decode_stream(container.value, container.stream)
        count = container.value.get("N")
        first = container.value.get("First")
        if not isinstance(count, int) or not isinstance(first, int) or count < 0 or first < 0:
            raise PdfExtractionError(f"object stream {container.number} has an invalid header")
        header_pos = 0
        entries: list[tuple[int, int]] = []
        for _ in range(count):
            header_pos = _skip_ws(decoded, header_pos)
            number_match = re.match(rb"\d+", decoded[header_pos:])
            if number_match is None:
                raise PdfExtractionError(f"object stream {container.number} has a malformed object number")
            object_number = int(number_match.group(0))
            header_pos += number_match.end()
            header_pos = _skip_ws(decoded, header_pos)
            offset_match = re.match(rb"\d+", decoded[header_pos:])
            if offset_match is None:
                raise PdfExtractionError(f"object stream {container.number} has a malformed object offset")
            entries.append((object_number, first + int(offset_match.group(0))))
            header_pos += offset_match.end()
        for index, (object_number, value_start) in enumerate(entries):
            value_end = entries[index + 1][1] if index + 1 < len(entries) else len(decoded)
            value_start = _skip_ws(decoded, value_start)
            value, _ = _parse_value(decoded[:value_end], value_start)
            objects[object_number] = _PdfObject(object_number, 0, value, None)
    return objects


def _validate_header(data: bytes) -> None:
    if not data or _HEADER_RE.search(data[:2048]) is None:
        raise PdfExtractionError("missing or invalid %PDF- header")


# ---------------------------------------------------------------------------
# Page tree and content-stream resolution
# ---------------------------------------------------------------------------


def _find_pages_root(objects: Mapping[int, _PdfObject]) -> int:
    for obj in objects.values():
        if isinstance(obj.value, dict) and obj.value.get("Type") == "Catalog":
            pages_ref = obj.value.get("Pages")
            if isinstance(pages_ref, _Ref):
                return pages_ref.number
    referenced: set[int] = set()
    pages_nums: list[int] = []
    for obj in objects.values():
        if isinstance(obj.value, dict) and obj.value.get("Type") == "Pages":
            pages_nums.append(obj.number)
            for kid in obj.value.get("Kids", []) or []:
                if isinstance(kid, _Ref):
                    referenced.add(kid.number)
    candidates = [n for n in pages_nums if n not in referenced]
    if len(candidates) == 1:
        return candidates[0]
    raise PdfExtractionError("could not locate a unique /Pages root")


def _collect_page_order(
    objects: Mapping[int, _PdfObject],
    node_number: int,
    visited: set[int],
    depth: int,
) -> list[int]:
    if depth > _MAX_PAGE_TREE_DEPTH:
        raise PdfExtractionError("page tree exceeds maximum supported depth")
    if node_number in visited:
        raise PdfExtractionError("cyclic page tree detected")
    visited.add(node_number)
    node = objects.get(node_number)
    if node is None or not isinstance(node.value, dict):
        raise PdfExtractionError(f"missing page tree node object {node_number}")
    node_type = node.value.get("Type")
    if node_type == "Page":
        return [node_number]
    if node_type != "Pages":
        raise PdfExtractionError(f"unexpected node type {node_type!r} in page tree")
    kids = node.value.get("Kids")
    if not isinstance(kids, list):
        raise PdfExtractionError(f"/Pages object {node_number} is missing its /Kids array")
    ordered: list[int] = []
    for kid in kids:
        if not isinstance(kid, _Ref):
            raise PdfExtractionError(f"/Pages object {node_number} has a malformed /Kids entry")
        ordered.extend(_collect_page_order(objects, kid.number, visited, depth + 1))
    return ordered


def _decode_one_filter(filt: Any, raw: bytes) -> bytes:
    if filt == "FlateDecode":
        try:
            return zlib.decompress(raw)
        except zlib.error as exc:
            raise PdfExtractionError(f"failed to inflate FlateDecode stream: {exc}") from exc
    if filt in ("DCTDecode", "JPXDecode"):
        return raw  # already a self-contained image codec payload
    raise PdfExtractionError(f"unsupported stream filter {filt!r}")


def _decode_stream(obj_value: dict[str, Any], raw: bytes) -> bytes:
    filt = obj_value.get("Filter")
    if filt is None:
        return raw
    # /Filter may be a single name or an array applied in listed order (e.g.
    # a JPEG additionally Flate-wrapped: [/FlateDecode /DCTDecode] — undo
    # Flate first, then hand the resulting DCT bytes through unchanged).
    filters = filt if isinstance(filt, list) else [filt]
    for one in filters:
        raw = _decode_one_filter(one, raw)
    return raw


def _filter_chain(obj_value: Mapping[str, Any]) -> tuple[str, ...]:
    filt = obj_value.get("Filter")
    if isinstance(filt, str):
        return (filt,)
    if isinstance(filt, list) and all(isinstance(item, str) for item in filt):
        return tuple(filt)
    return ()


def _png_chunk(kind: bytes, payload: bytes) -> bytes:
    checksum = zlib.crc32(kind)
    checksum = zlib.crc32(payload, checksum) & 0xFFFFFFFF
    return struct.pack(">I", len(payload)) + kind + payload + struct.pack(">I", checksum)


def _encode_png(width: int, height: int, samples: bytes, components: int) -> bytes:
    """Encode unpacked 8-bit Gray/RGB/GrayA/RGBA samples as a valid PNG."""
    color_type_by_components = {1: 0, 2: 4, 3: 2, 4: 6}
    color_type = color_type_by_components.get(components)
    if color_type is None:
        raise PdfExtractionError(f"cannot encode PNG with {components} color components")
    row_bytes = width * components
    if len(samples) != row_bytes * height:
        raise PdfExtractionError(
            f"raw image sample length mismatch: expected {row_bytes * height}, got {len(samples)}"
        )
    scanlines = b"".join(
        b"\x00" + samples[offset : offset + row_bytes]
        for offset in range(0, len(samples), row_bytes)
    )
    signature = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", width, height, 8, color_type, 0, 0, 0)
    return (
        signature
        + _png_chunk(b"IHDR", ihdr)
        + _png_chunk(b"IDAT", zlib.compress(scanlines))
        + _png_chunk(b"IEND", b"")
    )


def _color_component_count(objects: Mapping[int, _PdfObject], color_space: Any) -> int:
    if isinstance(color_space, _Ref):
        referenced = objects.get(color_space.number)
        color_space = referenced.value if referenced is not None else None
    if color_space in ("DeviceGray", "G"):
        return 1
    if color_space in ("DeviceRGB", "RGB"):
        return 3
    if color_space in ("DeviceCMYK", "CMYK"):
        return 4
    if isinstance(color_space, list) and color_space:
        if color_space[0] == "ICCBased" and len(color_space) >= 2:
            profile = color_space[1]
            if isinstance(profile, _Ref):
                profile_obj = objects.get(profile.number)
                profile = profile_obj.value if profile_obj is not None else None
            if isinstance(profile, dict) and profile.get("N") in (1, 3, 4):
                return profile["N"]
    raise PdfExtractionError(f"unsupported raw image color space {color_space!r}")


def _raw_image_samples(
    objects: Mapping[int, _PdfObject], obj_value: Mapping[str, Any], decoded: bytes
) -> tuple[int, int, int, bytes]:
    width = obj_value.get("Width")
    height = obj_value.get("Height")
    bits = obj_value.get("BitsPerComponent")
    if not isinstance(width, int) or not isinstance(height, int) or width <= 0 or height <= 0:
        raise PdfExtractionError("raw image has invalid dimensions")
    if bits != 8:
        raise PdfExtractionError(f"unsupported raw image BitsPerComponent {bits!r}")
    decode_parms = obj_value.get("DecodeParms")
    if isinstance(decode_parms, dict) and decode_parms.get("Predictor", 1) != 1:
        raise PdfExtractionError("raw FlateDecode images with predictors are not supported")
    components = _color_component_count(objects, obj_value.get("ColorSpace"))
    expected = width * height * components
    if len(decoded) != expected:
        raise PdfExtractionError(f"raw image sample length mismatch: expected {expected}, got {len(decoded)}")
    return width, height, components, decoded


def _cmyk_to_rgb(samples: bytes) -> bytes:
    rgb = bytearray()
    for offset in range(0, len(samples), 4):
        c, m, y, k = samples[offset : offset + 4]
        rgb.extend((255 - min(255, c + k), 255 - min(255, m + k), 255 - min(255, y + k)))
    return bytes(rgb)


def _extract_image_payload(
    objects: Mapping[int, _PdfObject], obj_value: dict[str, Any], raw_stream: bytes
) -> tuple[bytes, str]:
    """Return self-contained image bytes and their truthful media type.

    DCT/JPX streams are already encoded files. A plain FlateDecode image is
    only unpacked pixel samples, not a JPEG; encode those samples as PNG so
    Gemini and FFmpeg never receive raw bytes falsely labelled image/jpeg.
    """
    decoded = _decode_stream(obj_value, raw_stream)
    filters = _filter_chain(obj_value)
    if "DCTDecode" in filters:
        return decoded, "image/jpeg"
    if "JPXDecode" in filters:
        return decoded, "image/jp2"
    if "FlateDecode" not in filters:
        # Preserve the historical contract for unfiltered hand-built fixtures.
        return decoded, "image/jpeg"

    width, height, components, samples = _raw_image_samples(objects, obj_value, decoded)
    if components == 4:
        samples = _cmyk_to_rgb(samples)
        components = 3

    smask = obj_value.get("SMask")
    if isinstance(smask, _Ref):
        mask_obj = objects.get(smask.number)
        if mask_obj is None or not isinstance(mask_obj.value, dict) or mask_obj.stream is None:
            raise PdfExtractionError(f"image soft mask object {smask.number} is missing")
        # A soft mask may itself be a JPEG/JPX stream. Decoding that codec is
        # deliberately outside this dependency-free parser; the RGB payload
        # remains a truthful, valid PNG without it. Raw Flate masks can be
        # interleaved losslessly and preserve transparency.
        mask_filters = _filter_chain(mask_obj.value)
        if "DCTDecode" not in mask_filters and "JPXDecode" not in mask_filters:
            mask_decoded = _decode_stream(mask_obj.value, mask_obj.stream)
            mask_width, mask_height, mask_components, alpha = _raw_image_samples(
                objects, mask_obj.value, mask_decoded
            )
            if (mask_width, mask_height, mask_components) != (width, height, 1):
                raise PdfExtractionError("image soft mask dimensions or color space do not match")
            if mask_obj.value.get("Decode") == [1, 0]:
                alpha = bytes(255 - value for value in alpha)
            interleaved = bytearray()
            for pixel in range(width * height):
                start = pixel * components
                interleaved.extend(samples[start : start + components])
                interleaved.append(alpha[pixel])
            samples = bytes(interleaved)
            components += 1

    return _encode_png(width, height, samples, components), "image/png"


def _resolve_dict(objects: Mapping[int, _PdfObject], value: Any) -> dict[str, Any] | None:
    if isinstance(value, _Ref):
        obj = objects.get(value.number)
        value = obj.value if obj is not None else None
    return value if isinstance(value, dict) else None


def _page_xobject_map(objects: Mapping[int, _PdfObject], page_value: dict[str, Any]) -> dict[str, int]:
    resources = _resolve_dict(objects, page_value.get("Resources"))
    if resources is None:
        return {}
    xobjects = _resolve_dict(objects, resources.get("XObject"))
    if xobjects is None:
        return {}
    return {name: ref.number for name, ref in xobjects.items() if isinstance(ref, _Ref)}


def _page_content_bytes(objects: Mapping[int, _PdfObject], page_value: dict[str, Any]) -> bytes:
    contents = page_value.get("Contents")
    if isinstance(contents, _Ref):
        refs = [contents]
    elif isinstance(contents, list):
        refs = [item for item in contents if isinstance(item, _Ref)]
    else:
        return b""
    parts: list[bytes] = []
    for ref in refs:
        obj = objects.get(ref.number)
        if obj is None or obj.stream is None:
            raise PdfExtractionError(f"content stream object {ref.number} is missing its stream data")
        parts.append(_decode_stream(obj.value, obj.stream))
    return b"\n".join(parts)


def _ordered_xobject_names(content: bytes) -> list[str]:
    return [match.group(1).decode("latin-1") for match in _DO_OP_RE.finditer(content)]


def _collect_xobject_images(
    objects: Mapping[int, _PdfObject],
    obj_num: int,
    page_index: int,
    occurrence: int,
    active: set[int],
) -> tuple[list[ExtractedImage], int]:
    """Collect images through nested Form XObjects in drawing order."""
    if obj_num in active:
        raise PdfExtractionError(f"cyclic XObject reference detected at object {obj_num}")
    xobj = objects.get(obj_num)
    if xobj is None or not isinstance(xobj.value, dict):
        raise PdfExtractionError(f"XObject {obj_num} is missing")
    if xobj.value.get("Subtype") == "Image":
        if xobj.stream is None:
            raise PdfExtractionError(f"image XObject {obj_num} has no stream data")
        image_bytes, mime_type = _extract_image_payload(objects, xobj.value, xobj.stream)
        width = xobj.value.get("Width")
        height = xobj.value.get("Height")
        color_space = xobj.value.get("ColorSpace")
        return [ExtractedImage(
            page_index=page_index,
            occurrence_index=occurrence,
            object_number=obj_num,
            data=image_bytes,
            width=width if isinstance(width, int) else None,
            height=height if isinstance(height, int) else None,
            color_space=color_space if isinstance(color_space, str) else None,
            content_digest=hashlib.sha256(image_bytes).hexdigest(),
            mime_type=mime_type,
        )], occurrence + 1
    if xobj.value.get("Subtype") != "Form" or xobj.stream is None:
        return [], occurrence
    resources = _resolve_dict(objects, xobj.value.get("Resources"))
    if resources is None:
        return [], occurrence
    xobject_map = _resolve_dict(objects, resources.get("XObject"))
    if xobject_map is None:
        return [], occurrence
    images: list[ExtractedImage] = []
    active = {*active, obj_num}
    for name in _ordered_xobject_names(_decode_stream(xobj.value, xobj.stream)):
        ref = xobject_map.get(name)
        if isinstance(ref, _Ref):
            nested, occurrence = _collect_xobject_images(objects, ref.number, page_index, occurrence, active)
            images.extend(nested)
    return images, occurrence


# ---------------------------------------------------------------------------
# Public contract: extract_pdf_images / classify_image / build_manifest
# ---------------------------------------------------------------------------


def extract_pdf_images(pdf_bytes: bytes) -> tuple[ExtractedImage, ...]:
    """Parse ``pdf_bytes`` into images ordered by page, then by their ``Do``
    invocation order within that page's content stream.

    Raises ``PdfExtractionError`` for anything that is not a well-formed PDF
    (missing header, unbalanced objects, mismatched stream length, dangling
    references, cyclic or malformed page tree). A structurally valid PDF with
    zero images is not an error — it returns an empty tuple, distinct from a
    parsing failure.
    """
    if not isinstance(pdf_bytes, (bytes, bytearray)):
        raise PdfExtractionError(f"pdf_bytes must be bytes, got {type(pdf_bytes).__name__}")
    data = bytes(pdf_bytes)
    _validate_header(data)
    objects = _parse_objects(data)
    pages_root = _find_pages_root(objects)
    page_numbers = _collect_page_order(objects, pages_root, set(), 0)

    images: list[ExtractedImage] = []
    for page_index, page_num in enumerate(page_numbers):
        page_obj = objects[page_num]
        if not isinstance(page_obj.value, dict):
            raise PdfExtractionError(f"page object {page_num} is not a dictionary")
        xobject_map = _page_xobject_map(objects, page_obj.value)
        content = _page_content_bytes(objects, page_obj.value)
        occurrence = 0
        for name in _ordered_xobject_names(content):
            obj_num = xobject_map.get(name)
            if obj_num is None:
                continue  # referenced name is not a resource declared on this page
            nested, occurrence = _collect_xobject_images(objects, obj_num, page_index, occurrence, set())
            images.extend(nested)
    return tuple(images)


def _default_content_classifier(image: ExtractedImage) -> str:
    """Fallback label derived only from the extracted image's own bytes —
    never a fixed section name — so it stays pure, content-driven and
    replayable without imposing a taxonomy the caller never chose.
    """
    return f"section-{image.content_digest[:12]}"


def classify_image(image: ExtractedImage, strategy: ClassifierStrategy | None = None) -> str:
    """Classify a single extracted image into a free-form section label.

    ``strategy`` is the injection point: any pure ``ExtractedImage -> str``
    callable, e.g. a content-aware classifier supplied by the caller. Falls
    back to ``_default_content_classifier`` when no strategy is given. Never
    consults a hardcoded section list.
    """
    classifier = strategy if strategy is not None else _default_content_classifier
    label = classifier(image)
    if not isinstance(label, str) or not label.strip():
        raise PdfExtractionError("classifier strategy must return a non-empty string label")
    return label.strip()


def _derive_image_id(document_digest: str, page_index: int, occurrence_index: int) -> str:
    return f"{document_digest[:16]}:{page_index:04d}:{occurrence_index:04d}"


def group_entries_by_section(entries: tuple[ManifestEntry, ...]) -> tuple[SectionGroup, ...]:
    """Group ``entries`` by section without reordering or duplicating any of them.

    Every entry appears in exactly one group (its own ``section``); each
    group's entries keep their original page/occurrence order; groups
    themselves appear in the order their section was first seen. Grouping
    the same entries twice always yields the same value, which is what
    makes this a stable, replayable additional contract on top of the
    existing flat ``entries`` order downstream consumers already rely on.
    """
    order: list[str] = []
    buckets: dict[str, list[ManifestEntry]] = {}
    for entry in entries:
        if entry.section not in buckets:
            buckets[entry.section] = []
            order.append(entry.section)
        buckets[entry.section].append(entry)
    return tuple(SectionGroup(section=label, entries=tuple(buckets[label])) for label in order)


def build_manifest(pdf_bytes: bytes, strategy: ClassifierStrategy | None = None) -> PdfImageManifest:
    """Extract, classify and assemble the ordered, replayable manifest for
    ``pdf_bytes``. Calling this twice on identical bytes with the same
    ``strategy`` yields a value-equal manifest — same order, same ids, same
    labels, same section groups — which is this worker's idempotency
    contract downstream.
    """
    document_digest = hashlib.sha256(pdf_bytes).hexdigest()
    images = extract_pdf_images(pdf_bytes)
    entries = tuple(
        ManifestEntry(
            image_id=_derive_image_id(document_digest, image.page_index, image.occurrence_index),
            page_index=image.page_index,
            occurrence_index=image.occurrence_index,
            section=classify_image(image, strategy),
            content_digest=image.content_digest,
            byte_length=len(image.data),
            image_data=image.data,
            mime_type=image.mime_type,
        )
        for image in images
    )
    return PdfImageManifest(
        document_digest=document_digest,
        entries=entries,
        groups=group_entries_by_section(entries),
    )
