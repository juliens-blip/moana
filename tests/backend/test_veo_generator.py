"""Tests déterministes de la génération Veo par section (plan.json T3 S3).

Les transports Gemini (``VeoTransport``) et Storage (``StorageCheckpoint``)
sont entièrement mockés en mémoire : aucun appel réseau réel n'est possible
depuis ce fichier. ``sleep``/``rand`` sont injectés pour ne jamais dormir
pendant les tests de retry.
"""

from __future__ import annotations

import logging

import pytest

from workers.pdf_image_extractor import ManifestEntry, PdfImageManifest
from workers.veo_generator import (
    CLIP_DURATION_S,
    VEO_PROMPT_VERSION,
    ClipCheckpoint,
    VeoGenerationFailure,
    VeoGenerationResult,
    VeoPromptContext,
    VeoSettings,
    VeoTransientError,
    build_clip_content_digest,
    build_section_prompt,
    generate_section_clips,
)

DOCUMENT_DIGEST = "a" * 64


def _entry(image_id: str, section: str, digest: str = "d" * 64) -> ManifestEntry:
    return ManifestEntry(
        image_id=image_id,
        page_index=0,
        occurrence_index=0,
        section=section,
        content_digest=digest,
        byte_length=10,
    )


def _manifest(*entries: ManifestEntry) -> PdfImageManifest:
    return PdfImageManifest(document_digest=DOCUMENT_DIGEST, entries=tuple(entries))


class FakeStorageCheckpoint:
    """In-memory Storage checkpoint fake: no network, records every call."""

    def __init__(self, existing: tuple[ClipCheckpoint, ...] = ()) -> None:
        self._by_document: dict[str, list[ClipCheckpoint]] = {DOCUMENT_DIGEST: list(existing)}
        self.persisted: list[tuple[str, ClipCheckpoint, bytes]] = []
        self.load_calls = 0

    def load_manifest(self, document_digest: str) -> tuple[ClipCheckpoint, ...]:
        self.load_calls += 1
        return tuple(self._by_document.get(document_digest, ()))

    def persist_clip(self, document_digest: str, checkpoint: ClipCheckpoint, clip_bytes: bytes) -> None:
        self._by_document.setdefault(document_digest, []).append(checkpoint)
        self.persisted.append((document_digest, checkpoint, clip_bytes))


class FakeVeoTransport:
    """In-memory Veo transport fake: raises injected errors, never touches a network."""

    def __init__(self, failures_by_image: dict[str, list[Exception]] | None = None) -> None:
        self._failures_by_image = failures_by_image or {}
        self.calls: list[tuple[str, str, float]] = []

    def generate_clip(self, prompt: str, entry: ManifestEntry, timeout: float) -> bytes:
        self.calls.append((entry.image_id, prompt, timeout))
        queue = self._failures_by_image.get(entry.image_id)
        if queue:
            raise queue.pop(0)
        return f"clip-bytes-{entry.image_id}".encode()


def _no_sleep(_seconds: float) -> None:
    return None


def _fixed_rand() -> float:
    return 0.0


# ---------------------------------------------------------------------------
# S1/acceptance: exact duration, prompt fidelity, no network, checkpoint order
# ---------------------------------------------------------------------------


def test_each_clip_uses_the_supported_six_second_duration() -> None:
    manifest = _manifest(_entry("img-1", "bow"), _entry("img-2", "stern"))
    checkpoint = FakeStorageCheckpoint()
    transport = FakeVeoTransport()

    result = generate_section_clips(manifest, transport, checkpoint, sleep=_no_sleep, rand=_fixed_rand)

    assert CLIP_DURATION_S == 6.0
    assert [clip.duration_s for clip in result.clips] == [6.0, 6.0]


def test_prompt_forbids_invention_and_exaggeration_for_every_section() -> None:
    manifest = _manifest(_entry("img-1", "bow"), _entry("img-2", "stern"))
    checkpoint = FakeStorageCheckpoint()
    transport = FakeVeoTransport()

    generate_section_clips(manifest, transport, checkpoint, sleep=_no_sleep, rand=_fixed_rand)

    assert len(transport.calls) == 2
    for sequence_index, (image_id, prompt, _timeout) in enumerate(transport.calls, start=1):
        assert "Never invent" in prompt
        assert "exaggerate" in prompt
        assert "6.0-second" in prompt
        assert f"sequence {sequence_index} of 2" in prompt
        assert "will later be assembled" in prompt
        assert image_id in {"img-1", "img-2"}


