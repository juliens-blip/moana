"""Tests déterministes de la génération Gemini/Veo par section (plan.json T1).

Gemini (``VeoTransport``) et Storage (``StorageCheckpoint``) sont entièrement
mockés en mémoire : aucun appel réseau réel n'est possible depuis ce fichier,
et GEMINI_API_KEY_PAYFUL n'est jamais chargée depuis une vraie configuration.

Le contrat: un clip muet par section, durée dynamique bornée entre 5 et 8
secondes selon le nombre d'images de la section, prompt imposé transmis tel
quel (aucun texte ajouté), modèle Veo le moins cher sélectionné par défaut,
et une sortie MP4 validée sans piste audio avant confirmation du checkpoint.
"""

from __future__ import annotations

import inspect
import logging
import threading

import pytest

from workers.gemini_veo_generator import (
    DEFAULT_VEO_MODEL,
    MAX_CLIP_DURATION_S,
    MIN_CLIP_DURATION_S,
    SECTION_PROMPT_CORE,
    ClipCheckpoint,
    InMemoryStorageCheckpoint,
    VeoAudioTrackDetectedError,
    VeoGenerationFailure,
    VeoGenerationResult,
    VeoInvalidClipContainerError,
    VeoSettings,
    VeoTransientError,
    build_section_prompt,
    compute_section_duration_s,
    ensure_gemini_configured,
    generate_clips_for_sections,
    mp4_has_audio_track,
    run_with_retry,
)
from workers.pdf_image_extractor import ManifestEntry, PdfImageManifest
from workers.startup_checks import GEMINI_API_KEY_PAYFUL_VAR, WorkerConfigurationError

DOCUMENT_DIGEST = "a" * 64


@pytest.fixture(autouse=True)
def _fake_gemini_api_key(monkeypatch: pytest.MonkeyPatch) -> None:
    """generate_clips_for_sections now calls ensure_gemini_configured(env) first;
    set a well-formed, fake key in the process environment so every test below
    exercises the generation path without ever touching a real credential."""
    monkeypatch.setenv(GEMINI_API_KEY_PAYFUL_VAR, "x" * 40)


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


def _section_images(section: str, count: int, digest_prefix: str = "d") -> tuple[ManifestEntry, ...]:
    return tuple(
        _entry(f"{section}-{i}", section, digest=f"{digest_prefix}{i}".rjust(64, "0")) for i in range(count)
    )


def _box(box_type: bytes, payload: bytes) -> bytes:
    return (8 + len(payload)).to_bytes(4, "big") + box_type + payload


def _mp4_with_handler(handler_type: bytes) -> bytes:
    hdlr = _box(b"hdlr", b"\x00\x00\x00\x00" + b"\x00\x00\x00\x00" + handler_type + b"\x00" * 12)
    mdia = _box(b"mdia", hdlr)
    trak = _box(b"trak", mdia)
    return _box(b"moov", trak)


# Well-formed, valid MP4 container with a video (never audio) handler: the
# default clip payload for every test below that isn't itself exercising MP4
# container/audio validation, so those tests keep confirming clips exactly as
# before the strict container check existed.
_DEFAULT_SILENT_MP4_BYTES = _mp4_with_handler(b"vide")


class FakeVeoTransport:
    """In-memory Veo transport fake: raises injected errors, never touches a network."""

    def __init__(
        self,
        failures_by_section: dict[str, list[Exception]] | None = None,
        clip_bytes_by_section: dict[str, bytes] | None = None,
    ) -> None:
        self._failures_by_section = failures_by_section or {}
        self._clip_bytes_by_section = clip_bytes_by_section or {}
        self.calls: list[tuple[str, str, tuple[str, ...], float, str, float]] = []

    def generate_clip(
        self,
        prompt: str,
        entries: tuple[ManifestEntry, ...],
        duration_s: float,
        model: str,
        timeout: float,
    ) -> bytes:
        section = entries[0].section
        self.calls.append((section, prompt, tuple(e.image_id for e in entries), duration_s, model, timeout))
        queue = self._failures_by_section.get(section)
        if queue:
            raise queue.pop(0)
        return self._clip_bytes_by_section.get(section, _DEFAULT_SILENT_MP4_BYTES)


