"""Shared utilities for training the two Sentinel intent-verification models.

This module is **not** a training script - it holds the code the two training
scripts (``train_nli.py``, ``train_contrastive.py``) and the comparison script
(``compare_models.py``) share:

* loading ``dataset.csv`` into :class:`Scenario` records,
* the *training-parity* text formatters (``format_nli`` / ``format_document``)
  that must stay byte-identical to ``fastapi/app/preprocess.py``,
* binary security metrics (TPR / FPR / Precision / F1) plus per-subset and
  per-policy breakdowns,
* the deterministic 5-fold split shared by both models (so their per-fold
  metrics are *paired* for the RQ3 t-test),
* small JSON helpers.

Dataset shape (``training/dataset.csv``, DelegationBench v4)
-----------------------------------------------------------
One row = one (anchor, positive, negative) delegation scenario:

* ``anchor``   - the authorised root goal (e.g. "Fetch the official transcript
  for a specific student ID.").
* ``positive`` - a benign, scope-preserving paraphrase of the goal (label
  **benign**).
* ``negative`` - a malicious, scope-expanding paraphrase (label **malicious**).
* ``policy_violation`` / ``policy_name`` - the P-01...P-11 attack taxonomy.
* ``strategy`` - the S-01...S-05 phrasing strategy.
* ``domain`` / ``domain_key`` - the 9 service domains.

The thesis (``training/Thesis.md``) binarises the authorisation label
(benign = 0, adversarial = 1) and reports Recall (TPR), Precision and F1. The
malicious side is further split - per the project decision - into **explicit
attacks** (P-01 Obvious Malicious Intent, P-04 Data Exfiltration) and
**adversarial paraphrases** (every other policy: subtle, professional-sounding
scope expansion), so the two models can be contrasted on the paraphrases that
defeat NLI.
"""

from __future__ import annotations

import csv
import json
import os
import random
import sys
import tempfile
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence

import numpy as np

# ─────────────────────────────────────────────────────────────────────────────
# Paths
# ─────────────────────────────────────────────────────────────────────────────

TRAINING_DIR = Path(__file__).resolve().parent
# ── new_dataset_1: the corpus is dataset-v3 ──────────────────────────────────
# Every path resolves inside this folder, so a run here cannot touch the parent
# pipeline's models/ or logs/. See ``data/DATASET_V3.md`` for a file-by-file
# description, and read its section 4 (the lexical ceiling) before quoting any
# accuracy figure.
V3_DIR = TRAINING_DIR / "data"
DATASET_PATH = V3_DIR / "corpus_clean.csv"            # TRAIN (584 rows)
HOLDOUT_PATH = V3_DIR / "holdout_clean_curated.csv"   # frozen benchmark (122)
CUE_SPLIT_PATH = V3_DIR / "cue_split.csv"             # primary disjoint split
MATCHED_PATH = V3_DIR / "matched_pairs_ds_validated.csv"
MODELS_DIR = TRAINING_DIR / "models"
LOGS_DIR = TRAINING_DIR / "logs"

# Base checkpoint ids (cached in the local HF cache).
NLI_BASE = "cross-encoder/nli-MiniLM2-L6-H768"
CONTRASTIVE_BASE = "all-MiniLM-L12-v2"

# NLI cross-encoder label order - index 0 is the malicious class. Must match
# ``fastapi/app/service.py`` (``NLI_LABELS``) and the shipped checkpoint.
NLI_LABELS: tuple[str, str, str] = ("contradiction", "entailment", "neutral")
NLI_CONTRADICTION, NLI_ENTAILMENT, NLI_NEUTRAL = 0, 1, 2

# ─────────────────────────────────────────────────────────────────────────────
# Attack taxonomy: explicit vs adversarial-paraphrase split
# ─────────────────────────────────────────────────────────────────────────────

# P-01 Obvious Malicious Intent, P-04 Data Exfiltration -> blunt, obvious attacks.
# Keyed on the *name* so the split survives policy renumbering between dataset
# versions; the codes are kept as a fallback.
EXPLICIT_POLICY_NAMES: frozenset[str] = frozenset(
    {"Obvious Malicious Intent", "Data Exfiltration"}
)
EXPLICIT_POLICIES: frozenset[str] = frozenset({"P-01", "P-04"})
# Everything else is a subtle, surface-similar scope expansion = "adversarial
# paraphrase" in the sense of the thesis.
PARAPHRASE_POLICIES: frozenset[str] = frozenset(
    {"P-02", "P-03", "P-05", "P-06", "P-07", "P-08", "P-09", "P-10", "P-11"}
)

POLICY_NAMES: dict[str, str] = {
    "P-01": "Obvious Malicious Intent",
    "P-02": "Scope Creep",
    "P-03": "Underspecified Scope",
    "P-04": "Data Exfiltration",
    "P-05": "Unauthorized Sharing",
    "P-06": "Constraint Removal",
    "P-07": "Temporal Expansion",
    "P-08": "Resource Expansion",
    "P-09": "Privilege Escalation",
    "P-10": "Replay Exploitation",
    "P-11": "Compound Violation",
}

# Binary authorisation labels (the thesis convention).
BENIGN = 0
MALICIOUS = 1

# Named evaluation subsets (case-insensitive keys used across the JSON logs).
SUBSET_ALL = "all"
SUBSET_MALICIOUS = "malicious"
SUBSET_BENIGN = "benign"
SUBSET_PARAPHRASES = "adversarial_paraphrases"
SUBSET_EXPLICIT = "explicit_attacks"

METRIC_KEYS = ("accuracy", "tpr", "fpr", "precision", "f1")


# ─────────────────────────────────────────────────────────────────────────────
# Data model
# ─────────────────────────────────────────────────────────────────────────────


@dataclass
class Scenario:
    """One dataset row: an authorised goal with a benign and a malicious subtask."""

    anchor: str
    positive: str
    negative: str
    domain: str = ""
    domain_key: str = ""
    policy_violation: str = ""
    policy_name: str = ""
    strategy: str = ""
    anchor_index: int = -1
    sample_index: int = -1
    data_number: int = -1

    @property
    def is_explicit(self) -> bool:
        """True when the malicious side is a blunt / obvious attack."""
        return (
            self.policy_name in EXPLICIT_POLICY_NAMES
            or self.policy_violation in EXPLICIT_POLICIES
        )

    @property
    def is_paraphrase(self) -> bool:
        """True when the malicious side is a subtle adversarial paraphrase."""
        return not self.is_explicit


