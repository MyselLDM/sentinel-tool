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


# ── Encoding inspection (debug) ──────────────────────────────────────────────
#
# The evaluate_* functions above deliberately hide the model internals. The
# inspect_* functions below mirror them but surface the *encoding* — framed
# text, subword tokens/ids, embeddings and the raw (pre-softmax) logits — so a
# developer can see exactly what each model sees before it decides.
#
# They live here (not in the router) to keep every model call in one pure,
# unit-testable place, and, like the rest of this module, they import torch only
# lazily so the file stays importable without the ML stack.


def _to_device(features: Mapping[str, Any], device: str) -> dict[str, Any]:
    """Return ``features`` with tensors moved onto ``device`` (non-tensors as-is)."""
    return {
        key: (value.to(device) if hasattr(value, "to") else value)
        for key, value in features.items()
    }


def _rounded(values: Iterable[float], dims: int = 0) -> list[float]:
    """Round a vector for readability and truncate it to ``dims`` (0 = keep all)."""
    out = [round(float(v), 6) for v in values]
    return out[:dims] if dims > 0 else out


def _hidden_states(
    module: Any, features: Mapping[str, Any], dims: int = 0
) -> tuple[list[list[float]], int]:
    """Return the final encoder layer's per-token vectors for one sequence.

    ``module`` is the underlying ``transformers`` model. Torch is imported here
    rather than at module scope to keep this file importable without torch.
    """
    import torch

    device = str(getattr(module, "device", "cpu"))
    kwargs = {
        key: (value.to(device) if hasattr(value, "to") else value)
        for key, value in features.items()
        if key != "modality"
    }
    with torch.inference_mode():
        output = module(output_hidden_states=True, **kwargs)
    hidden = getattr(output, "hidden_states", None)
    last = hidden[-1] if hidden else output.last_hidden_state
    matrix = last[0].float().cpu().tolist()
    return [_rounded(row, dims) for row in matrix], int(last.shape[-1])


def _tokenize(model: Any, text: str, device: str) -> tuple[dict[str, Any], list[str]]:
    """Tokenize ``text`` the way ``encode`` would, returning features + tokens."""
    features = _to_device(model.preprocess([text], prompt=None), device)
    input_ids = [int(i) for i in features["input_ids"][0].tolist()]
    return features, list(model.tokenizer.convert_ids_to_tokens(input_ids))


def inspect_nli(
    cross_encoder: Any,
    goal: str,
    subtask: str,
    threshold: float,
    *,
    token_vectors: bool = False,
    dims: int = 0,
) -> dict[str, Any]:
    """``evaluate_nli`` plus the intermediates: framing, tokens, logits, vectors."""
    t0 = time.perf_counter()
    premise, hypothesis = format_nli(goal, subtask)
    device = str(getattr(cross_encoder, "device", "cpu"))
    features = _to_device(
        cross_encoder.preprocess([(premise, hypothesis)], prompt=None), device
    )

    input_ids = [int(i) for i in features["input_ids"][0].tolist()]
    attention_mask = [int(m) for m in features["attention_mask"][0].tolist()]
    # ``forward`` returns the pre-activation scores ("logits"); ``predict`` would
    # apply the checkpoint's activation_fn on top of these.
    logits = [float(x) for x in cross_encoder.forward(dict(features))["scores"][0].tolist()]
    probs = softmax(logits)

    vectors: list[list[float]] | None = None
    dim: int | None = None
    if token_vectors:
        vectors, dim = _hidden_states(cross_encoder.transformers_model, features, dims)

    p_contradiction = float(probs[0])
    return {
        "premise": premise,
        "hypothesis": hypothesis,
        "tokens": list(cross_encoder.tokenizer.convert_ids_to_tokens(input_ids)),
        "input_ids": input_ids,
        "attention_mask": attention_mask,
        "labels": list(NLI_LABELS),
        "logits": logits,
        "probabilities": {label: float(probs[i]) for i, label in enumerate(NLI_LABELS)},
        "score": p_contradiction,
        "threshold": float(threshold),
        "rejected": bool(p_contradiction > threshold),
        "margin": float(p_contradiction - threshold),
        "token_vectors": vectors,
        "token_vector_dim": dim,
        "latency_ms": (time.perf_counter() - t0) * 1000.0,
    }


def inspect_contrastive(
    model: Any,
    goal: str,
    subtask: str,
    threshold: float,
    decomposed: Mapping[str, Any] | None = None,
    include_decomposed: bool = False,
    *,
    token_vectors: bool = False,
    dims: int = 0,
) -> dict[str, Any]:
    """``evaluate_contrastive`` plus the intermediates: tokens, embeddings, vectors."""
    t0 = time.perf_counter()
    goal_text = format_document(goal, goal, decomposed, include_decomposed)
    subtask_text = format_document(goal, subtask, decomposed, include_decomposed)
    device = str(getattr(model, "device", "cpu"))

    goal_features, goal_tokens = _tokenize(model, goal_text, device)
    subtask_features, subtask_tokens = _tokenize(model, subtask_text, device)

    goal_emb = np.asarray(model.encode(goal_text, normalize_embeddings=True), dtype=np.float64)
    subtask_emb = np.asarray(
        model.encode(subtask_text, normalize_embeddings=True), dtype=np.float64
    )
    similarity = float(np.dot(goal_emb, subtask_emb))

    goal_vectors: list[list[float]] | None = None
    subtask_vectors: list[list[float]] | None = None
    dim: int | None = None
    if token_vectors:
        goal_vectors, dim = _hidden_states(model.transformers_model, goal_features, dims)
        subtask_vectors, dim = _hidden_states(model.transformers_model, subtask_features, dims)

    def _ids(features: Mapping[str, Any], key: str) -> list[int]:
        return [int(x) for x in features[key][0].tolist()]

    return {
        "goal_text": goal_text,
        "subtask_text": subtask_text,
        "goal_tokens": goal_tokens,
        "goal_input_ids": _ids(goal_features, "input_ids"),
        "goal_attention_mask": _ids(goal_features, "attention_mask"),
        "goal_embedding": _rounded(goal_emb, dims),
        "goal_embedding_norm": float(np.linalg.norm(goal_emb)),
        "goal_token_vectors": goal_vectors,
        "subtask_tokens": subtask_tokens,
        "subtask_input_ids": _ids(subtask_features, "input_ids"),
        "subtask_attention_mask": _ids(subtask_features, "attention_mask"),
        "subtask_embedding": _rounded(subtask_emb, dims),
        "subtask_embedding_norm": float(np.linalg.norm(subtask_emb)),
        "subtask_token_vectors": subtask_vectors,
        "token_vector_dim": dim,
        "embedding_dim": int(goal_emb.shape[-1]),
        "cosine_similarity": similarity,
        "threshold": float(threshold),
        "rejected": bool(similarity < threshold),
        "margin": float(similarity - threshold),
        "latency_ms": (time.perf_counter() - t0) * 1000.0,
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