def test_prompt_requests_subtle_logo_watermark_premium_quality_and_interior_room_tour() -> None:
    prompt = build_section_prompt(
        _entry("img-interior", "Vie à bord–Intérieurs"),
        sequence_index=1,
        total_sequences=2,
    )

    assert "premium luxury-yacht brokerage footage" in prompt
    assert "persistent, static, very light semi-transparent watermark" in prompt
    assert "entire clip" in prompt
    assert "8-12 percent opacity" in prompt
    assert "turn the logo into the main subject" in prompt
    assert "active premium room tour" in prompt
    assert "strong natural parallax" in prompt
    assert "cut naturally into the following shot" in prompt
    assert "simple zoom-ins or zoom-outs" in prompt
    assert "Never invent an unseen room" in prompt


def test_prompt_uses_exact_brochure_text_for_opening_title_and_section_facts() -> None:
    context = VeoPromptContext(
        yacht_name="M/Y EXAMPLE",
        verified_facts=("Builder — Example Yachts", "Length — 42 m"),
    )
    prompt = build_section_prompt(
        _entry("img-hero", "Hero/Identité"),
        sequence_index=1,
        total_sequences=3,
        context=context,
    )

    assert 'for the motor yacht "M/Y EXAMPLE"' in prompt
    assert 'Yacht name: "M/Y EXAMPLE"' in prompt
    assert 'introduce the exact yacht name "M/Y EXAMPLE"' in prompt
    assert '"Builder — Example Yachts"' in prompt
    assert '"Length — 42 m"' in prompt
    assert "Do not display a factual lower-third in the same clip" in prompt
    assert "If a verified value cannot be rendered confidently and legibly, show no text" in prompt


def test_later_sequence_uses_at_most_one_verified_fact_and_not_the_opening_title() -> None:
    context = VeoPromptContext(
        yacht_name="M/Y EXAMPLE",
        verified_facts=("Builder — Example Yachts", "Length — 42 m"),
    )

    prompt = build_section_prompt(
        _entry("img-interior", "Main Salon"),
        sequence_index=2,
        total_sequences=3,
        context=context,
    )

    assert "sequence 2 of 3" in prompt
    assert "For this subsequent sequence, display at most one" in prompt
    assert "For this opening sequence" not in prompt


def test_missing_editorial_text_leaves_no_unresolved_placeholder() -> None:
    prompt = build_section_prompt(_entry("img-1", "Exterior"))

    assert "{YACHT_NAME}" not in prompt
    assert "{VERIFIED_FACTS}" not in prompt
    assert "No yacht name was verified. Do not display a yacht title" in prompt
    assert "No verified facts available; display no factual overlay" in prompt


def test_last_sequence_concludes_instead_of_promising_a_following_shot() -> None:
    prompt = build_section_prompt(
        _entry("img-3", "Exterior"), sequence_index=3, total_sequences=3
    )

    assert "concluding view appropriate to the final sequence" in prompt
    assert "cut naturally into the following shot" not in prompt


def test_prompt_context_changes_invalidate_the_clip_content_digest() -> None:
    entry = _entry("img-1", "Exterior")
    prompt_a = build_section_prompt(
        entry, context=VeoPromptContext(yacht_name="M/Y ALPHA")
    )
    prompt_b = build_section_prompt(
        entry, context=VeoPromptContext(yacht_name="M/Y BRAVO")
    )

    assert build_clip_content_digest(entry, prompt_a) != build_clip_content_digest(entry, prompt_b)


def test_prompt_is_pure_and_deterministic_per_entry() -> None:
    entry = _entry("img-1", "bow")
    assert build_section_prompt(entry) == build_section_prompt(entry)


def test_no_real_network_call_and_manifest_read_before_any_transport_call() -> None:
    manifest = _manifest(_entry("img-1", "bow"))
    checkpoint = FakeStorageCheckpoint()
    transport = FakeVeoTransport()

    generate_section_clips(manifest, transport, checkpoint, sleep=_no_sleep, rand=_fixed_rand)

    # load_manifest is the only source of prior state: reading it exactly once
    # per run, before generation, means resume never guesses at prior work.
    assert checkpoint.load_calls == 1
    assert len(transport.calls) == 1
    assert len(checkpoint.persisted) == 1


def test_clip_is_persisted_immediately_with_deterministic_object_key() -> None:
    manifest = _manifest(_entry("img-1", "bow"))
    checkpoint = FakeStorageCheckpoint()
    transport = FakeVeoTransport()

    result_first = generate_section_clips(manifest, transport, checkpoint, sleep=_no_sleep, rand=_fixed_rand)
    key_first = result_first.clips[0].object_key

    checkpoint_second = FakeStorageCheckpoint()
    result_second = generate_section_clips(
        manifest, FakeVeoTransport(), checkpoint_second, sleep=_no_sleep, rand=_fixed_rand
    )
    key_second = result_second.clips[0].object_key

    assert key_first == key_second
    assert f"/{VEO_PROMPT_VERSION}/" in key_first
    assert key_first.endswith("img-1.mp4")