def _no_sleep(_seconds: float) -> None:
    return None


def _fixed_rand() -> float:
    return 0.0


# ---------------------------------------------------------------------------
# S1/acceptance: one clip per section, imposed prompt, dynamic bounded duration
# ---------------------------------------------------------------------------


def test_one_clip_is_produced_per_section_not_per_image() -> None:
    manifest = _manifest(*_section_images("bow", 3), *_section_images("stern", 2))
    result = generate_clips_for_sections(
        manifest, FakeVeoTransport(), InMemoryStorageCheckpoint(), sleep=_no_sleep, rand=_fixed_rand
    )

    assert [clip.image_id for clip in result.clips] == ["bow", "stern"]
    assert len(result.clips) == 2


def test_output_and_transport_calls_follow_section_input_order() -> None:
    manifest = _manifest(*_section_images("salon", 1), *_section_images("bow", 1), *_section_images("stern", 1))
    transport = FakeVeoTransport()

    result = generate_clips_for_sections(
        manifest, transport, InMemoryStorageCheckpoint(), sleep=_no_sleep, rand=_fixed_rand
    )

    assert [clip.image_id for clip in result.clips] == ["salon", "bow", "stern"]
    assert [call[0] for call in transport.calls] == ["salon", "bow", "stern"]


def test_prompt_is_exactly_the_imposed_string() -> None:
    """No period, no per-section label, no audio/silence/embellishment suffix:
    the transmitted prompt is character-for-character the imposed core string."""
    manifest = _manifest(*_section_images("bow", 4), *_section_images("stern", 12))
    transport = FakeVeoTransport()

    generate_clips_for_sections(manifest, transport, InMemoryStorageCheckpoint(), sleep=_no_sleep, rand=_fixed_rand)

    assert len(transport.calls) == 2
    for _section, prompt, _image_ids, _duration, _model, _timeout in transport.calls:
        assert prompt == SECTION_PROMPT_CORE
        assert "premium luxury-yacht brokerage footage" in prompt
        assert "persistent, static, very light semi-transparent watermark" in prompt
        assert "active premium room tour in three beats" in prompt
        assert "exact yacht name" in prompt
        assert "restrained lower-thirds or section cards" in prompt
        assert prompt == build_section_prompt()


def test_prompt_is_a_pure_constant_never_derived_from_section_content() -> None:
    assert build_section_prompt() == build_section_prompt() == SECTION_PROMPT_CORE
    assert "bow" not in build_section_prompt()
    assert "stern" not in build_section_prompt()


def test_no_audio_or_embellishment_field_is_ever_sent_to_the_transport() -> None:
    """generate_clip's own signature is the entire request surface this module
    controls: no audio/music/embellishment parameter exists on it to send."""
    params = list(inspect.signature(FakeVeoTransport.generate_clip).parameters)
    for forbidden in ("audio", "music", "sound", "embellish", "voice"):
        assert not any(forbidden in p.lower() for p in params)


def test_cheapest_veo_model_is_selected_by_default() -> None:
    manifest = _manifest(*_section_images("bow", 2))
    transport = FakeVeoTransport()

    generate_clips_for_sections(manifest, transport, InMemoryStorageCheckpoint(), sleep=_no_sleep, rand=_fixed_rand)

    assert transport.calls[0][4] == DEFAULT_VEO_MODEL


def test_silent_mp4_output_passes_audio_track_validation() -> None:
    manifest = _manifest(*_section_images("bow", 2))
    transport = FakeVeoTransport(clip_bytes_by_section={"bow": _mp4_with_handler(b"vide")})

    result = generate_clips_for_sections(
        manifest, transport, InMemoryStorageCheckpoint(), sleep=_no_sleep, rand=_fixed_rand
    )

    assert result.clips[0].image_id == "bow"


