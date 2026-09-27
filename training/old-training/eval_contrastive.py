#!/usr/bin/env python3
"""Granular evaluation of trained contrastive models on all four subsets.

Loads each of the 5 fold checkpoints, evaluates on the FULL dataset
(all 200 examples) broken down by:
  - all 60 malicious
  - 26 adversarial paraphrases
  - 34 explicit attacks
  - 140 benign

Outputs per-fold detail + aggregate to:
  approaches/raw-contrastive/models/contrastive_finetuned_full.json

Mirrors the output schema of eval_finetuned_only.py so the two
JSONs are directly comparable.
"""

import json, os, sys, time
import numpy as np

# ── Paths (overridable via CLI) ──
LOG_DIR = "logs"
MODEL_BASE_DIR = ".models"
MODEL_DIRNAME = None                     # must be set via --model-dirname

# Point at project root so 'data' and train_contrastive are importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from data.nli_finetune import RAW_TRAINING_DATA as TRAINING_DATA

# Reuse the document formatter from train_contrastive
sys.path.insert(0, os.path.dirname(__file__))
from train_contrastive import format_document, USE_DECOMPOSED


# ─────────────────────────────────────────────────────────────
# Subset builder (same logic as nli_testTrain.build_subsets)
# ─────────────────────────────────────────────────────────────


def build_subsets():
    """Split TRAINING_DATA into evaluation subsets.
    The 60 malicious entries are the last 60 in TRAINING_DATA.
    The 26 adversarial paraphrases are the LAST 26 of those 60.
    """
    malicious_start = len(TRAINING_DATA) - 60
    adversarial_start = len(TRAINING_DATA) - 26

    all_malicious = TRAINING_DATA[malicious_start:]  # 60
    adversarial = TRAINING_DATA[adversarial_start:]  # 26
    explicit = TRAINING_DATA[malicious_start:adversarial_start]  # 34
    benign = [d for d in TRAINING_DATA if d[2] != 0]  # label 1 or 2

    return {
        "all": all_malicious,
        "adversarial_paraphrases": adversarial,
        "explicit_attacks": explicit,
        "benign": benign,
    }


# ─────────────────────────────────────────────────────────────
# Contrastive evaluation
# ─────────────────────────────────────────────────────────────


def evaluate_contrastive(
    model, test_data, threshold: float, include_decomposed: bool = True
) -> dict:
    """Evaluate a contrastive bi-encoder on (goal, subtask, label, _) pairs.

    Computes cosine similarity between goal embedding and subtask embedding.
    Low similarity (< threshold) → predicted malicious.
    """
    # Embed all unique goal texts
    goal_texts = {}
    goal_embs = {}
    for row in test_data:
        goal, subtask, label = row[0], row[1], row[2]
        decomposed = row[3] if len(row) >= 4 else {}
        if goal not in goal_texts:
            goal_text = format_document(goal, goal, decomposed, include_decomposed)
            goal_texts[goal] = goal_text
            goal_embs[goal] = model.encode(goal_text, normalize_embeddings=True)

    y_true = []
    y_scores = []
    details = []

    for row in test_data:
        goal, subtask, label = row[0], row[1], row[2]
        decomposed = row[3] if len(row) >= 4 else {}
        sub_text = format_document(goal, subtask, decomposed, include_decomposed)
        sub_emb = model.encode(sub_text, normalize_embeddings=True)
        cos_sim = float(np.dot(goal_embs[goal], sub_emb))

        true_malicious = label == 0
        pred_malicious = cos_sim < threshold

        y_true.append(1 if true_malicious else 0)
        y_scores.append(cos_sim)

        details.append({
            "goal": goal[:80],
            "subtask": subtask[:120],
            "true": label,
            "cosine_similarity": round(cos_sim, 4),
            "caught": true_malicious and pred_malicious,
        })

    tp = sum(1 for d in details if d["true"] == 0 and d["caught"])
    fp = sum(1 for d in details if d["true"] != 0 and d["caught"])
    fn = sum(1 for d in details if d["true"] == 0 and not d["caught"])
    tn = sum(1 for d in details if d["true"] != 0 and not d["caught"])
    total = len(test_data)

    accuracy = (tp + tn) / total * 100 if total > 0 else 0
    tpr = tp / (tp + fn) * 100 if (tp + fn) > 0 else 0
    fpr = fp / (fp + tn) * 100 if (fp + tn) > 0 else 0
    precision = tp / (tp + fp) * 100 if (tp + fp) > 0 else 0
    f1 = 2 * tp / (2 * tp + fp + fn) * 100 if (2 * tp + fp + fn) > 0 else 0

    return {
        "accuracy": accuracy,
        "tpr": tpr,
        "fpr": fpr,
        "precision": precision,
        "f1": f1,
        "threshold": threshold,
        "tp": tp,
        "fp": fp,
        "tn": tn,
        "fn": fn,
        "total": total,
        "details": details,
    }


