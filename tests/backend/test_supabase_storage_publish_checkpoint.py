"""Sonde ciblée du conflit HTTP 409 dans ``SupabaseStoragePublishCheckpoint`` (plan T1).

Reproduit deux écritures concurrentes sur la même clé ``(document_digest,
idempotency_key)`` : la seconde reçoit un 409 de la conditional-create de
Supabase Storage. Le contrat attendu — un GET des métadonnées, comparaison de
checksum, réutilisation idempotente si identique, erreur explicite sinon — est
vérifié sans jamais journaliser le service_role key.
"""

from __future__ import annotations

import json

import pytest

from workers.video_assembler import (
    AssemblyChecksumConflictError,
    PublishedArtifact,
    SupabaseStoragePublishCheckpoint,
)

DOCUMENT_DIGEST = "b" * 64


def test_checkpoint_reuses_matching_artifact_after_conflict() -> None:
    """Two concurrent writers race on the same key: the second gets a 409,
    reads back metadata, finds a matching checksum, and reuses the single
    artifact already persisted by the first writer — no duplicate upload."""

    matching_digest = "d" * 64
    calls: list[str] = []
    get_count = {"n": 0}

    def fake_request(url, headers, body, timeout):
        if body is None:
            calls.append("get")
            get_count["n"] += 1
            if get_count["n"] == 1:
                # Pre-check (load_confirmed before produce): a concurrent
                # racer hasn't published yet from this caller's viewpoint.
                return 404, b""
            # Post-409 metadata read: the racer's write is now visible.
            return 200, json.dumps({"checksum": matching_digest}).encode()
        calls.append("put")
        return 409, b"Duplicate"

    checkpoint = SupabaseStoragePublishCheckpoint(
        supabase_url="https://example.supabase.co",
        supabase_service_key="fake-service-role-key-sentinel",
        request=fake_request,
    )

    expected_object_key = f"videos/{DOCUMENT_DIGEST[:16]}/job-1.mp4"

    def produce():
        return PublishedArtifact(object_key=expected_object_key, content_digest=matching_digest), b"mp4-bytes"

    artifact = checkpoint.acquire_and_publish(DOCUMENT_DIGEST, "job-1", produce)

    assert artifact.object_key == expected_object_key
    assert artifact.content_digest == matching_digest
    # load_confirmed (pre-check) + the post-409 metadata read = exactly two GETs.
    assert calls.count("get") == 2
    assert calls.count("put") == 1


def test_checkpoint_rejects_checksum_mismatch_and_is_idempotent() -> None:
    """A 409 whose stored checksum diverges from what this worker just
    produced is a real collision, not a safe replay: it must raise an
    explicit error naming the key and both checksums, without leaking a
    secret. A second call with the same inputs raises the same way exactly
    once more — no partial state, no silent second publish."""

    local_digest = "d" * 64
    stored_digest = "f" * 64
    upload_attempts = {"n": 0}
    get_count = {"n": 0}

    def fake_request(url, headers, body, timeout):
        if body is None:
            get_count["n"] += 1
            # Odd GETs are the pre-check (load_confirmed before produce, no
            # visible object yet from this caller's view); even GETs are the
            # post-409 metadata read that surfaces the real collision.
            if get_count["n"] % 2 == 1:
                return 404, b""
            return 200, json.dumps({"checksum": stored_digest}).encode()
        upload_attempts["n"] += 1
        return 409, b"Duplicate"

    checkpoint = SupabaseStoragePublishCheckpoint(
        supabase_url="https://example.supabase.co",
        supabase_service_key="fake-service-role-key-sentinel",
        request=fake_request,
    )

    expected_object_key = f"videos/{DOCUMENT_DIGEST[:16]}/job-1.mp4"

    def produce():
        return PublishedArtifact(object_key=expected_object_key, content_digest=local_digest), b"mp4-bytes"

    with pytest.raises(AssemblyChecksumConflictError) as excinfo:
        checkpoint.acquire_and_publish(DOCUMENT_DIGEST, "job-1", produce)
    assert expected_object_key in str(excinfo.value)
    assert local_digest in str(excinfo.value)
    assert stored_digest in str(excinfo.value)
    assert "fake-service-role-key-sentinel" not in str(excinfo.value)

    with pytest.raises(AssemblyChecksumConflictError):
        checkpoint.acquire_and_publish(DOCUMENT_DIGEST, "job-1", produce)

    assert upload_attempts["n"] == 2  # each call attempts its own conditional create, no duplicate publish either time