def test_mp4_with_audio_track_is_a_definitive_dead_lettered_failure() -> None:
    manifest = _manifest(*_section_images("bow", 2))
    transport = FakeVeoTransport(clip_bytes_by_section={"bow": _mp4_with_handler(b"soun")})
    checkpoint = InMemoryStorageCheckpoint()

    with pytest.raises(VeoGenerationFailure) as excinfo:
        generate_clips_for_sections(manifest, transport, checkpoint, sleep=_no_sleep, rand=_fixed_rand)

    assert excinfo.value.dead_letter.reason == "definitive:VeoAudioTrackDetectedError"
    assert checkpoint.dead_letters_for(DOCUMENT_DIGEST)[0].image_id == "bow"


def test_mp4_has_audio_track_detects_soun_handler_and_ignores_malformed_bytes() -> None:
    """mp4_has_audio_track alone is lenient on malformed bytes (returns False,
    never raises): it only ever answers "is there a soun handler in a chain I
    can walk", not "is this a valid MP4 at all". That stricter question is
    _is_well_formed_mp4_container's job, exercised end-to-end below."""
    assert mp4_has_audio_track(_mp4_with_handler(b"soun")) is True
    assert mp4_has_audio_track(_mp4_with_handler(b"vide")) is False
    assert mp4_has_audio_track(b"not an mp4 at all") is False
    assert mp4_has_audio_track(b"") is False


def test_non_mp4_clip_response_is_a_definitive_dead_lettered_failure() -> None:
    """Arbitrary bytes that merely happen to have no 'soun' handler must never
    be confirmed as a silent clip: the strict container check rejects them
    before mp4_has_audio_track is even consulted."""
    manifest = _manifest(*_section_images("bow", 2))
    transport = FakeVeoTransport(clip_bytes_by_section={"bow": b"not an mp4 at all"})
    checkpoint = InMemoryStorageCheckpoint()

    with pytest.raises(VeoGenerationFailure) as excinfo:
        generate_clips_for_sections(manifest, transport, checkpoint, sleep=_no_sleep, rand=_fixed_rand)

    assert excinfo.value.dead_letter.reason == "definitive:VeoInvalidClipContainerError"
    assert checkpoint.dead_letters_for(DOCUMENT_DIGEST)[0].image_id == "bow"
    assert checkpoint.load_confirmed(DOCUMENT_DIGEST) == ()


def test_empty_clip_response_is_a_definitive_dead_lettered_failure() -> None:
    manifest = _manifest(*_section_images("bow", 2))
    transport = FakeVeoTransport(clip_bytes_by_section={"bow": b""})
    checkpoint = InMemoryStorageCheckpoint()

    with pytest.raises(VeoGenerationFailure) as excinfo:
        generate_clips_for_sections(manifest, transport, checkpoint, sleep=_no_sleep, rand=_fixed_rand)

    assert excinfo.value.dead_letter.reason == "definitive:VeoInvalidClipContainerError"


def test_truncated_box_clip_response_is_a_definitive_dead_lettered_failure() -> None:
    """A box header declaring a size larger than the actual buffer (a
    truncated/cut-off response) must fail the same way as any other garbage."""
    manifest = _manifest(*_section_images("bow", 2))
    truncated = _box(b"moov", b"\x00" * 4)[:-2]  # declared size overruns the sliced buffer
    transport = FakeVeoTransport(clip_bytes_by_section={"bow": truncated})
    checkpoint = InMemoryStorageCheckpoint()

    with pytest.raises(VeoGenerationFailure) as excinfo:
        generate_clips_for_sections(manifest, transport, checkpoint, sleep=_no_sleep, rand=_fixed_rand)

    assert excinfo.value.dead_letter.reason == "definitive:VeoInvalidClipContainerError"


def test_unrecognized_box_type_of_valid_size_is_a_definitive_dead_lettered_failure() -> None:
    """Box framing (size, nesting) alone is not proof of an MP4: a single
    top-level box of a perfectly valid size but an unrecognized type — never
    a real ISO/IEC 14496-12 box, and no 'moov' among it — must still be
    rejected, not checkpointed as a silent clip just because it parses."""
    manifest = _manifest(*_section_images("bow", 2))
    bogus = _box(b"xxxx", b"\x00" * 4)
    transport = FakeVeoTransport(clip_bytes_by_section={"bow": bogus})
    checkpoint = InMemoryStorageCheckpoint()

    with pytest.raises(VeoGenerationFailure) as excinfo:
        generate_clips_for_sections(manifest, transport, checkpoint, sleep=_no_sleep, rand=_fixed_rand)

    assert excinfo.value.dead_letter.reason == "definitive:VeoInvalidClipContainerError"
    assert checkpoint.load_confirmed(DOCUMENT_DIGEST) == ()