# ─────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────


def main():
    print("=" * 70)
    print("CONTRASTIVE MODEL — GRANULAR SUBSET EVALUATION")
    print(f"Decomposed: {USE_DECOMPOSED}")
    print("=" * 70)

    from sentence_transformers import SentenceTransformer

    subsets = build_subsets()
    print(f"\nSubsets:")
    for name, data in subsets.items():
        malicious = sum(1 for d in data if d[2] == 0)
        benign = len(data) - malicious
        print(
            f"  {name:>26}: {len(data):>3} total  ({malicious} malicious, {benign} benign)"
        )

    cv_results_path = os.path.join(LOG_DIR, "contrastive_cv_results.json")

    # Load per-fold thresholds from CV results
    fold_thresholds = {}
    if os.path.exists(cv_results_path):
        with open(cv_results_path, "r") as f:
            cv_data = json.load(f)
        for i, fold in enumerate(cv_data.get("folds", [])):
            fold_thresholds[i] = fold.get("threshold", 0.5)
        print(
            f"\n  Per-fold thresholds from CV: "
            f"{', '.join(f'fold_{i}={t:.3f}' for i, t in fold_thresholds.items())}"
        )
    else:
        print("\n  WARNING: No CV results found — using default threshold 0.5")
        for i in range(5):
            fold_thresholds[i] = 0.5

    # ── Evaluate each fold model on full dataset ──
    all_fold_results = []
    t_total = time.time()

    for fold in range(5):
        model_path = os.path.join(MODEL_BASE_DIR, MODEL_DIRNAME, f"fold_{fold}")
        if not os.path.exists(model_path):
            print(f"\n  WARNING: fold_{fold} not found at {model_path} — skipping")
            continue

        print(f"\n--- Fold {fold} ---------------------------------------------------")
        t0 = time.time()
        model = SentenceTransformer(model_path)
        threshold = fold_thresholds.get(fold, 0.5)

        fold_subsets = {}
        for name, data in subsets.items():
            r = evaluate_contrastive(
                model, data, threshold, include_decomposed=USE_DECOMPOSED
            )
            fold_subsets[name] = {
                "accuracy": r["accuracy"],
                "tpr": r["tpr"],
                "fpr": r["fpr"],
                "precision": r["precision"],
                "f1": r["f1"],
                "threshold": r["threshold"],
                "tp": r["tp"],
                "fp": r["fp"],
                "tn": r["tn"],
                "fn": r["fn"],
                "total": r["total"],
            }
            if name in ("adversarial_paraphrases", "all"):
                fold_subsets[name]["details"] = r["details"]

        elapsed = time.time() - t0
        fold_subsets["_runtime_sec"] = round(elapsed, 1)
        all_fold_results.append(fold_subsets)

        # Quick per-fold summary
        adv = fold_subsets["adversarial_paraphrases"]
        caught = (
            sum(1 for d in adv["details"] if d["caught"]) if "details" in adv else 0
        )
        print(
            f"  All 60 malicious:      TPR={fold_subsets['all']['tpr']:.1f}%  "
            f"FPR={fold_subsets['benign']['fpr']:.1f}%"
        )
        print(
            f"  Adversarial (26):      TPR={adv['tpr']:.1f}%  "
            f"({caught}/{adv['total']} caught)"
        )
        print(
            f"  Explicit (34):         TPR={fold_subsets['explicit_attacks']['tpr']:.1f}%"
        )
        print(f"  Benign FPR:            {fold_subsets['benign']['fpr']:.1f}%")
        print(f"  Threshold: {threshold:.3f}  Time: {elapsed:.1f}s")

    # ── Aggregate across folds ──
    if not all_fold_results:
        print("\n  No fold models found — aborting.")
        return

    print(f"\n{'=' * 70}")
    print("AGGREGATE ACROSS ALL FOLDS (evaluated on full dataset)")
    print(f"{'=' * 70}")

    metrics = ["accuracy", "tpr", "fpr", "precision", "f1"]
    aggregate_subsets = {}

    for subset_name in subsets.keys():
        agg = {}
        for m in metrics:
            vals = [f[subset_name][m] for f in all_fold_results]
            agg[m] = {"mean": float(np.mean(vals)), "std": float(np.std(vals))}
        aggregate_subsets[subset_name] = agg

        # Also aggregate confusion matrix
        total_tp = sum(f[subset_name]["tp"] for f in all_fold_results)
        total_fp = sum(f[subset_name]["fp"] for f in all_fold_results)
        total_fn = sum(f[subset_name]["fn"] for f in all_fold_results)
        total_tn = sum(f[subset_name]["tn"] for f in all_fold_results)
        agg["confusion"] = {
            "tp": total_tp,
            "fp": total_fp,
            "fn": total_fn,
            "tn": total_tn,
        }

        print(f"\n  {subset_name}:")
        for m in metrics:
            print(f"    {m:>12}:  {agg[m]['mean']:.1f}% ± {agg[m]['std']:.1f}%")

    # ── Per-example breakdown for adversarial paraphrases (from fold 0) ──
    print(f"\n{'=' * 70}")
    print("ADVERSARIAL PARAPHRASE BREAKDOWN (fold 0)")
    print(f"{'=' * 70}")
    adv_details = all_fold_results[0]["adversarial_paraphrases"]["details"]
    for d in adv_details:
        status = "CAUGHT" if d["caught"] else "MISSED"
        label_names = {0: "MAL", 1: "ENT", 2: "NEU"}
        print(f"  [{status}] cos={d['cosine_similarity']:.4f} | {d['subtask'][:80]}")

    # ── Export ──
    os.makedirs(LOG_DIR, exist_ok=True)

    output = {
        "model": f"contrastive-{cv_data.get('model', 'all-MiniLM-L12-v2') if os.path.exists(cv_results_path) else 'all-MiniLM-L12-v2'}",
        "decomposed": USE_DECOMPOSED,
        "evaluation": "full-dataset (WARNING: fold models see their own training data)",
        "folds": all_fold_results,
        "aggregate": aggregate_subsets,
        "total_runtime_sec": round(time.time() - t_total, 1),
        "note": "Each fold model was evaluated on the ENTIRE 200-example dataset. "
        "Metrics are inflated for examples that were in that fold's training set. "
        "For unbiased estimates, see contrastive_cv_results.json (5-fold CV).",
    }

    out_path = os.path.join(LOG_DIR, "contrastive_finetuned_full.json")
    with open(out_path, "w") as f:
        json.dump(output, f, indent=2, default=float)
    print(f"\n  Saved to {out_path}")

    # ── Final summary ──
    adv_agg = aggregate_subsets["adversarial_paraphrases"]
    print(f"\n  Summary (aggregate across 5 folds, full dataset):")
    print(
        f"    All 60 malicious:      TPR={aggregate_subsets['all']['tpr']['mean']:.1f}%"
    )
    print(f"    Adversarial (26):      TPR={adv_agg['tpr']['mean']:.1f}%")
    print(
        f"    Explicit (34):         TPR={aggregate_subsets['explicit_attacks']['tpr']['mean']:.1f}%"
    )
    print(
        f"    Benign FPR:            {aggregate_subsets['benign']['fpr']['mean']:.1f}%"
    )
    print(f"\n  WARNING: These numbers are on the FULL dataset (including training data).")
    print(f"    For unbiased 5-fold CV estimates, see contrastive_cv_results.json.")


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(
        description="Granular evaluation of contrastive fold models"
    )
    parser.add_argument(
        "--model-dirname", required=True,
        help="Dynamic model directory name (e.g. contrastive-miniLM-e4-b16-lr1e-05-mn6-dec-vs0.2)"
    )
    parser.add_argument("--log-dir", default=LOG_DIR)
    parser.add_argument("--model-base-dir", default=MODEL_BASE_DIR)

    a = parser.parse_args()
    LOG_DIR = a.log_dir
    MODEL_BASE_DIR = a.model_base_dir
    MODEL_DIRNAME = a.model_dirname

    main()
