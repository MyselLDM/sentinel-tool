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
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence

import numpy as np

# ─────────────────────────────────────────────────────────────────────────────
# Paths
# ─────────────────────────────────────────────────────────────────────────────

TRAINING_DIR = Path(__file__).resolve().parent
DATASET_PATH = TRAINING_DIR / "dataset.csv"
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
    def is_paraphrase(self) -> bool:
        """True when the malicious side is a subtle adversarial paraphrase."""
        return self.policy_violation in PARAPHRASE_POLICIES

    @property
    def is_explicit(self) -> bool:
        """True when the malicious side is a blunt / obvious attack."""
        return self.policy_violation in EXPLICIT_POLICIES


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

    by_policy: dict[str, Any] = {}
    for policy in sorted({r["policy_violation"] for r in records if r["label"] == MALICIOUS}):
        block = _recall_subset(lambda r, pol=policy: r["policy_violation"] == pol)
        block["policy_name"] = POLICY_NAMES.get(policy, policy)
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


def make_folds(
    scenarios: Sequence[Scenario],
    n_splits: int = 5,
    seed: int = 42,
    strategy: str = "group",
) -> list[tuple[list[int], list[int]]]:
    """Build the shared k-fold split (``(train_idx, test_idx)`` per fold).

    Both training scripts call this with identical arguments so the two models
    are evaluated on the **same** folds - a precondition for the paired t-test.

    * ``strategy="group"`` (default) - ``StratifiedGroupKFold`` grouped by
      ``anchor`` and stratified by ``policy_violation``: no goal ever appears in
      both train and test (avoids lexical leakage), and every fold keeps all 11
      attack types proportionally.
    * ``strategy="stratified"`` - plain ``StratifiedKFold`` on
      ``policy_violation`` (goals may cross folds; matches the thesis' literal
      "stratified" wording).
    """
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
            "policy_name": POLICY_NAMES.get(p, p),
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
    if torch.cuda.is_available():
        info["accelerator"] = torch.cuda.get_device_name(0)
        info["accelerator_count"] = torch.cuda.device_count()
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