def test_dynamic_duration_and_resume() -> None:
    """5s at 4 images, 8s at 12+ images, deterministic bounded value between,
    and a resumed rerun reuses every already-confirmed section's duration."""
    assert compute_section_duration_s(4) == MIN_CLIP_DURATION_S == 5.0
    assert compute_section_duration_s(1) == MIN_CLIP_DURATION_S
    assert compute_section_duration_s(12) == MAX_CLIP_DURATION_S == 8.0
    assert compute_section_duration_s(20) == MAX_CLIP_DURATION_S

    mid = compute_section_duration_s(8)
    assert MIN_CLIP_DURATION_S < mid < MAX_CLIP_DURATION_S
    assert compute_section_duration_s(8) == mid  # deterministic

    manifest = _manifest(*_section_images("bow", 4), *_section_images("stern", 8), *_section_images("salon", 12))
    checkpoint = InMemoryStorageCheckpoint()

    first = generate_clips_for_sections(
        manifest, FakeVeoTransport(), checkpoint, sleep=_no_sleep, rand=_fixed_rand
    )
    durations = {clip.image_id: clip.duration_s for clip in first.clips}
    assert durations == {"bow": 5.0, "stern": mid, "salon": 8.0}

    resumed_transport = FakeVeoTransport()
    second = generate_clips_for_sections(
        manifest, resumed_transport, checkpoint, sleep=_no_sleep, rand=_fixed_rand
    )
    assert resumed_transport.calls == []
    assert second == first


def test_no_secret_is_logged_on_retry(caplog: pytest.LogCaptureFixture) -> None:
    manifest = _manifest(*_section_images("bow", 2))
    transport = FakeVeoTransport(failures_by_section={"bow": [VeoTransientError("rate_limited")]})

    with caplog.at_level(logging.WARNING, logger="moana.gemini_veo_generator"):
        generate_clips_for_sections(manifest, transport, InMemoryStorageCheckpoint(), sleep=_no_sleep, rand=_fixed_rand)

    for record in caplog.records:
        text = record.getMessage()
        assert "signed" not in text.lower()
        assert "authorization" not in text.lower()
        assert "api_key" not in text.lower()
        assert "bearer" not in text.lower()


# ---------------------------------------------------------------------------
# S4/acceptance: bounded transient retry, definitive/timeout short-circuit
# ---------------------------------------------------------------------------


def test_transient_errors_retry_up_to_max_retries_then_succeed() -> None:
    manifest = _manifest(*_section_images("bow", 2))
    transport = FakeVeoTransport(failures_by_section={"bow": [VeoTransientError("e1"), VeoTransientError("e2")]})
    settings = VeoSettings(max_retries=3, backoff_base_s=0.01, backoff_cap_s=0.02)

    result = generate_clips_for_sections(
        manifest, transport, InMemoryStorageCheckpoint(), settings=settings, sleep=_no_sleep, rand=_fixed_rand
    )

    assert len(transport.calls) == 3
    assert len(result.clips) == 1


def test_transient_errors_exhausting_max_retries_raise_definitive_failure() -> None:
    manifest = _manifest(*_section_images("bow", 2))
    transport = FakeVeoTransport(
        failures_by_section={"bow": [VeoTransientError("e1"), VeoTransientError("e2"), VeoTransientError("e3")]}
    )
    settings = VeoSettings(max_retries=2, backoff_base_s=0.01, backoff_cap_s=0.02)
    checkpoint = InMemoryStorageCheckpoint()

    with pytest.raises(VeoGenerationFailure) as excinfo:
        generate_clips_for_sections(
            manifest, transport, checkpoint, settings=settings, sleep=_no_sleep, rand=_fixed_rand
        )

    assert len(transport.calls) == 3  # initial attempt + 2 retries
    assert excinfo.value.dead_letter.image_id == "bow"
    assert excinfo.value.dead_letter.reason.startswith("transient_exhausted:")
    assert checkpoint.load_confirmed(DOCUMENT_DIGEST) == ()