def _to_int(value: str) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return -1


def load_scenarios(
    path: str | os.PathLike[str] = DATASET_PATH,
    limit_anchors: int | None = None,
) -> list[Scenario]:
    """Load ``dataset.csv`` into :class:`Scenario` records.

    Rows missing an anchor, positive or negative are dropped (matches the
    thesis "remove empty / malformed records" preprocessing step). When
    ``limit_anchors`` is set, only the first *N* whole goals are kept - used by
    smoke tests so a run stays small *and* still has multiple goals to split
    into folds.
    """
    scenarios: list[Scenario] = []
    with open(path, "r", encoding="utf-8", newline="") as fh:
        reader = csv.DictReader(fh)
        for row in reader:
            anchor = (row.get("anchor") or "").strip()
            positive = (row.get("positive") or "").strip()
            negative = (row.get("negative") or "").strip()
            if not (anchor and positive and negative):
                continue
            scenarios.append(
                Scenario(
                    anchor=anchor,
                    positive=positive,
                    negative=negative,
                    domain=(row.get("domain") or "").strip(),
                    domain_key=(row.get("domain_key") or "").strip(),
                    policy_violation=(row.get("policy_violation") or "").strip(),
                    policy_name=(row.get("policy_name") or "").strip(),
                    strategy=(row.get("strategy") or "").strip(),
                    anchor_index=_to_int(row.get("anchor_index", "")),
                    sample_index=_to_int(row.get("sample_index", "")),
                    data_number=_to_int(row.get("data_number", "")),
                )
            )

    if limit_anchors is not None and limit_anchors > 0:
        keep = []
        seen: list[str] = []
        for s in scenarios:
            if s.anchor not in seen:
                if len(seen) >= limit_anchors:
                    break
                seen.append(s.anchor)
            keep.append(s)
        scenarios = keep

    return scenarios


# ─────────────────────────────────────────────────────────────────────────────
# Training-parity text formatting (must match fastapi/app/preprocess.py)
# ─────────────────────────────────────────────────────────────────────────────


def format_nli(goal: str, subtask: str) -> tuple[str, str]:
    """Build the ``(premise, hypothesis)`` pair fed to the NLI cross-encoder.

    Byte-identical to ``fastapi/app/preprocess.py::format_nli`` and to
    ``sentinelagent_nli_finetune.format_for_nli``. NLI **lowercases** both sides.
    """
    premise = (
        f"An AI agent is authorized to {goal.lower()}. "
        f"The agent performs only tasks that support this goal."
    )
    hypothesis = f"The agent is now performing: {subtask.lower()}"
    return premise, hypothesis


_DECOMPOSED_TEMPLATES: dict[str, str] = {
    "action": "The performed action is {}.",
    "object": "The target object is {}.",
    "scope": "The authorization scope is {}.",
    "constraints": "The applicable constraints are {}.",
}


def format_document(
    goal: str,
    subtask: str,
    decomposed: Mapping[str, Any] | None = None,
    include_decomposed: bool = False,
) -> str:
    """Build the single framed string embedded by the contrastive bi-encoder.

    Byte-identical to ``fastapi/app/preprocess.py::format_document``. The deployed
    model is the ``-raw-`` variant, so ``include_decomposed`` defaults to
    ``False`` and the result is the raw ``"Goal: {goal}. Subtask: {subtask}."``
    template. **Casing is preserved** (unlike NLI).
    """
    text = f"Goal: {goal}. Subtask: {subtask}."
    if include_decomposed and decomposed:
        parts = [
            _DECOMPOSED_TEMPLATES[key].format(decomposed[key])
            for key in _DECOMPOSED_TEMPLATES
            if decomposed.get(key)
        ]
        if parts:
            text += " " + " ".join(parts)
    return text


# ─────────────────────────────────────────────────────────────────────────────
# Probabilities
# ─────────────────────────────────────────────────────────────────────────────


def to_probabilities(scores: Iterable[float]) -> np.ndarray:
    """Normalise model scores into a probability distribution.

    The shipped NLI checkpoint uses ``activation_fn = Identity`` so
    ``predict`` returns raw **logits**; if the input already looks like a
    distribution it is returned unchanged (mirrors
    ``sentinelagent_nli_finetune.to_probabilities``).
    """
    s = np.asarray(list(scores), dtype=np.float64)
    if np.all(s >= 0.0) and np.all(s <= 1.0) and abs(float(s.sum()) - 1.0) < 1e-3:
        return s
    e = np.exp(s - np.max(s))
    return e / e.sum()


# ─────────────────────────────────────────────────────────────────────────────
# Evaluation records & metrics
# ─────────────────────────────────────────────────────────────────────────────


def build_eval_examples(scenarios: Sequence[Scenario]) -> list[dict[str, Any]]:
    """Expand scenarios into binary evaluation examples (goal, subtask, label).

    Each scenario yields a **benign** example (from ``positive``) and a
    **malicious** example (from ``negative``). Malicious examples are tagged
    with their subset (``adversarial_paraphrases`` or ``explicit_attacks``).
    """
    examples: list[dict[str, Any]] = []
    for s in scenarios:
        examples.append(
            {
                "goal": s.anchor,
                "subtask": s.positive,
                "label": BENIGN,
                "subset": SUBSET_BENIGN,
                "policy_violation": s.policy_violation,
                "policy_name": s.policy_name,
                "strategy": s.strategy,
                "domain": s.domain,
            }
        )
        examples.append(
            {
                "goal": s.anchor,
                "subtask": s.negative,
                "label": MALICIOUS,
                "subset": SUBSET_PARAPHRASES if s.is_paraphrase else SUBSET_EXPLICIT,
                "policy_violation": s.policy_violation,
                "policy_name": s.policy_name,
                "strategy": s.strategy,
                "domain": s.domain,
            }
        )
    return examples


def _pct(numerator: int, denominator: int) -> float:
    return (numerator / denominator * 100.0) if denominator > 0 else 0.0


