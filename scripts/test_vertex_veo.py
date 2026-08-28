"""Manual, non-destructive Vertex AI Veo smoke test.

Never run automatically — not by CI, not by ``validate_worker_startup``, not
by any test collection. Only invoked by hand:

    python3 scripts/test_vertex_veo.py --image path/to/photo.jpg

Generates one real (billed) clip via ``workers.vertex_veo_transport`` and
saves it locally. Duration defaults to the shortest accepted value (4s) to
minimize cost; pass ``--duration 6`` or ``--duration 8`` for a longer clip.

Reads GCP_PROJECT_ID / GCP_LOCATION / VEO_MODEL / GOOGLE_APPLICATION_CREDENTIALS
from the environment (moana/.env.local, moana/.env) exactly like the
production worker — never a hardcoded local path.
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from workers.pdf_image_extractor import ManifestEntry
from workers.startup_checks import load_worker_environment
from workers.vertex_veo_transport import (
    GCP_LOCATION_VAR,
    GCP_PROJECT_ID_VAR,
    VEO_MODEL_VAR,
    VertexVeoTransport,
)

_MIME_TYPES = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png"}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--image", required=True, type=Path, help="Source image for image-to-video (jpg/png)")
    parser.add_argument("--prompt", default="Cinematic reveal of a luxury yacht, photorealistic, no text overlay")
    parser.add_argument("--duration", type=int, default=4, choices=[4, 6, 8])
    parser.add_argument("--output", type=Path, default=Path("test_vertex_veo_output.mp4"))
    parser.add_argument("--timeout", type=float, default=300.0)
    args = parser.parse_args(argv)

    if not args.image.is_file():
        print(f"error: no such file: {args.image}", file=sys.stderr)
        return 1
    mime_type = _MIME_TYPES.get(args.image.suffix.lower())
    if mime_type is None:
        print(f"error: unsupported image extension {args.image.suffix!r} (expected .jpg/.jpeg/.png)", file=sys.stderr)
        return 1

    load_worker_environment()
    project_id = os.environ.get(GCP_PROJECT_ID_VAR, "").strip()
    if not project_id:
        print(f"error: missing {GCP_PROJECT_ID_VAR} (moana/.env.local or moana/.env)", file=sys.stderr)
        return 1
    location = os.environ.get(GCP_LOCATION_VAR, "").strip() or "us-central1"
    model = os.environ.get(VEO_MODEL_VAR, "").strip() or "veo-3.1-fast-generate-001"

    print(f"Project: {project_id} | Location: {location} | Model: {model} | Duration: {args.duration}s")
    print("This will make a real, billed call to Vertex AI Veo.")

    transport = VertexVeoTransport(
        project_id=project_id,
        location=location,
        model=model,
        duration_s=args.duration,
    )

    image_bytes = args.image.read_bytes()
    entry = ManifestEntry(
        image_id="test-vertex-veo",
        page_index=0,
        occurrence_index=0,
        section="test",
        content_digest="test",
        byte_length=len(image_bytes),
        image_data=image_bytes,
        mime_type=mime_type,
    )

    print("Launching generation and polling every ~12s until done...")
    video_bytes = transport.generate_clip(args.prompt, entry, args.timeout)
    args.output.write_bytes(video_bytes)
    print(f"Saved {len(video_bytes)} bytes to {args.output.resolve()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