def test_definitive_error_is_not_retried() -> None:
    manifest = _manifest(*_section_images("bow", 2))
    transport = FakeVeoTransport(failures_by_section={"bow": [RuntimeError("quota_denied")]})
    settings = VeoSettings(max_retries=5, backoff_base_s=0.01, backoff_cap_s=0.02)

    with pytest.raises(VeoGenerationFailure) as excinfo:
        generate_clips_for_sections(
            manifest, transport, InMemoryStorageCheckpoint(), settings=settings, sleep=_no_sleep, rand=_fixed_rand
        )

    assert len(transport.calls) == 1
    assert excinfo.value.dead_letter.reason.startswith("definitive:")


def test_timeout_is_treated_as_definitive_and_not_retried() -> None:
    manifest = _manifest(*_section_images("bow", 2))
    transport = FakeVeoTransport(failures_by_section={"bow": [TimeoutError("deadline exceeded")]})
    settings = VeoSettings(max_retries=5, backoff_base_s=0.01, backoff_cap_s=0.02)

    with pytest.raises(VeoGenerationFailure):
        generate_clips_for_sections(
            manifest, transport, InMemoryStorageCheckpoint(), settings=settings, sleep=_no_sleep, rand=_fixed_rand
        )

    assert len(transport.calls) == 1


def test_partial_failure_keeps_already_confirmed_clips_and_reports_them() -> None:
    manifest = _manifest(*_section_images("bow", 2), *_section_images("stern", 2))
    transport = FakeVeoTransport(failures_by_section={"stern": [RuntimeError("boom")]})
    settings = VeoSettings(max_retries=1, backoff_base_s=0.01, backoff_cap_s=0.02)

    with pytest.raises(VeoGenerationFailure) as excinfo:
        generate_clips_for_sections(
            manifest, transport, InMemoryStorageCheckpoint(), settings=settings, sleep=_no_sleep, rand=_fixed_rand
        )

    assert excinfo.value.partial_result is not None
    assert [clip.image_id for clip in excinfo.value.partial_result.clips] == ["bow"]


# ---------------------------------------------------------------------------
# S3/acceptance: idempotent resume reuses each confirmed section exactly once
# ---------------------------------------------------------------------------


def test_resume_after_partial_failure_only_calls_transport_for_missing_sections() -> None:
    manifest = _manifest(*_section_images("bow", 2), *_section_images("stern", 2))
    checkpoint = InMemoryStorageCheckpoint()
    failing_transport = FakeVeoTransport(failures_by_section={"stern": [RuntimeError("boom")]})
    settings = VeoSettings(max_retries=0)

    with pytest.raises(VeoGenerationFailure):
        generate_clips_for_sections(
            manifest, failing_transport, checkpoint, settings=settings, sleep=_no_sleep, rand=_fixed_rand
        )

    resuming_transport = FakeVeoTransport()
    result = generate_clips_for_sections(
        manifest, resuming_transport, checkpoint, settings=settings, sleep=_no_sleep, rand=_fixed_rand
    )

    # Only the previously missing section is regenerated; bow is reused untouched.
    assert [call[0] for call in resuming_transport.calls] == ["stern"]
    assert [clip.image_id for clip in result.clips] == ["bow", "stern"]


def test_fully_confirmed_rerun_never_contacts_the_transport() -> None:
    manifest = _manifest(*_section_images("bow", 2), *_section_images("stern", 2))
    checkpoint = InMemoryStorageCheckpoint()

    first_result = generate_clips_for_sections(
        manifest, FakeVeoTransport(), checkpoint, sleep=_no_sleep, rand=_fixed_rand
    )
    second_transport = FakeVeoTransport()
    second_result = generate_clips_for_sections(
        manifest, second_transport, checkpoint, sleep=_no_sleep, rand=_fixed_rand
    )

    assert second_transport.calls == []
    assert second_result == first_result


