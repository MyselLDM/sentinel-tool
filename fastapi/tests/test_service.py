"""Tests for the pure inference logic (app.service) using stub models.

These run without ``sentence_transformers`` — the stubs mimic the tiny bits of
the CrossEncoder / SentenceTransformer interface the service touches.
"""

from __future__ import annotations

import math

import numpy as np

from app import service


class StubCrossEncoder:
    """Mimics ``CrossEncoder.predict`` (returns raw logits)."""

    def __init__(self, logits):
        self._logits = logits

    def predict(self, pairs):  # noqa: ARG002 - signature parity
        return [self._logits]


class StubSentenceTransformer:
    """Mimics ``SentenceTransformer.encode``, returning vectors in call order."""

    def __init__(self, first, second):
        self._vectors = [np.asarray(first, dtype=float), np.asarray(second, dtype=float)]
        self._i = 0

    def encode(self, text, normalize_embeddings=True):  # noqa: ARG002
        v = self._vectors[self._i]
        self._i += 1
        if normalize_embeddings:
            v = v / np.linalg.norm(v)
        return v


# ── softmax ──────────────────────────────────────────────────────────────────

def test_softmax_passthrough_when_already_a_distribution():
    p = service.softmax([0.1, 0.8, 0.1])
    assert np.allclose(p, [0.1, 0.8, 0.1])


def test_softmax_converts_logits():
    p = service.softmax([2.0, -1.0, 0.0])
    assert abs(float(p.sum()) - 1.0) < 1e-9
    assert p[0] > p[1] and p[0] > p[2]


# ── NLI ──────────────────────────────────────────────────────────────────────

def test_nli_rejects_when_contradiction_dominates():
    model = StubCrossEncoder([5.0, -2.0, -2.0])  # contradiction-dominant logits
    res = service.evaluate_nli(model, "goal", "subtask", threshold=0.5)
    assert res["rejected"] is True
    assert res["score"] > 0.5
    assert set(res["raw_scores"]) == {"contradiction", "entailment", "neutral"}
    assert res["raw_scores"]["contradiction"] == res["score"]
    assert res["margin"] == res["score"] - 0.5 or math.isclose(res["margin"], res["score"] - 0.5, abs_tol=1e-12)
    assert res["latency_ms"] > 0.0


def test_nli_accepts_when_entailment_dominates():
    model = StubCrossEncoder([-2.0, 5.0, -2.0])
    res = service.evaluate_nli(model, "goal", "subtask", threshold=0.5)
    assert res["rejected"] is False
    assert res["score"] < 0.5


# ── contrastive ──────────────────────────────────────────────────────────────

def test_contrastive_rejects_on_low_similarity():
    model = StubSentenceTransformer([1.0, 0.0], [0.0, 1.0])  # cosine 0.0
    res = service.evaluate_contrastive(model, "goal", "subtask", threshold=0.5)
    assert res["rejected"] is True
    assert math.isclose(res["score"], 0.0, abs_tol=1e-9)


def test_contrastive_accepts_on_high_similarity():
    model = StubSentenceTransformer([1.0, 0.0], [0.9, math.sqrt(1 - 0.81)])
    res = service.evaluate_contrastive(model, "goal", "subtask", threshold=0.5)
    assert res["rejected"] is False
    assert math.isclose(res["score"], 0.9, abs_tol=1e-9)


# ── decision combination ─────────────────────────────────────────────────────

def test_combine_decisions():
    assert service.combine_decisions(False, False) == (False, "accepted")
    assert service.combine_decisions(True, False) == (True, "nli_reject")
    assert service.combine_decisions(False, True) == (True, "contrastive_reject")
    assert service.combine_decisions(True, True) == (True, "both_reject")


# ── full pipeline ────────────────────────────────────────────────────────────

def test_full_evaluate_accepted_and_statistics():
    nli = StubCrossEncoder([-2.0, 5.0, -2.0])              # accepted
    con = StubSentenceTransformer([1.0, 0.0], [1.0, 0.0])   # cosine 1.0 -> accepted
    out = service.evaluate(nli, con, "goal", "subtask", 0.5, 0.5,
                           nli_version="nli-v1", contrastive_version="con-v1")
    assert out["result"] is True
    assert out["is_rejected"] is False
    assert out["rejection_reason"] == "accepted"
    assert out["model_version"] == "nli=nli-v1;con=con-v1"
    assert out["statistics"]["rejecting_models"] == []
    assert out["statistics"]["cached"] is False
    assert out["statistics"]["total_latency_ms"] >= 0.0


def test_full_evaluate_both_reject():
    nli = StubCrossEncoder([5.0, -2.0, -2.0])              # rejected
    con = StubSentenceTransformer([1.0, 0.0], [0.0, 1.0])   # cosine 0.0 -> rejected
    out = service.evaluate(nli, con, "goal", "subtask", 0.5, 0.5)
    assert out["is_rejected"] is True
    assert out["result"] is False
    assert out["rejection_reason"] == "both_reject"
    assert set(out["statistics"]["rejecting_models"]) == {"nli", "contrastive"}
