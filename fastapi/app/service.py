"""Pure inference logic.

Deliberately free of FastAPI/pydantic imports so it can be unit-tested with
stub models and without ``sentence_transformers`` installed.

Decision semantics (inferred from ``fastapi/old-training/``):

* **NLI** (``cross-encoder/nli-MiniLM2-L6-H768``, labels
  ``[contradiction, entailment, neutral]``) — the shipped checkpoint has
  ``activation_fn = Identity``, so ``predict`` returns **raw logits**; we
  softmax them. Reject when ``p(contradiction) > threshold``.
* **Contrastive** (``all-MiniLM-L12-v2``, framed ``"Goal: …. Subtask: …."``
  input, cosine) — reject when ``cosine < threshold``.
* Overall — **reject if either model rejects**.
"""

from __future__ import annotations

import time
from typing import Any, Iterable, Mapping

import numpy as np

from .preprocess import format_document, format_nli

# Model output label order (index 0 = contradiction = the malicious class).
NLI_LABELS: tuple[str, str, str] = ("contradiction", "entailment", "neutral")

DECISION_RULE = "reject if either model rejects"


def softmax(scores: Iterable[float]) -> np.ndarray:
    """Return a probability distribution over the NLI labels.

    The shipped checkpoint uses ``activation_fn = Identity`` (raw logits), so a
    softmax is required. If the input already looks like a distribution, it is
    returned unchanged. ``argmax`` is unaffected either way (softmax is
    monotonic).
    """
    s = np.asarray(list(scores), dtype=np.float64)
    if np.all(s >= 0.0) and np.all(s <= 1.0) and abs(float(s.sum()) - 1.0) < 1e-3:
        return s
    e = np.exp(s - np.max(s))
    return e / e.sum()


def evaluate_nli(
    cross_encoder: Any, goal: str, subtask: str, threshold: float
) -> dict[str, Any]:
    """Run the NLI cross-encoder and return score + decision + latency."""
    t0 = time.perf_counter()
    premise, hypothesis = format_nli(goal, subtask)
    probs = softmax(cross_encoder.predict([(premise, hypothesis)])[0])
    latency_ms = (time.perf_counter() - t0) * 1000.0

    p_contradiction = float(probs[0])
    raw_scores = {label: float(probs[i]) for i, label in enumerate(NLI_LABELS)}
    return {
        "score": p_contradiction,
        "threshold": float(threshold),
        "rejected": bool(p_contradiction > threshold),
        "margin": float(p_contradiction - threshold),
        "raw_scores": raw_scores,
        "latency_ms": latency_ms,
    }


def evaluate_contrastive(
    model: Any,
    goal: str,
    subtask: str,
    threshold: float,
    decomposed: Mapping[str, Any] | None = None,
    include_decomposed: bool = False,
) -> dict[str, Any]:
    """Run the contrastive bi-encoder and return cosine + decision + latency."""
    t0 = time.perf_counter()
    goal_text = format_document(goal, goal, decomposed, include_decomposed)
    subtask_text = format_document(goal, subtask, decomposed, include_decomposed)
    goal_emb = model.encode(goal_text, normalize_embeddings=True)
    subtask_emb = model.encode(subtask_text, normalize_embeddings=True)
    similarity = float(np.dot(goal_emb, subtask_emb))
    latency_ms = (time.perf_counter() - t0) * 1000.0

    return {
        "score": similarity,
        "threshold": float(threshold),
        "rejected": bool(similarity < threshold),
        "margin": float(similarity - threshold),
        "latency_ms": latency_ms,
    }


def combine_decisions(
    nli_rejected: bool, contrastive_rejected: bool
) -> tuple[bool, str]:
    """OR-combine the two model verdicts into ``(is_rejected, reason)``."""
    reasons = []
    if nli_rejected:
        reasons.append("nli_reject")
    if contrastive_rejected:
        reasons.append("contrastive_reject")
    if not reasons:
        return False, "accepted"
    return True, "both_reject" if len(reasons) == 2 else reasons[0]


def build_result(
    goal: str,
    subtask: str,
    nli: dict[str, Any],
    contrastive: dict[str, Any],
    nli_version: str = "",
    contrastive_version: str = "",
    cached: bool = False,
) -> dict[str, Any]:
    """Assemble the full response payload from the two model results."""
    is_rejected, reason = combine_decisions(nli["rejected"], contrastive["rejected"])
    rejecting = [
        name for name, res in (("nli", nli), ("contrastive", contrastive)) if res["rejected"]
    ]

    return {
        "goal": goal,
        "subtask": subtask,
        "result": not is_rejected,
        "is_rejected": is_rejected,
        "rejection_reason": reason,
        "model_version": f"nli={nli_version};con={contrastive_version}",
        "nli": {
            "score": nli["score"],
            "threshold": nli["threshold"],
            "rejected": nli["rejected"],
            "margin": nli["margin"],
            "raw_scores": nli["raw_scores"],
            "latency_ms": nli["latency_ms"],
        },
        "contrastive": {
            "score": contrastive["score"],
            "threshold": contrastive["threshold"],
            "rejected": contrastive["rejected"],
            "margin": contrastive["margin"],
            "latency_ms": contrastive["latency_ms"],
        },
        "statistics": {
            "total_latency_ms": nli["latency_ms"] + contrastive["latency_ms"],
            "nli_latency_ms": nli["latency_ms"],
            "contrastive_latency_ms": contrastive["latency_ms"],
            "decision_rule": DECISION_RULE,
            "rejecting_models": rejecting,
            "nli_threshold": nli["threshold"],
            "contrastive_threshold": contrastive["threshold"],
            "cached": cached,
        },
    }


def evaluate(
    nli_model: Any,
    contrastive_model: Any,
    goal: str,
    subtask: str,
    nli_threshold: float,
    contrastive_threshold: float,
    decomposed: Mapping[str, Any] | None = None,
    include_decomposed: bool = False,
    nli_version: str = "",
    contrastive_version: str = "",
) -> dict[str, Any]:
    """Synchronous convenience wrapper running both models sequentially.

    The HTTP layer runs the two models concurrently via ``asyncio.to_thread``;
    this helper exists for tests and non-async callers.
    """
    nli = evaluate_nli(nli_model, goal, subtask, nli_threshold)
    contrastive = evaluate_contrastive(
        contrastive_model, goal, subtask, contrastive_threshold, decomposed, include_decomposed
    )
    return build_result(
        goal, subtask, nli, contrastive, nli_version, contrastive_version
    )