def test_changed_content_digest_regenerates_that_section_only() -> None:
    stale_checkpoint = ClipCheckpoint(
        image_id="bow",
        object_key="veo-clips/aaaaaaaaaaaaaaaa/bow.mp4",
        duration_s=5.0,
        content_digest="stale-digest",
        image_count=1,
    )
    checkpoint = InMemoryStorageCheckpoint(existing={DOCUMENT_DIGEST: (stale_checkpoint,)})
    manifest = _manifest(_entry("bow-0", "bow", digest="fresh-digest"))
    transport = FakeVeoTransport()

    result = generate_clips_for_sections(manifest, transport, checkpoint, sleep=_no_sleep, rand=_fixed_rand)

    assert [call[0] for call in transport.calls] == ["bow"]
    assert result.clips[0].content_digest != "stale-digest"


def test_result_is_value_equal_across_replays() -> None:
    manifest = _manifest(*_section_images("bow", 2), *_section_images("stern", 2))
    result_one = generate_clips_for_sections(
        manifest, FakeVeoTransport(), InMemoryStorageCheckpoint(), sleep=_no_sleep, rand=_fixed_rand
    )
    result_two = generate_clips_for_sections(
        manifest, FakeVeoTransport(), InMemoryStorageCheckpoint(), sleep=_no_sleep, rand=_fixed_rand
    )
    assert result_one == result_two
    assert isinstance(result_one, VeoGenerationResult)


# ---------------------------------------------------------------------------
# S6: concurrent idempotence (single confirmed effect) + retry bound after cap
# ---------------------------------------------------------------------------


def test_concurrent_idempotence_and_retry_bound() -> None:
    """Two concurrent acquires for the same section confirm exactly once,
    and every retry delay stays within [0, backoff_cap_s] after jitter."""
    manifest = _manifest(*_section_images("bow", 2))
    checkpoint = InMemoryStorageCheckpoint()
    # First transport call raises transient errors so run_with_retry sleeps
    # (recorded below) before succeeding; only one thread's produce() runs.
    transport = FakeVeoTransport(failures_by_section={"bow": [VeoTransientError("e1"), VeoTransientError("e2")]})
    settings = VeoSettings(max_retries=3, backoff_base_s=1.0, backoff_cap_s=2.0, jitter_ratio=0.5)

    recorded_delays: list[float] = []

    def recording_sleep(seconds: float) -> None:
        recorded_delays.append(seconds)

    def max_jitter_rand() -> float:
        return 1.0  # maximises jitter, so the final re-cap is actually exercised

    results: list[VeoGenerationResult] = []
    barrier = threading.Barrier(2)

    def worker() -> None:
        barrier.wait()
        result = generate_clips_for_sections(
            manifest, transport, checkpoint, settings=settings, sleep=recording_sleep, rand=max_jitter_rand
        )
        results.append(result)

    threads = [threading.Thread(target=worker) for _ in range(2)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=5)

    # Exactly one confirmed effect for the shared section, even though two
    # threads raced to acquire it: this is only possible because
    # acquire_and_confirm's check-then-write is atomic, not read-then-write.
    assert checkpoint.produce_calls == ["bow"]
    assert len(transport.calls) == 3  # 2 transient failures + 1 success, from the single winner
    assert len(results) == 2
    assert results[0] == results[1]
    assert results[0].clips[0].image_id == "bow"

    # Every recorded sleep is the exponential delay capped, jittered, then
    # re-capped: 0 <= delay <= backoff_cap_s must hold even at max jitter.
    assert recorded_delays  # at least one retry actually slept
    for delay in recorded_delays:
        assert 0.0 <= delay <= settings.backoff_cap_s


def test_run_with_retry_recaps_delay_after_jitter_is_added() -> None:
    """Direct unit check: jitter is added after the exponential cap, and the
    jittered value is re-capped so it can never exceed backoff_cap_s."""
    recorded: list[float] = []
    attempts = {"count": 0}

    def flaky() -> str:
        attempts["count"] += 1
        if attempts["count"] < 2:
            raise VeoTransientError("boom")
        return "ok"

    result = run_with_retry(
        flaky,
        is_transient=lambda exc: isinstance(exc, VeoTransientError),
        max_retries=1,
        backoff_base_s=10.0,  # deliberately larger than the cap
        backoff_cap_s=1.0,
        sleep=recorded.append,
        rand=lambda: 1.0,  # maximum jitter
        jitter_ratio=0.5,
    )

    assert result == "ok"
    assert recorded == [1.0]  # capped at 1.0 pre-jitter, jittered to 1.5, re-capped to 1.0


