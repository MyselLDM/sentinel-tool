#!/usr/bin/env python3
"""Compare the two trained models and answer RQ3 of the thesis.

Reads the run logs produced by ``train_nli.py`` and ``train_contrastive.py`` and
performs the **one-tailed paired-sample t-test** described in ``Thesis.md``
(§Statistical Treatment): for each of Recall (TPR), Precision and F1 the
contrastive model is tested for a *statistically significant improvement* over
the NLI model, using the **per-fold** metrics as paired observations (both
models share the exact same folds).

It also:

* repeats the test on the **adversarial-paraphrase** TPR subset - the focal
  failure mode of the thesis - and on the explicit-attack subset,
* reports effect sizes (paired Cohen's d_z) and the mean difference,
* compares the contrastive model against **both** the off-the-shelf NLI baseline
  (the canonical RQ3 comparison) and the fine-tuned NLI model,
* writes a merged ``models/model_config.json`` in the same shape FastAPI reads
  (so the fine-tuned artifacts + calibrated thresholds can be dropped into
  ``fastapi/.models`` unchanged).

Outputs (relative to ``training/``)::

    logs/comparison_results.json
    models/model_config.json

Run::

    ../fastapi/.venv/Scripts/python.exe compare_models.py
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path
from typing import Any, Sequence

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common as C  # noqa: E402

# Metrics the thesis tests. ``greater`` = higher is better (contrastive should win).
HEADLINE_TESTS = {
    "tpr": "greater",
    "precision": "greater",
    "f1": "greater",
    "fpr": "less",  # lower false-positive rate is better
}


def _load(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise SystemExit(
            f"Missing {path.name}. Run train_nli.py and train_contrastive.py first."
        )
    import json

    with path.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def _fold_value(fold: dict[str, Any], metric: str, subset: str | None) -> float:
    """Read one metric from a fold record (optionally a subset's TPR).

    Works for both corpus generations: dataset_v2 logs break down by policy and
    expose flat subset keys, dataset-v3 logs break down by **stratum** under
    ``subsets.by_stratum``. A name is looked up in the flat map first, then in the
    stratum map.
    """
    summary = fold["summary"]
    if subset is None:
        return float(summary[metric])
    subsets = summary.get("subsets", {})
    flat = subsets.get(subset)
    if isinstance(flat, dict) and "tpr" in flat:
        return float(flat["tpr"])
    by_stratum = subsets.get("by_stratum", {})
    if subset in by_stratum:
        return float(by_stratum[subset]["tpr"])
    return float("nan")


def _shared_strata(folds_a: Sequence[dict], folds_b: Sequence[dict]) -> list[str]:
    """Strata present in EVERY fold of BOTH models.

    A paired test needs the same series length on both sides, so a stratum missing
    from any fold has to be dropped rather than filled with NaN.
    """
    per_fold = [
        set(f["summary"].get("subsets", {}).get("by_stratum", {}))
        for f in list(folds_a) + list(folds_b)
    ]
    return sorted(set.intersection(*per_fold)) if per_fold else []


def _series(
    folds: Sequence[dict[str, Any]], metric: str, subset: str | None
) -> list[float]:
    return [_fold_value(f, metric, subset) for f in folds]


def paired_test(
    group_a: Sequence[float],
    group_b: Sequence[float],
    alternative: str,
) -> dict[str, Any]:
    """One-tailed paired t-test of ``group_a`` vs ``group_b`` (``a != b`` = H1).

    ``alternative="greater"`` tests H1: mean(a) > mean(b).
    """
    from scipy import stats

    a = np.asarray(group_a, dtype=np.float64)
    b = np.asarray(group_b, dtype=np.float64)
    diff = a - b
    n = len(diff)
    if n < 2:
        return {
            "n_pairs": n,
            "mean_a": float(a.mean()) if n else 0.0,
            "mean_b": float(b.mean()) if n else 0.0,
            "mean_diff": float(diff.mean()) if n else 0.0,
            "std_diff": 0.0,
            "t_statistic": float("nan"),
            "p_value": float("nan"),
            "alternative": alternative,
            "d_z": float("nan"),
            "significant_at_0_05": False,
            "note": "need >= 2 folds for a paired t-test",
        }
    result = stats.ttest_rel(a, b, alternative=alternative)
    std = float(diff.std(ddof=1)) if n > 1 else 0.0
    mean_diff = float(diff.mean())
    # Paired Cohen's d_z (effect size).
    d_z = (mean_diff / std) if std > 0 else float("inf") if mean_diff != 0 else 0.0
    return {
        "n_pairs": n,
        "mean_a": float(a.mean()),
        "mean_b": float(b.mean()),
        "mean_diff": mean_diff,
        "std_diff": std,
        "t_statistic": float(result.statistic),
        "p_value": float(result.pvalue),
        "alternative": alternative,
        "d_z": d_z,
        "significant_at_0_05": bool(result.pvalue <= 0.05),
    }


def _compare(
    name: str,
    model_a_folds: Sequence[dict[str, Any]],
    model_b_folds: Sequence[dict[str, Any]],
    label_a: str,
    label_b: str,
) -> dict[str, Any]:
    """Run the full battery of paired tests for model A (proposed) vs B (baseline)."""
    block: dict[str, Any] = {"comparison": name, "model_a": label_a, "model_b": label_b,
                             "tests": {}}
    for metric, alternative in HEADLINE_TESTS.items():
        a = _series(model_a_folds, metric, None)
        b = _series(model_b_folds, metric, None)
        block["tests"][metric] = paired_test(a, b, alternative)
    # Focal subset tests. dataset_v2 used the paraphrase/explicit policy split;
    # dataset-v3 uses strata, so test recall on each stratum present in every fold
    # of both models. `hard` (euphemistic) and `matched` (role-based) are the
    # adversarial ones, `easy` is the control.
    focal = _shared_strata(model_a_folds, model_b_folds)
    for subset in focal:
        a = _series(model_a_folds, "tpr", subset)
        b = _series(model_b_folds, "tpr", subset)
        block["tests"][f"{subset}_tpr"] = paired_test(a, b, "greater")
    block["focal_subsets"] = focal
    return block


def build_model_config(
    nli: dict[str, Any], contrastive: dict[str, Any], comparison: dict[str, Any]
) -> dict[str, Any]:
    """Merge both run logs into a FastAPI-compatible ``model_config.json``."""
    nli_agg = nli["aggregate"]["metrics"]
    con_agg = contrastive["aggregate"]["metrics"]
    nli_dir = nli.get("final_model", {}).get("dir") or nli.get("model", "")
    con_dir = contrastive.get("final_model", {}).get("dir") or contrastive.get("model", "")

    return {
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "notes": [
            "Produced by training/compare_models.py from the fine-tuned artifacts.",
            "model_dir is relative to MODELS_DIR (default: fastapi/.models).",
            "Copy the training/models/* directories into fastapi/.models to deploy.",
            "Thresholds are the mean of the per-fold F1-optimal cut-offs (5-fold CV).",
        ],
        "nli": {
            "base": nli["base"],
            "model_dir": Path(nli_dir).name,
            "version": nli["model"],
            "labels": nli["labels"],
            "activation": "softmax",
            "decision": nli["decision"],
            "threshold": nli["final_threshold"],
            "threshold_source": "cross_validation_mean",
            "metrics": {
                "accuracy": round(nli_agg["accuracy"]["mean"], 4),
                "tpr": round(nli_agg["tpr"]["mean"], 4),
                "fpr": round(nli_agg["fpr"]["mean"], 4),
                "precision": round(nli_agg["precision"]["mean"], 4),
                "f1": round(nli_agg["f1"]["mean"], 4),
            },
        },
        "contrastive": {
            "base": contrastive["base"],
            "model_dir": Path(con_dir).name,
            "version": contrastive["model"],
            "decision": contrastive["decision"],
            "include_decomposed": contrastive.get("include_decomposed", False),
            "threshold": contrastive["final_threshold"],
            "threshold_source": "cross_validation_mean",
            "metrics": {
                "accuracy": round(con_agg["accuracy"]["mean"], 4),
                "tpr": round(con_agg["tpr"]["mean"], 4),
                "fpr": round(con_agg["fpr"]["mean"], 4),
                "precision": round(con_agg["precision"]["mean"], 4),
                "f1": round(con_agg["f1"]["mean"], 4),
            },
        },
        "thesis_comparison": comparison,
    }


def _print_table(comparison: dict[str, Any]) -> None:
    print("\n" + "=" * 78)
    print(f"PAIRED ONE-TAILED t-TEST - {comparison['model_a']} vs {comparison['model_b']}")
    print("=" * 78)
    print(f"  {'metric':<28}{'mean A':>9}{'mean B':>9}{'delta':>9}{'t':>9}{'p':>9}  decision")
    for metric, test in comparison["tests"].items():
        decision = "reject H0" if test["significant_at_0_05"] else "fail to reject"
        print(
            f"  {metric:<28}{test['mean_a']:>9.2f}{test['mean_b']:>9.2f}"
            f"{test['mean_diff']:>9.2f}{test['t_statistic']:>9.3f}"
            f"{test['p_value']:>9.4f}  {decision}"
        )


def run(args: argparse.Namespace) -> dict[str, Any]:
    C.ensure_dirs()
    # Read the top-level logs by default, or a protocol-specific archive. Use
    # --protocol group for the deployment config: its thresholds are calibrated on
    # unseen GOALS, which is what a live gateway actually faces.
    proto = getattr(args, "protocol", None)
    source = C.LOGS_DIR / proto if proto else C.LOGS_DIR
    if proto and not source.is_dir():
        raise SystemExit(
            f"no archived logs for protocol {proto!r} ({source}). "
            "Run run_all_gpu.sh with that protocol first."
        )
    nli = _load(source / "nli_cv_results.json")
    contrastive = _load(source / "contrastive_cv_results.json")

    nli_folds = nli["folds"]
    con_folds = contrastive["folds"]
    nli_strategy = (nli.get("config") or {}).get("fold_strategy", "group")
    con_strategy = (contrastive.get("config") or {}).get("fold_strategy", "group")
    if nli_strategy != con_strategy:
        raise SystemExit(
            f"fold_strategy mismatch: NLI={nli_strategy!r} vs contrastive={con_strategy!r}. "
            "The paired t-test needs both models evaluated on the SAME folds -- "
            "re-run the other model with the matching --fold-strategy."
        )
    if len(nli_folds) != len(con_folds):
        raise SystemExit(
            f"Fold count mismatch: NLI={len(nli_folds)} vs contrastive={len(con_folds)}. "
            "Re-run both trainings with the same --folds/--seed/--fold-strategy."
        )

    print("=" * 78)
    print("MODEL COMPARISON - contrastive (proposed) vs NLI")
    print(f"  protocol       : {C.protocol_label(nli_strategy)}")
    print(f"  folds per model: {len(con_folds)}   (paired; identical splits)")
    print("=" * 78)

    comparisons: dict[str, Any] = {}

    # Primary RQ3 comparison: contrastive vs the off-the-shelf NLI baseline.
    baseline_folds = (nli.get("baseline") or {}).get("folds")
    if baseline_folds and len(baseline_folds) == len(con_folds):
        comparisons["contrastive_vs_baseline_nli"] = _compare(
            "contrastive_vs_baseline_nli",
            con_folds,
            baseline_folds,
            "contrastive (proposed)",
            "NLI baseline (off-the-shelf)",
        )
        _print_table(comparisons["contrastive_vs_baseline_nli"])

    # Secondary: contrastive vs the fine-tuned NLI model.
    comparisons["contrastive_vs_finetuned_nli"] = _compare(
        "contrastive_vs_finetuned_nli",
        con_folds,
        nli_folds,
        "contrastive (proposed)",
        "NLI (fine-tuned)",
    )
    _print_table(comparisons["contrastive_vs_finetuned_nli"])

    primary = comparisons.get("contrastive_vs_baseline_nli") or comparisons[
        "contrastive_vs_finetuned_nli"
    ]

    results = {
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "alpha": 0.05,
        "design": "one-tailed paired-sample t-test over fold-level metrics",
        "nli_log": "logs/nli_cv_results.json",
        "contrastive_log": "logs/contrastive_cv_results.json",
        "comparisons": comparisons,
    }
    log_path = C.write_json(source / "comparison_results.json", results)

    config = build_model_config(nli, contrastive, primary)
    config["protocol"] = nli.get("config", {}).get("protocol", "unknown")
    config["protocol_key"] = proto or "current"
    config_path = C.write_json(C.MODELS_DIR / "model_config.json", config)

    print("\n  comparison log -> " + str(log_path))
    print("  merged model config -> " + str(config_path))

    # Headline RQ3 verdict.
    f1_test = primary["tests"]["f1"]
    tpr_test = primary["tests"]["tpr"]
    print("\n" + "=" * 78)
    print("RQ3 - CONCLUSION")
    print("=" * 78)
    print(
        f"  TPR : contrastive {tpr_test['mean_a']:.1f}% vs NLI {tpr_test['mean_b']:.1f}%"
        f"  (delta={tpr_test['mean_diff']:+.1f}, p={tpr_test['p_value']:.4f}) -> "
        + ("REJECT H0" if tpr_test["significant_at_0_05"] else "fail to reject H0")
    )
    print(
        f"  F1  : contrastive {f1_test['mean_a']:.1f}% vs NLI {f1_test['mean_b']:.1f}%"
        f"  (delta={f1_test['mean_diff']:+.1f}, p={f1_test['p_value']:.4f}) -> "
        + ("REJECT H0" if f1_test["significant_at_0_05"] else "fail to reject H0")
    )
    return results


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--protocol",
        choices=("group", "stratified", "sample"),
        default=None,
        help="read logs/<protocol>/*.json instead of the top-level logs. Use "
             "'group' for the deployment config: its thresholds are calibrated on "
             "unseen goals, which is what a live gateway faces.",
    )
    return parser.parse_args(argv)


if __name__ == "__main__":
    run(parse_args())