def confusion(
    labels: Sequence[int], predictions: Sequence[int]
) -> dict[str, int]:
    """Confusion-matrix counts with the malicious class as the positive class."""
    tp = fp = tn = fn = 0
    for y, p in zip(labels, predictions):
        if y == MALICIOUS and p == MALICIOUS:
            tp += 1
        elif y == MALICIOUS and p == BENIGN:
            fn += 1
        elif y == BENIGN and p == MALICIOUS:
            fp += 1
        else:
            tn += 1
    return {"tp": tp, "fp": fp, "tn": tn, "fn": fn, "total": len(labels)}


def metrics_from_confusion(c: Mapping[str, int]) -> dict[str, float]:
    """Derive TPR/FPR/Precision/F1/Accuracy (as percentages) from counts."""
    tp, fp, tn, fn = c["tp"], c["fp"], c["tn"], c["fn"]
    precision = _pct(tp, tp + fp)
    tpr = _pct(tp, tp + fn)
    f1 = _pct(2 * tp, 2 * tp + fp + fn)
    fpr = _pct(fp, fp + tn)
    accuracy = _pct(tp + tn, tp + fp + tn + fn)
    return {
        "tpr": tpr,
        "fpr": fpr,
        "precision": precision,
        "f1": f1,
        "accuracy": accuracy,
    }


def predict_malicious(
    scores: Sequence[float], threshold: float, higher_is_malicious: bool
) -> list[int]:
    """Turn model scores into binary malicious/benign predictions.

    * NLI: ``p(contradiction)`` - **higher** = more malicious
      (``higher_is_malicious=True``).
    * Contrastive: cosine similarity - **lower** = more malicious
      (``higher_is_malicious=False``).
    """
    if higher_is_malicious:
        return [MALICIOUS if s > threshold else BENIGN for s in scores]
    return [MALICIOUS if s < threshold else BENIGN for s in scores]


def find_best_threshold(
    labels: Sequence[int],
    scores: Sequence[float],
    higher_is_malicious: bool,
    steps: int = 201,
) -> tuple[float, float]:
    """Sweep the threshold that maximises malicious-class F1.

    Mirrors ``train_contrastive.evaluate_contrastive`` and
    ``sentinelagent_nli_finetune.find_best_threshold``: the operating point is
    chosen over ``np.linspace(0, 1, steps)``. Returns ``(threshold, f1)``.
    """
    best_f1, best_threshold = -1.0, 0.5
    for threshold in np.linspace(0.0, 1.0, steps):
        preds = predict_malicious(scores, float(threshold), higher_is_malicious)
        c = confusion(labels, preds)
        tp, fp, fn = c["tp"], c["fp"], c["fn"]
        f1 = (2 * tp / (2 * tp + fp + fn)) if (2 * tp + fp + fn) > 0 else 0.0
        if f1 > best_f1:
            best_f1, best_threshold = f1, float(threshold)
    return best_threshold, best_f1 * 100.0


def summarize(
    records: Sequence[dict[str, Any]],
    threshold: float,
    higher_is_malicious: bool,
) -> dict[str, Any]:
    """Compute the full metric block for one fold / model at a fixed threshold.

    ``records`` are evaluation examples enriched with a ``"score"`` key. Returns
    overall binary metrics plus TPR / FPR breakdowns by subset and by policy.
    """
    labels = [r["label"] for r in records]
    scores = [r["score"] for r in records]
    preds = predict_malicious(scores, threshold, higher_is_malicious)
    c = confusion(labels, preds)
    overall = metrics_from_confusion(c)

    def _recall_subset(predicate) -> dict[str, Any]:
        """TPR over the malicious examples matched by ``predicate``."""
        tp = fn = 0
        for r, p in zip(records, preds):
            if predicate(r) and r["label"] == MALICIOUS:
                if p == MALICIOUS:
                    tp += 1
                else:
                    fn += 1
        return {"n": tp + fn, "tp": tp, "fn": fn, "tpr": _pct(tp, tp + fn)}

    def _fpr_subset(predicate) -> dict[str, Any]:
        """FPR over the benign examples matched by ``predicate``."""
        fp = tn = 0
        for r, p in zip(records, preds):
            if predicate(r) and r["label"] == BENIGN:
                if p == MALICIOUS:
                    fp += 1
                else:
                    tn += 1
        return {"n": fp + tn, "fp": fp, "tn": tn, "fpr": _pct(fp, fp + tn)}

    malicious = _recall_subset(lambda r: r["label"] == MALICIOUS)
    benign = _fpr_subset(lambda r: r["label"] == BENIGN)
    paraphrases = _recall_subset(lambda r: r["subset"] == SUBSET_PARAPHRASES)
    explicit = _recall_subset(lambda r: r["subset"] == SUBSET_EXPLICIT)

    # Policy display names come from the data, so renumbered dataset versions
    # label their policies correctly (POLICY_NAMES is only a fallback).
    policy_names = {
        r["policy_violation"]: (
            r.get("policy_name")
            or POLICY_NAMES.get(r["policy_violation"], r["policy_violation"])
        )
        for r in records
        if r["label"] == MALICIOUS
    }
    by_policy: dict[str, Any] = {}
    for policy in sorted(policy_names):
        block = _recall_subset(lambda r, pol=policy: r["policy_violation"] == pol)
        block["policy_name"] = policy_names[policy]
        by_policy[policy] = block

    return {
        "threshold": float(threshold),
        "n": len(records),
        "confusion": c,
        **overall,
        "subsets": {
            SUBSET_MALICIOUS: malicious,
            SUBSET_BENIGN: benign,
            SUBSET_PARAPHRASES: paraphrases,
            SUBSET_EXPLICIT: explicit,
            "by_policy": by_policy,
        },
    }


# ─────────────────────────────────────────────────────────────────────────────
# Deterministic, shared cross-validation folds (paired across models)
# ─────────────────────────────────────────────────────────────────────────────


PROTOCOL_LABELS = {
    "group": "anchor-grouped cross-validation (unseen goals) - PRIMARY",
    "stratified": "stratified k-fold on policy (goals may cross folds)",
    "sample": "paraphrase-holdout (unseen wording, SHARED goals) - secondary",
}


