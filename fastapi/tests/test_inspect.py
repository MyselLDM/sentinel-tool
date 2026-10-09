"""Tests for the debug encoding inspection (app.service.inspect_*).

Like ``test_service.py`` these run with stub models and without
``sentence_transformers`` — the stubs mimic the tiny slice of the CrossEncoder /
SentenceTransformer / tokenizer interface the inspection touches. Torch is only
needed for the per-token-vector path, which is skipped when it is absent.
"""

from __future__ import annotations

import numpy as np
import pytest

from app import service


class StubTokenizer:
    def convert_ids_to_tokens(self, ids):
        return [f"t{i}" for i in ids]


class StubCrossEncoder:
    """Mimics ``preprocess`` + ``forward`` (pre-activation logits)."""

    device = "cpu"

    def __init__(self, logits=(2.0, -1.0, 0.0)):
        self.tokenizer = StubTokenizer()
        self._logits = np.asarray(logits, dtype=float)
        self.transformers_model = _StubHiddenModule(dim=8)

    def preprocess(self, pairs, prompt=None):  # noqa: ARG002 - signature parity
        return {
            "input_ids": np.asarray([[0, 10, 11, 2]]),
            "attention_mask": np.asarray([[1, 1, 1, 1]]),
            "modality": None,
        }

    def forward(self, features):  # noqa: ARG002
        return {"scores": self._logits[None, :]}


class StubSentenceTransformer:
    """Mimics ``preprocess`` + ``encode`` (normalized vectors in call order)."""

    device = "cpu"

    def __init__(self, goal, subtask):
        self.tokenizer = StubTokenizer()
        self._vectors = [np.asarray(goal, dtype=float), np.asarray(subtask, dtype=float)]
        self._i = 0
        self.transformers_model = _StubHiddenModule(dim=4)

    def preprocess(self, texts, prompt=None):  # noqa: ARG002
        n = len(texts[0].split())
        return {
            "input_ids": np.asarray([[0] * n]),
            "attention_mask": np.asarray([[1] * n]),
            "modality": "text",
        }

    def encode(self, text, normalize_embeddings=True):  # noqa: ARG002
        v = self._vectors[self._i]
        self._i += 1
        return v / np.linalg.norm(v) if normalize_embeddings else v


class _StubHiddenModule:
    """Stand-in for the underlying ``transformers`` model (torch only)."""

    device = "cpu"

    def __init__(self, dim):
        self.dim = dim

    def __call__(self, output_hidden_states=False, **kwargs):  # noqa: ARG002
        import torch

        n_tokens = np.asarray(kwargs["input_ids"]).shape[-1]
        out = type("Output", (), {})()
        out.hidden_states = (torch.zeros(1, n_tokens, self.dim),)
        return out


# ── NLI inspection ───────────────────────────────────────────────────────────

def test_inspect_nli_exposes_tokens_and_pre_softmax_logits():
    res = service.inspect_nli(StubCrossEncoder(), "goal", "subtask", threshold=0.5)

    assert res["tokens"] == ["t0", "t10", "t11", "t2"]
    assert res["input_ids"] == [0, 10, 11, 2]
    assert res["attention_mask"] == [1, 1, 1, 1]
    assert res["labels"] == list(service.NLI_LABELS)
    assert res["logits"] == [2.0, -1.0, 0.0]
    assert abs(sum(res["probabilities"].values()) - 1.0) < 1e-9
    assert res["token_vectors"] is None
    # The reported score is the softmax of the raw logits.
    assert res["score"] == pytest.approx(float(service.softmax(res["logits"])[0]))


def test_inspect_nli_decision_matches_score_and_threshold():
    model = StubCrossEncoder(logits=(5.0, -2.0, -2.0))
    res = service.inspect_nli(model, "goal", "subtask", threshold=0.5)
    assert res["rejected"] is True
    assert res["margin"] == pytest.approx(res["score"] - 0.5)


def test_inspect_nli_token_vectors_when_available():
    pytest.importorskip("torch")
    res = service.inspect_nli(
        StubCrossEncoder(), "goal", "subtask", threshold=0.5,
        token_vectors=True, dims=0,
    )
    assert res["token_vector_dim"] == 8          # full width of the stub module
    assert len(res["token_vectors"]) == 4         # one vector per input token
    assert all(len(v) == 8 for v in res["token_vectors"])


def test_inspect_nli_truncates_token_vectors_with_dims():
    pytest.importorskip("torch")
    res = service.inspect_nli(
        StubCrossEncoder(), "goal", "subtask", threshold=0.5,
        token_vectors=True, dims=3,
    )
    assert res["token_vector_dim"] == 8           # width reported before truncation
    assert len(res["token_vectors"][0]) == 3


# ── Contrastive inspection ───────────────────────────────────────────────────

def test_inspect_contrastive_reports_embeddings_and_cosine():
    model = StubSentenceTransformer(goal=[1.0, 0.0], subtask=[1.0, 0.0])
    res = service.inspect_contrastive(model, "goal here", "subtask here", threshold=0.5)

    assert res["goal_text"] == "Goal: goal here. Subtask: goal here."
    assert res["subtask_text"] == "Goal: goal here. Subtask: subtask here."
    assert res["goal_embedding"] == [1.0, 0.0]
    assert res["goal_embedding_norm"] == pytest.approx(1.0)
    assert res["embedding_dim"] == 2
    assert res["cosine_similarity"] == pytest.approx(1.0)
    assert res["rejected"] is False
    assert res["subtask_tokens"][0] == "t0"


def test_inspect_contrastive_rejects_below_threshold():
    model = StubSentenceTransformer(goal=[1.0, 0.0], subtask=[0.0, 1.0])
    res = service.inspect_contrastive(model, "a", "b", threshold=0.5)
    assert res["cosine_similarity"] == pytest.approx(0.0)
    assert res["rejected"] is True


def test_inspect_contrastive_matches_evaluate_contrastive_score():
    inspected = service.inspect_contrastive(
        StubSentenceTransformer(goal=[1.0, 1.0], subtask=[1.0, 0.0]), "g", "s", 0.5
    )
    plain = service.evaluate_contrastive(
        StubSentenceTransformer(goal=[1.0, 1.0], subtask=[1.0, 0.0]), "g", "s", 0.5
    )
    assert inspected["cosine_similarity"] == pytest.approx(plain["score"])


def test_inspect_contrastive_truncates_embeddings_with_dims():
    model = StubSentenceTransformer(goal=[1.0, 0.0, 0.0, 0.0], subtask=[1.0, 0.0, 0.0, 0.0])
    res = service.inspect_contrastive(model, "g", "s", threshold=0.5, dims=2)
    assert len(res["goal_embedding"]) == 2
    assert res["embedding_dim"] == 4              # full width reported regardless