def test_run_with_retry_raises_immediately_when_not_transient() -> None:
    def always_fails() -> None:
        raise RuntimeError("definitive")

    with pytest.raises(RuntimeError):
        run_with_retry(
            always_fails,
            is_transient=lambda exc: isinstance(exc, VeoTransientError),
            max_retries=5,
            backoff_base_s=0.01,
            backoff_cap_s=0.02,
            sleep=_no_sleep,
            rand=_fixed_rand,
        )


# ---------------------------------------------------------------------------
# S1/acceptance: GEMINI_API_KEY_PAYFUL presence/format check, no network at import
# ---------------------------------------------------------------------------


def test_ensure_gemini_configured_raises_when_absent() -> None:
    with pytest.raises(WorkerConfigurationError):
        ensure_gemini_configured(env={})


def test_ensure_gemini_configured_raises_when_malformed() -> None:
    with pytest.raises(WorkerConfigurationError):
        ensure_gemini_configured(env={GEMINI_API_KEY_PAYFUL_VAR: "short"})


def test_ensure_gemini_configured_succeeds_without_exposing_value() -> None:
    report = ensure_gemini_configured(env={GEMINI_API_KEY_PAYFUL_VAR: "x" * 40})
    assert report.state == "present"
    assert report.variable == GEMINI_API_KEY_PAYFUL_VAR
    assert not hasattr(report, "value")


def test_generate_clips_blocks_before_any_transport_call_when_key_absent(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv(GEMINI_API_KEY_PAYFUL_VAR, raising=False)
    manifest = _manifest(*_section_images("bow", 2))
    transport = FakeVeoTransport()

    with pytest.raises(WorkerConfigurationError):
        generate_clips_for_sections(
            manifest, transport, InMemoryStorageCheckpoint(), sleep=_no_sleep, rand=_fixed_rand, env={}
        )

    assert transport.calls == []


def test_generate_clips_blocks_before_any_transport_call_when_key_malformed() -> None:
    manifest = _manifest(*_section_images("bow", 2))
    transport = FakeVeoTransport()

    with pytest.raises(WorkerConfigurationError):
        generate_clips_for_sections(
            manifest,
            transport,
            InMemoryStorageCheckpoint(),
            sleep=_no_sleep,
            rand=_fixed_rand,
            env={GEMINI_API_KEY_PAYFUL_VAR: "short"},
        )

    assert transport.calls == []


# ---------------------------------------------------------------------------
# S4: definitive failures are persisted via an atomic, deduplicated
# dead-letter checkpoint before VeoGenerationFailure is raised
# ---------------------------------------------------------------------------


def test_definitive_failure_is_recorded_as_dead_letter_before_raising() -> None:
    manifest = _manifest(*_section_images("bow", 2))
    transport = FakeVeoTransport(failures_by_section={"bow": [RuntimeError("quota_denied")]})
    checkpoint = InMemoryStorageCheckpoint()

    with pytest.raises(VeoGenerationFailure) as excinfo:
        generate_clips_for_sections(manifest, transport, checkpoint, sleep=_no_sleep, rand=_fixed_rand)

    dead_letters = checkpoint.dead_letters_for(DOCUMENT_DIGEST)
    assert len(dead_letters) == 1
    assert dead_letters[0].image_id == "bow"
    assert dead_letters[0] == excinfo.value.dead_letter


def test_repeated_failure_for_the_same_section_does_not_duplicate_the_dead_letter() -> None:
    manifest = _manifest(*_section_images("bow", 2))
    checkpoint = InMemoryStorageCheckpoint()

    for _ in range(2):
        transport = FakeVeoTransport(failures_by_section={"bow": [RuntimeError("quota_denied")]})
        with pytest.raises(VeoGenerationFailure):
            generate_clips_for_sections(manifest, transport, checkpoint, sleep=_no_sleep, rand=_fixed_rand)

    assert len(checkpoint.dead_letters_for(DOCUMENT_DIGEST)) == 1