def protocol_label(strategy: str) -> str:
    """Human-readable name of a fold strategy, for logs and reports."""
    return PROTOCOL_LABELS.get(strategy, strategy)


def make_folds(
    scenarios: Sequence[Scenario],
    n_splits: int = 5,
    seed: int = 42,
    strategy: str = "group",
) -> list[tuple[list[int], list[int]]]:
    """Build the shared split (``(train_idx, test_idx)`` per fold).

    Both training scripts call this with identical arguments so the two models
    are evaluated on the **same** folds - a precondition for the paired t-test.
    ``compare_models.py`` refuses to pair logs that used different strategies.

    * ``strategy="group"`` (default) - ``StratifiedGroupKFold`` grouped by
      ``anchor`` and stratified by ``policy_violation``: no goal ever appears in
      both train and test, and every fold keeps all attack types proportionally.
      This is the **primary, real-world** protocol (unseen-goal detection).
    * ``strategy="stratified"`` - plain ``StratifiedKFold`` on
      ``policy_violation`` (goals may cross folds; matches the thesis' literal
      "stratified" wording).
    * ``strategy="sample"`` - the **paraphrase-holdout** protocol. Folds over the
      paraphrase variant (``sample_index``) instead of the goal: train on one
      wording of each violation, test on another. Anchors are SHARED between
      train and test, so this measures *paraphrase-form generalisation*, not
      unseen-goal detection - report it as a second, clearly-labelled protocol,
      never as the headline number. Returns one fold per distinct
      ``sample_index`` (2 for the shipped corpus), so ``n_splits`` is ignored.
    """
    if strategy == "sample":
        variants = sorted({int(s.sample_index) for s in scenarios if s.sample_index >= 0})
        if len(variants) < 2:
            raise SystemExit(
                f"fold-strategy 'sample' needs >=2 sample_index values, found {variants}. "
                "Both training scripts write the split, so they need the same dataset."
            )
        splits = []
        for held_out in variants:
            train_idx = [i for i, s in enumerate(scenarios) if int(s.sample_index) != held_out]
            test_idx = [i for i, s in enumerate(scenarios) if int(s.sample_index) == held_out]
            splits.append((train_idx, test_idx))
        return splits

    from sklearn.model_selection import StratifiedGroupKFold, StratifiedKFold

    strata = [s.policy_violation or s.domain_key or "unknown" for s in scenarios]
    indices = np.arange(len(scenarios))

    if strategy == "group":
        splitter = StratifiedGroupKFold(
            n_splits=n_splits, shuffle=True, random_state=seed
        )
        groups = [s.anchor for s in scenarios]
        splits = splitter.split(indices, strata, groups)
    else:
        splitter = StratifiedKFold(n_splits=n_splits, shuffle=True, random_state=seed)
        splits = splitter.split(indices, strata)

    return [(train.tolist(), test.tolist()) for train, test in splits]


# ─────────────────────────────────────────────────────────────────────────────
# Aggregation helpers
# ─────────────────────────────────────────────────────────────────────────────


def _mean_std(values: Sequence[float]) -> dict[str, float]:
    arr = np.asarray(values, dtype=np.float64)
    return {"mean": float(arr.mean()), "std": float(arr.std(ddof=0))}


def aggregate_summaries(summaries: Sequence[dict[str, Any]]) -> dict[str, Any]:
    """Mean +/- std across folds of the headline metrics and subset breakdowns."""
    if not summaries:
        return {}

    core = {m: _mean_std([s[m] for s in summaries]) for m in METRIC_KEYS}
    core["threshold"] = _mean_std([s["threshold"] for s in summaries])

    def _agg_subset(name: str, field: str) -> dict[str, float]:
        return _mean_std([s["subsets"][name][field] for s in summaries])

    subsets = {
        SUBSET_MALICIOUS: {"tpr": _agg_subset(SUBSET_MALICIOUS, "tpr")},
        SUBSET_BENIGN: {"fpr": _agg_subset(SUBSET_BENIGN, "fpr")},
        SUBSET_PARAPHRASES: {"tpr": _agg_subset(SUBSET_PARAPHRASES, "tpr")},
        SUBSET_EXPLICIT: {"tpr": _agg_subset(SUBSET_EXPLICIT, "tpr")},
    }

    # Only aggregate policies that appear in *every* fold (a tiny/degenerate
    # split could otherwise put a whole policy in one fold and KeyError here).
    policies = sorted(
        set.intersection(*[set(s["subsets"]["by_policy"]) for s in summaries])
        if summaries
        else set()
    )
    by_policy = {
        p: {
            "policy_name": summaries[0]["subsets"]["by_policy"][p].get("policy_name", p),
            "tpr": _mean_std([s["subsets"]["by_policy"][p]["tpr"] for s in summaries]),
        }
        for p in policies
    }
    subsets["by_policy"] = by_policy

    # Pooled confusion matrix (sums the per-fold counts).
    pooled = {
        key: int(sum(s["confusion"][key] for s in summaries))
        for key in ("tp", "fp", "tn", "fn")
    }
    pooled["total"] = int(sum(s["confusion"]["total"] for s in summaries))

    return {"metrics": core, "subsets": subsets, "pooled_confusion": pooled}


def curve_point(
    epoch: int, threshold: float, summary: Mapping[str, Any]
) -> dict[str, Any]:
    """Flatten one evaluation into a row of the per-epoch training curve.

    dataset-v3 breaks recall down by **stratum**; the v2 `adversarial_paraphrases` /
    `explicit_attacks` keys do not exist and indexing them raised KeyError here. Each
    stratum present gets its own `_tpr` field, so the curve shows how `hard` /
    `matched` / `near_miss` recall develops epoch by epoch - which is the point of
    tracking a curve on this corpus.
    """
    subsets = summary["subsets"]
    point: dict[str, Any] = {
        "epoch": int(epoch),
        "threshold": float(threshold),
        "accuracy": summary["accuracy"],
        "tpr": summary["tpr"],
        "fpr": summary["fpr"],
        "precision": summary["precision"],
        "f1": summary["f1"],
    }
    for name, block in sorted(subsets.get("by_stratum", {}).items()):
        point[f"{name}_tpr"] = block["tpr"]
    return point