def test_no_secret_header_or_signed_url_is_logged(caplog: pytest.LogCaptureFixture) -> None:
    manifest = _manifest(_entry("img-1", "bow"))
    checkpoint = FakeStorageCheckpoint()
    transport = FakeVeoTransport(
        failures_by_image={"img-1": [VeoTransientError("rate_limited")]}
    )

    with caplog.at_level(logging.WARNING, logger="moana.veo_generator"):
        generate_section_clips(manifest, transport, checkpoint, sleep=_no_sleep, rand=_fixed_rand)

    for record in caplog.records:
        text = record.getMessage()
        assert "signed" not in text.lower()
        assert "authorization" not in text.lower()
        assert "api_key" not in text.lower()
        assert "bearer" not in text.lower()


# ---------------------------------------------------------------------------
# S2/acceptance: bounded transient retry, definitive/timeout short-circuit
# ---------------------------------------------------------------------------


def test_transient_errors_retry_up_to_max_retries_then_succeed() -> None:
    manifest = _manifest(_entry("img-1", "bow"))
    checkpoint = FakeStorageCheckpoint()
    transport = FakeVeoTransport(
        failures_by_image={"img-1": [VeoTransientError("e1"), VeoTransientError("e2")]}
    )
    settings = VeoSettings(max_retries=3, backoff_base_s=0.01, backoff_cap_s=0.02)

    result = generate_section_clips(
        manifest, transport, checkpoint, settings=settings, sleep=_no_sleep, rand=_fixed_rand
    )

    assert len(transport.calls) == 3
    assert len(result.clips) == 1


def test_transient_errors_exhausting_max_retries_raise_definitive_failure() -> None:
    manifest = _manifest(_entry("img-1", "bow"))
    checkpoint = FakeStorageCheckpoint()
    transport = FakeVeoTransport(
        failures_by_image={"img-1": [VeoTransientError("e1"), VeoTransientError("e2"), VeoTransientError("e3")]}
    )
    settings = VeoSettings(max_retries=2, backoff_base_s=0.01, backoff_cap_s=0.02)

    with pytest.raises(VeoGenerationFailure) as excinfo:
        generate_section_clips(manifest, transport, checkpoint, settings=settings, sleep=_no_sleep, rand=_fixed_rand)

    assert len(transport.calls) == 3  # initial attempt + 2 retries
    assert excinfo.value.dead_letter.image_id == "img-1"
    assert checkpoint.persisted == []


def test_definitive_error_is_not_retried() -> None:
    manifest = _manifest(_entry("img-1", "bow"))
    checkpoint = FakeStorageCheckpoint()
    transport = FakeVeoTransport(failures_by_image={"img-1": [RuntimeError("quota_denied")]})
    settings = VeoSettings(max_retries=5, backoff_base_s=0.01, backoff_cap_s=0.02)

    with pytest.raises(VeoGenerationFailure):
        generate_section_clips(manifest, transport, checkpoint, settings=settings, sleep=_no_sleep, rand=_fixed_rand)

    assert len(transport.calls) == 1


def test_timeout_is_treated_as_definitive_and_not_retried() -> None:
    manifest = _manifest(_entry("img-1", "bow"))
    checkpoint = FakeStorageCheckpoint()
    transport = FakeVeoTransport(failures_by_image={"img-1": [TimeoutError("deadline exceeded")]})
    settings = VeoSettings(max_retries=5, backoff_base_s=0.01, backoff_cap_s=0.02)

    with pytest.raises(VeoGenerationFailure):
        generate_section_clips(manifest, transport, checkpoint, settings=settings, sleep=_no_sleep, rand=_fixed_rand)

    assert len(transport.calls) == 1


def test_partial_failure_keeps_already_checkpointed_clips_and_reports_them() -> None:
    manifest = _manifest(_entry("img-1", "bow"), _entry("img-2", "stern"))
    checkpoint = FakeStorageCheckpoint()
    transport = FakeVeoTransport(failures_by_image={"img-2": [RuntimeError("boom")]})
    settings = VeoSettings(max_retries=1, backoff_base_s=0.01, backoff_cap_s=0.02)

    with pytest.raises(VeoGenerationFailure) as excinfo:
        generate_section_clips(manifest, transport, checkpoint, settings=settings, sleep=_no_sleep, rand=_fixed_rand)

    assert len(checkpoint.persisted) == 1
    assert checkpoint.persisted[0][1].image_id == "img-1"
    assert excinfo.value.partial_result is not None
    assert [clip.image_id for clip in excinfo.value.partial_result.clips] == ["img-1"]


