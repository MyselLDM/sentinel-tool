#!/usr/bin/env python3
"""Diagnose over- vs under-fitting for the two trained Sentinel models.

Uses only artefacts that already exist (the saved final models + the CV logs) —
no retraining. It answers three questions:

1. **Did training converge?** Per-epoch held-out metrics from the CV logs
   (`aggregate_curve`); a plateau with no degradation means "converged", not
   "over/under-fit".
2. **Is there a generalisation gap?** Evaluates each *final* model on the full
   dataset it was trained on and compares it with the held-out CV numbers. A
   large train >> test gap = overfitting; train ≈ test = neither.
3. **Where are the residual errors?** Per-policy false-negative counts, so you
   can see whether the headroom is a tuning problem or a data problem.

Run:  ./run_gpu.sh analyse_fit.py     (or `python analyse_fit.py --device cpu`)
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common as C  # noqa: E402

nli_moved_temp = C.ensure_space_free_temp()  # before `import torch` (ROCm latches %TEMP%)


def _saved_stats(name: str) -> dict:
    return json.loads((C.MODELS_DIR / name / "training_stats.json").read_text(encoding="utf-8"))


# ─────────────────────────────────────────────────────────────────────────────
# 1. convergence: the per-epoch held-out curve
# ─────────────────────────────────────────────────────────────────────────────


def print_curves() -> None:
    print("=" * 78)
    print("1. CONVERGENCE — per-epoch held-out metrics (epoch 0 = untrained)")
    print("=" * 78)
    for label, log in (("NLI", "nli_cv_results.json"), ("contrastive", "contrastive_cv_results.json")):
        data = json.loads((C.LOGS_DIR / log).read_text(encoding="utf-8"))
        print(f"\n  {label}:  epoch | TPR | FPR | Prec | F1")
        prev = None
        for point in data["aggregate_curve"]:
            f1 = point["f1"]["mean"]
            delta = "" if prev is None else f"   ({f1 - prev:+.2f} vs prev epoch)"
            print(
                f"    {point['epoch']:>10} | {point['tpr']['mean']:5.2f} | {point['fpr']['mean']:5.2f}"
                f" | {point['precision']['mean']:5.2f} | {f1:5.2f}{delta}"
            )
            prev = f1
        finals = data["folds"][0]
        loss = [h.get("loss") for h in finals.get("train_log_history", []) if "loss" in h]
        if loss:
            print(f"    training loss: first={loss[0]:.4f}  last={loss[-1]:.4f}  steps logged={len(loss)}")


# ─────────────────────────────────────────────────────────────────────────────
# 2. generalisation gap: final model evaluated on its own training data
# ─────────────────────────────────────────────────────────────────────────────


def evaluate_nli(scenarios, device: str) -> dict:
    from sentence_transformers import CrossEncoder

    stats = _saved_stats("sentinelagent-nli-finetuned")
    threshold = stats["final_threshold"]
    model = CrossEncoder(str(C.MODELS_DIR / "sentinelagent-nli-finetuned"), device=device)
    examples = C.build_eval_examples(scenarios)
    pairs = [C.format_nli(e["goal"], e["subtask"]) for e in examples]
    raw = model.predict(pairs, batch_size=64, show_progress_bar=False)
    for example, row in zip(examples, raw):
        example["score"] = float(C.to_probabilities(row)[C.NLI_CONTRADICTION])
    return C.summarize(examples, threshold, higher_is_malicious=True), threshold


def evaluate_contrastive(scenarios, device: str) -> dict:
    import numpy as np
    from sentence_transformers import SentenceTransformer

    dirname = json.loads(
        (C.MODELS_DIR / "model_config.json").read_text(encoding="utf-8")
    )["contrastive"]["model_dir"]
    stats = _saved_stats(dirname)
    threshold = stats["final_threshold"]
    model = SentenceTransformer(str(C.MODELS_DIR / dirname), device=device)
    examples = C.build_eval_examples(scenarios)

    def encode(texts):
        uniq = list(dict.fromkeys(texts))
        vecs = model.encode(uniq, normalize_embeddings=True, batch_size=64, show_progress_bar=False)
        return dict(zip(uniq, vecs))

    goal_embs = encode([C.format_document(e["goal"], e["goal"]) for e in examples])
    sub_embs = encode([C.format_document(e["goal"], e["subtask"]) for e in examples])
    for example in examples:
        goal_vec = goal_embs[C.format_document(example["goal"], example["goal"])]
        sub_vec = sub_embs[C.format_document(example["goal"], example["subtask"])]
        example["score"] = float(np.dot(goal_vec, sub_vec))
    return C.summarize(examples, threshold, higher_is_malicious=False), threshold


def print_gap(scenarios, device: str) -> None:
    print("\n" + "=" * 78)
    print("2. GENERALISATION GAP — final model on TRAIN data vs held-out CV")
    print("=" * 78)
    print(f"  {'model':<14}{'split':<12}{'TPR':>8}{'FPR':>8}{'Prec':>8}{'F1':>8}")
    for label, log, fn in (
        ("NLI", "nli_cv_results.json", evaluate_nli),
        ("contrastive", "contrastive_cv_results.json", evaluate_contrastive),
    ):
        cv = json.loads((C.LOGS_DIR / log).read_text(encoding="utf-8"))["aggregate"]["metrics"]
        print(
            f"  {label:<14}{'held-out CV':<12}{cv['tpr']['mean']:8.2f}{cv['fpr']['mean']:8.2f}"
            f"{cv['precision']['mean']:8.2f}{cv['f1']['mean']:8.2f}"
        )
        train_summary, thr = fn(scenarios, device)
        print(
            f"  {'':<14}{'TRAIN':<12}{train_summary['tpr']:8.2f}{train_summary['fpr']:8.2f}"
            f"{train_summary['precision']:8.2f}{train_summary['f1']:8.2f}   (thr={thr:.3f})"
        )
        gap = train_summary["f1"] - cv["f1"]["mean"]
        print(f"  {'':<14}F1 gap = {gap:+.2f} pp  ({'overfit' if gap > 3 else 'well-fit' if gap > 0.5 else 'no gap'})\n")


# ─────────────────────────────────────────────────────────────────────────────
# 3. where the errors are
# ─────────────────────────────────────────────────────────────────────────────


def print_error_concentration() -> None:
    print("=" * 78)
    print("3. RESIDUAL ERRORS by policy (pooled over the 5 folds)")
    print("=" * 78)
    rows = {}
    for label, log in (("NLI", "nli_cv_results.json"), ("contrastive", "contrastive_cv_results.json")):
        data = json.loads((C.LOGS_DIR / log).read_text(encoding="utf-8"))
        per_policy: dict[str, dict[str, int]] = {}
        for fold in data["folds"]:
            for policy, block in fold["summary"]["subsets"]["by_policy"].items():
                agg = per_policy.setdefault(
                    policy, {"tp": 0, "fn": 0, "name": block.get("policy_name", policy)}
                )
                agg["tp"] += block["tp"]
                agg["fn"] += block["fn"]
        rows[label] = per_policy
        grouped = sorted(per_policy.items(), key=lambda kv: -kv[1]["fn"])
        total_fn = sum(v["fn"] for v in per_policy.values())
        for policy, counts in grouped:
            share = counts["fn"] / total_fn * 100 if total_fn else 0
            tpr = C._pct(counts["tp"], counts["tp"] + counts["fn"]) if (counts["tp"] + counts["fn"]) else 0.0  # noqa: SLF001
            print(
                f"  {label:<12}{policy}  {counts.get('name', policy):<24}"
                f"TPR={tpr:6.2f}  "
                f"FN={counts['fn']:>4}  ({share:4.1f}% of all missed attacks)"
            )
        print()
    print("  Pooled confusion over all 19,800 test predictions:")
    for label, log in (("NLI", "nli_cv_results.json"), ("contrastive", "contrastive_cv_results.json")):
        c = json.loads((C.LOGS_DIR / log).read_text(encoding="utf-8"))["aggregate"]["pooled_confusion"]
        print(
            f"    {label:<12} TP={c['tp']:<5} FN={c['fn']:<4} FP={c['fp']:<4} TN={c['tn']:<5}"
            f" errors={c['fp'] + c['fn']}  ({(c['fp'] + c['fn']) / c['total'] * 100:.2f}% of examples)"
        )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--device", default="auto")
    args = parser.parse_args()

    C.pin_visible_gpus(0)
    device = C.resolve_device(args.device)
    C.guard_rocm_windows_cwd(device)
    C.patch_rocm_windows_torch()
    if nli_moved_temp:
        print(f"note: TEMP/TMP moved to {nli_moved_temp}\n")

    scenarios = C.load_scenarios()
    print_curves()
    print_gap(scenarios, device)
    print_error_concentration()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