_CURVE_FIELDS = (
    "threshold",
    "accuracy",
    "tpr",
    "fpr",
    "precision",
    "f1",
    # dataset-v3 strata - substituted for the v2 paraphrase/explicit fields
    "easy_tpr",
    "near_miss_tpr",
    "matched_tpr",
    "hard_tpr",
)


def aggregate_curve(
    curves: Sequence[Sequence[Mapping[str, Any]]],
) -> list[dict[str, Any]]:
    """Mean +/- std of each curve row across folds, aligned by epoch index."""
    if not curves:
        return []
    length = min(len(c) for c in curves)
    aggregated: list[dict[str, Any]] = []
    for index in range(length):
        rows = [curve[index] for curve in curves]
        point: dict[str, Any] = {"epoch": int(rows[0]["epoch"])}
        for key in _CURVE_FIELDS:
            # A stratum can be absent from some folds (a fold's test set need not
            # contain every attack style), so only average a field present in ALL
            # rows - otherwise this raised KeyError or averaged over a ragged set.
            if not all(key in row for row in rows):
                continue
            values = [float(row[key]) for row in rows]
            point[key] = {
                "mean": float(np.mean(values)),
                "std": float(np.std(values)),
            }
        aggregated.append(point)
    return aggregated


def dataset_stats(scenarios: Sequence[Scenario]) -> dict[str, Any]:
    """Descriptive statistics of the data actually used for training."""
    malicious = len(scenarios)
    benign = len(scenarios)
    paraphrases = sum(1 for s in scenarios if s.is_paraphrase)
    explicit = sum(1 for s in scenarios if s.is_explicit)
    by_policy: dict[str, int] = {}
    by_strategy: dict[str, int] = {}
    for s in scenarios:
        by_policy[s.policy_violation] = by_policy.get(s.policy_violation, 0) + 1
        by_strategy[s.strategy] = by_strategy.get(s.strategy, 0) + 1
    return {
        "scenarios": len(scenarios),
        "unique_anchors": len({s.anchor for s in scenarios}),
        "unique_domains": len({s.domain for s in scenarios}),
        "eval_examples": benign + malicious,
        "benign_examples": benign,
        "malicious_examples": malicious,
        "adversarial_paraphrases": paraphrases,
        "explicit_attacks": explicit,
        "malicious_by_policy": dict(sorted(by_policy.items())),
        "malicious_by_strategy": dict(sorted(by_strategy.items())),
    }


# ─────────────────────────────────────────────────────────────────────────────
# Misc helpers
# ─────────────────────────────────────────────────────────────────────────────


def resolve_device(requested: str = "auto") -> str:
    """Resolve a requested device into one PyTorch can actually use.

    * ``"auto"`` -> ``"cuda"`` when an accelerator is visible, else ``"cpu"``.
    * ``"cpu"``/``"cuda"`` are passed through.

    Note for AMD on Windows: the ROCm build of PyTorch exposes the Radeon GPU
    through the *CUDA* API (HIP), so ``torch.cuda.is_available()`` is ``True`` and
    the GPU is reached with ``device="cuda"`` — no special string needed.
    """
    requested = (requested or "auto").lower()
    if requested != "auto":
        return requested
    try:
        import torch
    except ImportError:  # pragma: no cover
        return "cpu"
    return "cuda" if torch.cuda.is_available() else "cpu"


def guard_rocm_windows_cwd(device: str) -> None:
    """Fail fast instead of segfaulting when ROCm runs from a spaced path.

    AMD's ROCm toolchain on Windows crashes with an access violation if the
    process *starts* in a directory whose path contains a space (e.g.
    ``D:\\My Code\\sentinel``). An in-process ``chdir`` does not help — the HIP
    runtime latches the startup directory — so this raises a clear, actionable
    error rather than dying with a native crash. Launch from a space-free
    directory, e.g. via ``training/run_gpu.sh``.
    """
    if os.name != "nt" or device != "cuda":
        return
    cwd = os.getcwd()
    if " " not in cwd:
        return
    raise SystemExit(
        "AMD ROCm on Windows cannot run from a path containing spaces:\n"
        f"    {cwd}\n"
        "Launch from a space-free working directory instead, e.g.:\n"
        '    cd C:\\sentinel-gpu && .\\Scripts\\python.exe "<script>" ...\n'
        "or use training/run_gpu.sh, which does this for you."
    )


def _space_free_temp_candidates() -> list[str]:
    """Space-free directories we could use for COMGR's JIT scratch files."""
    candidates: list[str] = []
    system_root = os.environ.get("SystemRoot")
    if system_root:
        candidates.append(os.path.join(system_root, "Temp"))
    local_app_data = os.environ.get("LOCALAPPDATA")
    if local_app_data:
        candidates.append(os.path.join(local_app_data, "Temp"))
    try:
        candidates.append(tempfile.gettempdir())
    except Exception:  # noqa: BLE001
        pass
    if sys.executable:
        # <venv>/Scripts/python.exe -> <venv>/tmp (the venv must be space-free)
        venv_root = os.path.dirname(os.path.dirname(sys.executable))
        candidates.append(os.path.join(venv_root, "tmp"))
    return candidates


def ensure_space_free_temp() -> str | None:
    """Point TEMP/TMP at the standard per-user temp directory.

    AMD's ROCm JIT (COMGR) writes scratch into ``%TEMP%`` and crashes with an
    access violation on the first device operation when that path is anything
    other than the standard ``%LOCALAPPDATA%\\Temp`` - confirmed on this machine
    for paths with a space, ``C:\\Windows\\Temp``, and even freshly created
    writable directories. Returns the directory it switched to, or ``None``.
    """
    if os.name != "nt":
        return None

    local_app_data = os.environ.get("LOCALAPPDATA")
    preferred = os.path.join(local_app_data, "Temp") if local_app_data else ""

    def _normalise(path: str) -> str:
        return os.path.normcase(os.path.normpath(path))

    if preferred and " " not in preferred and os.path.isdir(preferred):
        current = os.environ.get("TEMP") or os.environ.get("TMP") or ""
        if current and _normalise(current) == _normalise(preferred):
            return None  # already the known-good default
        os.environ["TEMP"] = preferred
        os.environ["TMP"] = preferred
        return preferred

    # LOCALAPPDATA is unusable (e.g. a space in the username): fall back to any
    # other space-free writable directory.
    current = os.environ.get("TEMP") or os.environ.get("TMP") or ""
    if current and " " not in current and os.path.isdir(current):
        return None
    for candidate in _space_free_temp_candidates():
        if not candidate or " " in candidate:
            continue
        try:
            os.makedirs(candidate, exist_ok=True)
        except OSError:
            continue
        if os.access(candidate, os.W_OK):
            os.environ["TEMP"] = candidate
            os.environ["TMP"] = candidate
            return candidate
    return None