# ---------------------------------------------------------------------------
# S2/S3/acceptance: idempotent resume reuses each successful clip exactly once
# ---------------------------------------------------------------------------


def test_resume_after_partial_failure_only_calls_transport_for_missing_sections() -> None:
    manifest = _manifest(_entry("img-1", "bow"), _entry("img-2", "stern"))
    checkpoint = FakeStorageCheckpoint()
    failing_transport = FakeVeoTransport(failures_by_image={"img-2": [RuntimeError("boom")]})
    settings = VeoSettings(max_retries=0)

    with pytest.raises(VeoGenerationFailure):
        generate_section_clips(manifest, failing_transport, checkpoint, settings=settings, sleep=_no_sleep, rand=_fixed_rand)

    assert len(checkpoint.persisted) == 1  # img-1 succeeded and was checkpointed

    resuming_transport = FakeVeoTransport()
    result = generate_section_clips(
        manifest, resuming_transport, checkpoint, settings=settings, sleep=_no_sleep, rand=_fixed_rand
    )

    # Only the previously missing section is regenerated; img-1 is reused untouched.
    assert [call[0] for call in resuming_transport.calls] == ["img-2"]
    assert [clip.image_id for clip in result.clips] == ["img-1", "img-2"]
    assert result.clips[0].object_key == checkpoint.persisted[0][1].object_key


def test_resume_reuses_identical_keys_and_manifest_shape() -> None:
    manifest = _manifest(_entry("img-1", "bow"), _entry("img-2", "stern"))
    checkpoint = FakeStorageCheckpoint()

    first_result = generate_section_clips(
        manifest, FakeVeoTransport(), checkpoint, sleep=_no_sleep, rand=_fixed_rand
    )
    second_transport = FakeVeoTransport()
    second_result = generate_section_clips(
        manifest, second_transport, checkpoint, sleep=_no_sleep, rand=_fixed_rand
    )

    # A fully-checkpointed rerun never contacts the transport at all.
    assert second_transport.calls == []
    assert second_result == first_result


def test_changed_content_digest_regenerates_that_section_only() -> None:
    stale_checkpoint = ClipCheckpoint(
        image_id="img-1",
        object_key="veo-clips/aaaaaaaaaaaaaaaa/img-1.mp4",
        duration_s=5.0,
        content_digest="stale-digest",
    )
    checkpoint = FakeStorageCheckpoint(existing=(stale_checkpoint,))
    manifest = _manifest(_entry("img-1", "bow", digest="fresh-digest"))
    transport = FakeVeoTransport()

    result = generate_section_clips(manifest, transport, checkpoint, sleep=_no_sleep, rand=_fixed_rand)

    assert [call[0] for call in transport.calls] == ["img-1"]
    assert result.clips[0].content_digest == build_clip_content_digest(manifest.entries[0])


def test_legacy_checkpoint_is_regenerated_when_prompt_version_changes() -> None:
    entry = _entry("img-1", "interior", digest="source-digest")
    legacy_checkpoint = ClipCheckpoint(
        image_id=entry.image_id,
        object_key="veo-clips/aaaaaaaaaaaaaaaa/img-1.mp4",
        duration_s=CLIP_DURATION_S,
        content_digest=entry.content_digest,
    )
    checkpoint = FakeStorageCheckpoint(existing=(legacy_checkpoint,))
    transport = FakeVeoTransport()

    result = generate_section_clips(
        _manifest(entry), transport, checkpoint, sleep=_no_sleep, rand=_fixed_rand
    )

    assert [call[0] for call in transport.calls] == [entry.image_id]
    assert result.clips[0].content_digest != legacy_checkpoint.content_digest
    assert f"/{VEO_PROMPT_VERSION}/" in result.clips[0].object_key


def test_result_is_value_equal_across_replays() -> None:
    manifest = _manifest(_entry("img-1", "bow"), _entry("img-2", "stern"))
    result_one = generate_section_clips(
        manifest, FakeVeoTransport(), FakeStorageCheckpoint(), sleep=_no_sleep, rand=_fixed_rand
    )
    result_two = generate_section_clips(
        manifest, FakeVeoTransport(), FakeStorageCheckpoint(), sleep=_no_sleep, rand=_fixed_rand
    )
    assert result_one == result_two
    assert isinstance(result_one, VeoGenerationResult)
