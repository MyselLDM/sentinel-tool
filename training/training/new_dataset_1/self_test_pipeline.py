#!/usr/bin/env python3
"""Dry-run the log contract: synthetic v3 logs -> compare_models -> model_config.json.

Verifies the whole non-GPU half of the pipeline end to end:

  * a fold record produced by `summarize_v3` satisfies what `compare_models` reads
  * `compare_models` pairs the two logs, runs the paired t-tests on the headline
    metrics AND on each stratum, and writes `comparison_results.json`
  * `model_config.json` is produced (the FastAPI deployment contract)

Writes into logs/ and models/, like a real run, then reports the keys found.
Run it before a long GPU run to prove the JSON schema is sound.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import common as C
import compare_models as CM


def fake_log(kind: str, folds: list[dict]) -> dict:
    """A run log shaped like the real one's top level."""
    return {
        "generated_at": "dry-run",
        "model": f"dryrun-{kind}",
        "role": "proposed (contrastive)" if kind == "contrastive" else "baseline (NLI)",
        "base": C.NLI_BASE if kind == "nli" else C.CONTRASTIVE_BASE,
        # `labels` and `decision` are read by build_model_config; every key the real
        # trainer emits is reproduced here so this is a faithful contract test.
        "labels": list(C.NLI_LABELS) if kind == "nli" else None,
        "decision": "p_contradiction > threshold" if kind == "nli" else "cosine < threshold",
        "higher_score_means_malicious": kind == "nli",
        "include_decomposed": False,
        "compute": {"device": "cpu", "precision": "fp32"},
        "config": {"fold_strategy": "group", "folds": len(folds), "epochs": 4},
        "dataset": C.v3_dataset_stats(C.load_v3(C.DATASET_PATH)),
        "folds": folds,
        "aggregate": C.aggregate_v3_summaries([f["summary"] for f in folds]),
        "aggregate_fixed_threshold": C.aggregate_v3_summaries(
            [f["fixed_threshold_summary"] for f in folds]
        ),
        "aggregate_curve": [],
        "final_threshold": sum(f["threshold"] for f in folds) / len(folds),
        "baseline": {
            "description": "off-the-shelf, untrained",
            "folds": folds,
            "aggregate": C.aggregate_v3_summaries([f["summary"] for f in folds]),
            "final_threshold": sum(f["threshold"] for f in folds) / len(folds),
        },
        "final_model": {
            "dir": f"models/dryrun-{kind}",
            "trained_on_scenarios": 584,
            "train_time_sec": 1.0,
        },
        "total_runtime_sec": 1.0,
    }


def main() -> int:
    rows = C.load_v3(C.DATASET_PATH)
    folds = C.make_v3_folds(rows, n_splits=5, seed=42, strategy="group")
    print(f"  {len(rows)} rows, {len(folds)} folds\n")

    logs: dict[str, dict] = {}
    for kind, better in (("nli", 0.80), ("contrastive", 0.90)):
        fold_records = []
        for i, (_, test_idx) in enumerate(folds):
            examples = C.v3_examples([rows[j] for j in test_idx])
            # Synthetic scores: malicious rows scored high, benign low, with a
            # model-dependent error rate so the two logs differ measurably.
            for k, ex in enumerate(examples):
                want_high = ex["label"] == C.MALICIOUS
                base = better if want_high else 1.0 - better
                jitter = ((k * 37 + i * 11) % 100) / 1000.0
                score = min(1.0, max(0.0, base + jitter - 0.05))
                ex["score"] = score
            labels = [e["label"] for e in examples]
            scores = [e["score"] for e in examples]
            threshold, thr_f1 = C.find_best_threshold(labels, scores, True)
            summary = C.summarize_v3(examples, threshold, True)
            fold_records.append(
                {
                    "fold": i,
                    "train_scenarios": len(rows) - len(test_idx),
                    "test_scenarios": len(test_idx),
                    "test_examples": len(examples),
                    "threshold": threshold,
                    "threshold_f1": thr_f1,
                    "train_time_sec": 1.0,
                    "summary": summary,
                    "fixed_threshold_summary": summary,
                }
            )
        logs[kind] = fake_log(kind, fold_records)
        print(f"  {kind}: aggregate tpr={logs[kind]['aggregate']['metrics']['tpr']['mean']:.1f}%"
              f"  strata={list(logs[kind]['aggregate']['subsets']['by_stratum'])}")

    C.ensure_dirs()
    (C.LOGS_DIR / "nli_cv_results.json").write_text(json.dumps(logs["nli"], indent=2),
                                                   encoding="utf-8")
    (C.LOGS_DIR / "contrastive_cv_results.json").write_text(
        json.dumps(logs["contrastive"], indent=2), encoding="utf-8")
    print("\n  wrote synthetic logs to logs/")

    CM.run(CM.parse_args([]))
    print("\n  compare_models.run() completed")

    cmp_path = C.LOGS_DIR / "comparison_results.json"
    cfg_path = C.MODELS_DIR / "model_config.json"
    ok = True
    for path in (cmp_path, cfg_path):
        exists = path.exists()
        ok = ok and exists
        print(f"  {path.name}: {'written' if exists else 'MISSING'}")
    if cmp_path.exists():
        data = json.loads(cmp_path.read_text(encoding="utf-8"))
        for name, block in data.get("comparisons", {}).items():
            print(f"    {name}: metrics={sorted(block['tests'])}"
                  f"  focal_subsets={block.get('focal_subsets')}")
    if cfg_path.exists():
        cfg = json.loads(cfg_path.read_text(encoding="utf-8"))
        print(f"    model_config keys: {sorted(cfg)}")
        print(f"    nli threshold: {cfg.get('nli', {}).get('threshold')}")
        print(f"    contrastive threshold: {cfg.get('contrastive', {}).get('threshold')}")

    print()
    print("  PASS - the log contract is sound" if ok else "  FAIL - missing outputs")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