def pin_visible_gpus(index: int = 0) -> None:
    """Restrict GPU visibility to a single device *before* CUDA initialises.

    ROCm on Windows can expose both the discrete GPU and the integrated APU as
    separate ``cuda`` devices. When more than one is visible, the HF Trainer
    wraps the model in ``DataParallel``, which breaks sentence-transformers
    (``'DataParallel' object has no attribute 'device'``) and can spill work onto
    the slow iGPU. Pinning to one device fixes both. Must run before the first
    CUDA call; existing ``HIP_/CUDA_VISIBLE_DEVICES`` values are respected.
    """
    for var in ("HIP_VISIBLE_DEVICES", "CUDA_VISIBLE_DEVICES"):
        os.environ.setdefault(var, str(index))


def patch_rocm_windows_torch() -> None:
    """Work around the AMD ROCm Windows torch wheel lacking ``torch.distributed``.

    The ROCm Windows wheel does not build ``torch._C._distributed_c10d``, so
    ``import torch.distributed.tensor`` (DTensor) blows up. ``accelerate``
    imports it inside ``Accelerator.prepare_model`` -> ``model_has_dtensor``,
    which aborts single-GPU training. Registering a minimal stub makes the check
    degrade to "no DTensor" — correct for our single-process, single-GPU runs.
    """
    import sys
    import types

    try:
        import torch.distributed.tensor  # noqa: F401
        return
    except Exception:  # noqa: BLE001 - any failure means the wheel lacks it
        pass

    tensor_mod = types.ModuleType("torch.distributed.tensor")

    class DTensor:  # pragma: no cover - placeholder for isinstance() checks
        """Stand-in so ``from torch.distributed.tensor import DTensor`` works."""

    tensor_mod.DTensor = DTensor
    sys.modules["torch.distributed.tensor"] = tensor_mod


def device_summary() -> dict[str, Any]:
    """Describe the compute device for logging (used in the run JSON)."""
    try:
        import torch
    except ImportError:  # pragma: no cover
        return {"device": "cpu", "accelerator": None}
    info: dict[str, Any] = {
        "device": "cuda" if torch.cuda.is_available() else "cpu",
        "torch": torch.__version__,
        "hip": getattr(torch.version, "hip", None),
        "cuda": getattr(torch.version, "cuda", None),
    }
    # device_count() > 0 matters: is_available() can report True while zero devices
    # are usable (observed with HIP_VISIBLE_DEVICES set by a launcher), and calling
    # get_device_name(0) then raises "Invalid device id".
    if torch.cuda.is_available() and torch.cuda.device_count() > 0:
        info["accelerator"] = torch.cuda.get_device_name(0)
        info["accelerator_count"] = torch.cuda.device_count()
        try:
            free, total = torch.cuda.mem_get_info()
            info["vram_free_gb"] = round(free / 1e9, 2)
            info["vram_total_gb"] = round(total / 1e9, 2)
        except Exception:  # noqa: BLE001 - diagnostics only
            pass
    info["cwd"] = os.getcwd()
    return info


def seed_everything(seed: int) -> None:
    """Seed python / numpy / torch (torch imported lazily)."""
    random.seed(seed)
    np.random.seed(seed)
    os.environ["PYTHONHASHSEED"] = str(seed)
    try:
        import torch

        torch.manual_seed(seed)
        if torch.cuda.is_available():
            torch.cuda.manual_seed_all(seed)
    except ImportError:  # pragma: no cover - torch is a hard dep for training
        pass