@pytest.mark.parametrize(
    "metadata_body",
    [
        pytest.param({"checksum": ""}, id="empty-string"),
        pytest.param({}, id="absent"),
        pytest.param({"checksum": None}, id="null"),
        pytest.param({"checksum": 12345}, id="numeric"),
        pytest.param({"checksum": ["d" * 64]}, id="collection"),
        pytest.param({"checksum": "not-hex-" + "d" * 56}, id="malformed-non-hex"),
        pytest.param({"checksum": "d" * 63}, id="malformed-short"),
    ],
)
def test_checkpoint_rejects_confirmation_with_empty_or_malformed_checksum(metadata_body) -> None:
    """A 200 on the metadata GET without a well-formed sha256 checksum is not
    a verifiable confirmation: ``load_confirmed`` must treat it as absent
    rather than trusting an integrity-free remote object — and must never
    raise, whatever JSON type the checksum field holds — and
    ``acquire_and_publish`` must still run ``produce`` and attempt the
    conditional create instead of short-circuiting on that unverifiable 200."""

    local_digest = "d" * 64
    put_attempts = {"n": 0}

    def fake_request(url, headers, body, timeout):
        if body is None:
            # The pre-check GET returns 200 but with no usable checksum
            # field — e.g. a partially-written or legacy object.
            return 200, json.dumps(metadata_body).encode()
        put_attempts["n"] += 1
        return 201, b""

    checkpoint = SupabaseStoragePublishCheckpoint(
        supabase_url="https://example.supabase.co",
        supabase_service_key="fake-service-role-key-sentinel",
        request=fake_request,
    )

    expected_object_key = f"videos/{DOCUMENT_DIGEST[:16]}/job-1.mp4"

    assert checkpoint.load_confirmed(DOCUMENT_DIGEST, "job-1") is None

    def produce():
        return PublishedArtifact(object_key=expected_object_key, content_digest=local_digest), b"mp4-bytes"

    artifact = checkpoint.acquire_and_publish(DOCUMENT_DIGEST, "job-1", produce)

    assert artifact.object_key == expected_object_key
    assert artifact.content_digest == local_digest
    assert put_attempts["n"] == 1  # produce() ran and the conditional create was actually attempted


def test_checkpoint_accepts_confirmation_with_valid_sha256_checksum() -> None:
    """A 200 with a well-formed sha256 checksum is a verifiable confirmation:
    ``load_confirmed`` must return the matching artifact without running
    ``produce`` or attempting any write."""

    local_digest = "d" * 64
    put_attempts = {"n": 0}

    def fake_request(url, headers, body, timeout):
        if body is None:
            return 200, json.dumps({"checksum": local_digest}).encode()
        put_attempts["n"] += 1
        return 201, b""

    checkpoint = SupabaseStoragePublishCheckpoint(
        supabase_url="https://example.supabase.co",
        supabase_service_key="fake-service-role-key-sentinel",
        request=fake_request,
    )

    expected_object_key = f"videos/{DOCUMENT_DIGEST[:16]}/job-1.mp4"

    confirmed = checkpoint.load_confirmed(DOCUMENT_DIGEST, "job-1")
    assert confirmed is not None
    assert confirmed.object_key == expected_object_key
    assert confirmed.content_digest == local_digest

    def produce():
        raise AssertionError("produce() must not run when a valid checksum is already confirmed")

    artifact = checkpoint.acquire_and_publish(DOCUMENT_DIGEST, "job-1", produce)
    assert artifact.content_digest == local_digest
    assert put_attempts["n"] == 0