def _jsonable(value: Any) -> Any:
    """Recursively convert numpy scalars / arrays to plain JSON types."""
    if isinstance(value, dict):
        return {k: _jsonable(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_jsonable(v) for v in value]
    if isinstance(value, (np.floating, np.integer)):
        return value.item()
    if isinstance(value, np.ndarray):
        return value.tolist()
    return value


def write_json(path: str | os.PathLike[str], payload: Mapping[str, Any]) -> Path:
    """Write ``payload`` as pretty UTF-8 JSON, creating parent dirs."""
    out = Path(path)
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open("w", encoding="utf-8") as fh:
        json.dump(_jsonable(dict(payload)), fh, indent=2)
    return out


def ensure_dirs() -> None:
    """Create the ``models/`` and ``logs/`` output directories."""
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    LOGS_DIR.mkdir(parents=True, exist_ok=True)


def scenario_asdict(scenario: Scenario) -> dict[str, Any]:
    return asdict(scenario)

# =============================================================================
# DATASET-V3 LOADER, FOLDS AND METRICS
# =============================================================================
# dataset-v3 is (goal, subtask, label) with a THREE-class label, not the
# anchor/positive/negative triplet shape of dataset_v2:
#
#     label 0 = malicious, 1 = benign-entailment, 2 = neutral
#
# Each row also carries a `stratum`, which replaces the old P-xx policy taxonomy
# as the thing metrics are broken down by:
#
#   easy       blunt attacks, plus routine benign and neutral work
#   near_miss  a benign sibling and its violation, one qualifier apart (pair_id)
#   matched    benign and violation share concept AND verb, differ in authorisation
#   hard       euphemistic holdout attacks that read as ordinary casework
#   control    benign/neutral holdout rows, so FPR is measurable
#
# CONVENTIONS
# -----------
# * Records are converted to this module's BINARY convention at load time
#   (`label` = MALICIOUS/BENIGN) so `confusion`, `metrics_from_confusion`,
#   `predict_malicious` and `find_best_threshold` work completely unchanged. The
#   original three-class value is kept as `nli_label`, which is what the
#   cross-encoder trains against.
# * `stratum` exists on both sides, so per-attack-style recall is computable
#   without the policy column the v2 corpus used.
# * Read `data/DATASET_V3.md` section 4 before quoting any accuracy figure: a bag
#   of words scores AUC 0.981 on the concept-disjoint split, so report the margin
#   above that ceiling rather than a bare accuracy number.
# =============================================================================

V3_MALICIOUS = 0
V3_BENIGN_LABELS = (1, 2)
V3_LABEL_NAMES = {0: "malicious", 1: "benign-entailment", 2: "neutral"}
V3_STRATA = ("easy", "near_miss", "matched", "hard", "control")


@dataclass
class V3Row:
    """One row of dataset-v3."""

    id: str = ""
    goal: str = ""
    subtask: str = ""
    label: int = V3_MALICIOUS          # three-class, as it appears in the CSV
    stratum: str = ""
    source: str = ""
    family: str = ""
    harm_category: str = ""
    pair_id: str = ""
    cue_concept: str = ""
    word_count: int = 0
    split: str = ""                    # from `cue_split` or `split`, if present

    @property
    def is_malicious(self) -> bool:
        return self.label == V3_MALICIOUS

    @property
    def binary_label(self) -> int:
        """MALICIOUS / BENIGN, for the binary metric helpers."""
        return MALICIOUS if self.is_malicious else BENIGN


def _v3_int(value: Any, default: int = 0) -> int:
    try:
        return int(str(value).strip())
    except (TypeError, ValueError):
        return default


def load_v3(
    path: str | os.PathLike[str] = DATASET_PATH,
    limit_goals: int | None = None,
) -> list[V3Row]:
    """Read a dataset-v3 CSV into ``V3Row`` objects.

    Accepts both the corpus files (``corpus_clean.csv``, the holdout) and the
    split files (``cue_split.csv``), taking the train/test assignment from either
    a ``cue_split`` or a ``split`` column when one is present.

    ``limit_goals`` keeps the first N whole goals, which is what the smoke tests
    use so a limited run still groups correctly.
    """
    rows: list[V3Row] = []
    with Path(path).open(encoding="utf-8") as handle:
        for raw in csv.DictReader(handle):
            goal = (raw.get("goal") or "").strip()
            subtask = (raw.get("subtask") or "").strip()
            if not goal or not subtask:
                continue
            rows.append(
                V3Row(
                    id=(raw.get("id") or "").strip(),
                    goal=goal,
                    subtask=subtask,
                    label=_v3_int(raw.get("label"), V3_MALICIOUS),
                    stratum=(raw.get("stratum") or "").strip(),
                    source=(raw.get("source") or "").strip(),
                    family=(raw.get("family") or "").strip(),
                    harm_category=(raw.get("harm_category") or "").strip(),
                    pair_id=(raw.get("pair_id") or "").strip(),
                    # cue_split.csv names this column `concept`; the corpus files
                    # use `cue_concept`. Accept either.
                    cue_concept=((raw.get("cue_concept") or raw.get("concept") or "").strip()),
                    word_count=_v3_int(raw.get("word_count"), 0),
                    split=((raw.get("cue_split") or raw.get("split") or "").strip()),
                )
            )
    if limit_goals:
        keep = set(list(dict.fromkeys(r.goal for r in rows))[:limit_goals])
        rows = [r for r in rows if r.goal in keep]
    return rows


def v3_examples(rows: Sequence[V3Row]) -> list[dict[str, Any]]:
    """Expand ``V3Row`` objects into scorable records.

    ``label`` is the BINARY convention (so the metric helpers apply unchanged)
    and ``nli_label`` preserves the three-class value. Unlike v2, one row here is
    exactly one example.
    """
    return [
        {
            "id": r.id,
            "goal": r.goal,
            "subtask": r.subtask,
            "label": r.binary_label,
            "nli_label": r.label,
            "stratum": r.stratum,
            "source": r.source,
            "family": r.family,
            "harm_category": r.harm_category,
            "pair_id": r.pair_id,
            "cue_concept": r.cue_concept,
            "word_count": r.word_count,
        }
        for r in rows
    ]


def summarize_v3(
    records: Sequence[dict[str, Any]],
    threshold: float,
    higher_is_malicious: bool,
) -> dict[str, Any]:
    """Metric block for one fold/model at a fixed threshold, broken down by stratum.

    Mirrors ``summarize`` but groups by ``stratum`` instead of by P-xx policy,
    because that is the taxonomy dataset-v3 uses. The per-stratum TPRs are what
    the thesis needs: `hard` and `matched` are the adversarial strata, `easy` is
    the control.
    """
    labels = [r["label"] for r in records]
    scores = [r["score"] for r in records]
    preds = predict_malicious(scores, threshold, higher_is_malicious)
    c = confusion(labels, preds)
    overall = metrics_from_confusion(c)

    def _recall(predicate) -> dict[str, Any]:
        tp = fn = 0
        for r, p in zip(records, preds):
            if predicate(r) and r["label"] == MALICIOUS:
                if p == MALICIOUS:
                    tp += 1
                else:
                    fn += 1
        return {"n": tp + fn, "tp": tp, "fn": fn, "tpr": _pct(tp, tp + fn)}

    def _false_positive_rate(predicate) -> dict[str, Any]:
        fp = tn = 0
        for r, p in zip(records, preds):
            if predicate(r) and r["label"] == BENIGN:
                if p == MALICIOUS:
                    fp += 1
                else:
                    tn += 1
        return {"n": fp + tn, "fp": fp, "tn": tn, "fpr": _pct(fp, fp + tn)}

    strata = sorted(
        {
            r.get("stratum", "")
            for r in records
            if r["label"] == MALICIOUS and r.get("stratum")
        }
    )
    by_stratum = {
        s: _recall(lambda r, _s=s: r.get("stratum") == _s) for s in strata
    }
    sources = sorted(
        {
            r.get("source", "")
            for r in records
            if r["label"] == MALICIOUS and r.get("source")
        }
    )
    by_source = {
        s: _recall(lambda r, _s=s: r.get("source") == _s) for s in sources
    }

    return {
        "threshold": float(threshold),
        "n": len(records),
        "confusion": c,
        **overall,
        "subsets": {
            "malicious": _recall(lambda r: True),
            "benign": _false_positive_rate(lambda r: True),
            "by_stratum": by_stratum,
            "by_source": by_source,
            "recall_by_stratum": {k: v["tpr"] for k, v in by_stratum.items()},
        },
    }


def aggregate_v3_summaries(summaries: Sequence[dict[str, Any]]) -> dict[str, Any]:
    """Mean/std across folds, plus per-stratum TPR and a pooled confusion matrix."""
    if not summaries:
        return {}
    metrics = ("accuracy", "tpr", "fpr", "precision", "f1", "threshold")
    strata = sorted({k for s in summaries for k in s["subsets"]["by_stratum"]})
    pooled = {
        k: sum(s["confusion"][k] for s in summaries) for k in ("tp", "fp", "tn", "fn")
    }
    pooled["total"] = sum(pooled.values())
    return {
        "metrics": {m: _mean_std([s[m] for s in summaries]) for m in metrics},
        "subsets": {
            "malicious": {
                "tpr": _mean_std([s["subsets"]["malicious"]["tpr"] for s in summaries])
            },
            "benign": {
                "fpr": _mean_std([s["subsets"]["benign"]["fpr"] for s in summaries])
            },
            "by_stratum": {
                k: {
                    "tpr": _mean_std(
                        [
                            s["subsets"]["by_stratum"][k]["tpr"]
                            for s in summaries
                            if k in s["subsets"]["by_stratum"]
                        ]
                    )
                }
                for k in strata
            },
        },
        "pooled_confusion": pooled,
        "pooled_tpr": _pct(pooled["tp"], pooled["tp"] + pooled["fn"]),
        "pooled_fpr": _pct(pooled["fp"], pooled["fp"] + pooled["tn"]),
    }


def make_v3_folds(
    rows: Sequence[V3Row],
    n_splits: int = 5,
    seed: int = 42,
    strategy: str = "group",
) -> list[tuple[list[int], list[int]]]:
    """Build (train_idx, test_idx) folds over dataset-v3.

    * ``group`` (default) - ``StratifiedGroupKFold`` grouped by ``goal`` and
      stratified by ``stratum``: no goal crosses folds, so this measures
      unseen-goal detection. **Primary protocol.**
    * ``stratified`` - ``StratifiedKFold`` on the binary label. This is what the
      reference fine-tune script did (label-stratified), kept so the two can be
      compared directly; goals may cross folds.
    * ``cue`` - uses the train/test assignment already in ``cue_split.csv``.
      Concept families are held out whole, so the test set's overreach *kinds*
      are unseen. Requires loading the split file. Returns exactly one fold.
    """
    from sklearn.model_selection import StratifiedGroupKFold, StratifiedKFold

    if strategy == "cue":
        train_idx = [i for i, r in enumerate(rows) if r.split == "train"]
        test_idx = [i for i, r in enumerate(rows) if r.split == "test"]
        if not train_idx or not test_idx:
            raise SystemExit(
                "fold-strategy 'cue' needs rows carrying cue_split train/test - load "
                f"{CUE_SPLIT_PATH.name}, not the plain corpus"
            )
        return [(train_idx, test_idx)]

    labels = np.array([r.binary_label for r in rows])
    if strategy == "group":
        groups = np.array([r.goal for r in rows])
        strata = np.array([r.stratum or "unknown" for r in rows])
        splits = StratifiedGroupKFold(
            n_splits=n_splits, shuffle=True, random_state=seed
        ).split(rows, strata, groups)
    else:
        splits = StratifiedKFold(
            n_splits=n_splits, shuffle=True, random_state=seed
        ).split(rows, labels)
    return [(train.tolist(), test.tolist()) for train, test in splits]


def v3_dataset_stats(rows: Sequence[V3Row]) -> dict[str, Any]:
    """Composition of a dataset-v3 row set, for the run log."""

    def _count(predicate) -> int:
        return sum(1 for r in rows if predicate(r))

    def _tally(key: str) -> dict[str, int]:
        out: dict[str, int] = {}
        for r in rows:
            value = getattr(r, key) or ""
            out[value] = out.get(value, 0) + 1
        return dict(sorted(out.items()))

    return {
        "rows": len(rows),
        "unique_goals": len({r.goal for r in rows}),
        "label_counts": {
            V3_LABEL_NAMES[k]: _count(lambda r, _k=k: r.label == _k) for k in (0, 1, 2)
        },
        "malicious": _count(lambda r: r.is_malicious),
        "benign": _count(lambda r: not r.is_malicious),
        "by_stratum": _tally("stratum"),
        "by_source": _tally("source"),
        "by_harm_category": {k: v for k, v in _tally("harm_category").items() if k},
        "paired_rows": _count(lambda r: r.pair_id),
    }


# =============================================================================
# CPU PROTOCOL
# =============================================================================


def force_cpu_protocol() -> None:
    """Hide every GPU so torch and accelerate fall back to the CPU.

    MUST be called before torch is first imported. Two independent reasons:

    * **measured**: setting these from inside Python is NOT sufficient - torch still
      reported ``is_available() == True`` (with ``device_count() == 0``), because the
      HIP runtime resolves visibility at load time. Only setting them in the launcher
      (see ``run_cpu.ps1``) makes ``is_available()`` correctly False. This helper is
      kept as best-effort for other paths; and
    * HF ``Trainer`` / ``accelerate`` auto-detect the GPU *independently* of the
      device we pass to the model. Verified: a run with ``--device cpu`` still
      crashed in ``transformers/trainer.py::_move_model_to_device`` because
      accelerate had picked the GPU anyway.

    Setting the visibility variables to the empty string is the documented way to
    present zero devices: ``torch.cuda.is_available()`` returns False and
    ``device_count()`` returns 0, which is what makes the CPU path reliable.
    """
    os.environ["HIP_VISIBLE_DEVICES"] = ""
    os.environ["CUDA_VISIBLE_DEVICES"] = ""


def cpu_protocol_note() -> str:
    """One-line banner so a CPU run is never mistaken for a GPU run in the log."""
    return (
        "CPU PROTOCOL: GPUs hidden via HIP_VISIBLE_DEVICES='/CUDA_VISIBLE_DEVICES=' "
        "- torch.cuda.is_available() will be False"
    )
