#!/usr/bin/env python3
"""Train the Sentinel **contrastive bi-encoder** (the thesis' proposed model).

Fine-tunes ``all-MiniLM-L12-v2`` with **TripletLoss (cosine distance)** on
DelegationBench v4 triples ``(anchor, positive, hard-negative)`` and logs the
same metric schema as ``train_nli.py`` so the two are directly comparable.

Design notes
------------
* **Triplets.** For every goal (anchor) the benign subtasks are the positives
  and the malicious subtasks are the hard negatives; the training triplets are
  the Cartesian product of the two, capped per anchor (``--max-triplets-per-anchor``)
  to bound the posxneg blow-up (mirrors ``old-training/train_contrastive.py``).
* **Framing.** The deployed model is the ``-raw-`` variant, so both sides use
  the raw ``"Goal: {goal}. Subtask: {subtask}."`` template (goal side uses
  ``goal, goal``) with **original casing preserved** - byte-identical to
  ``fastapi/app/preprocess.py``.
* **Decision rule.** ``cosine < threshold`` (lower similarity = more malicious).
* **Threshold.** Per fold, the F1-optimal cut-off on that fold's test set; the
  deployment threshold is the mean across folds (mirrors ``Thesis.md``).

Outputs (relative to ``training/``)::

    logs/contrastive_cv_results.json               full run log
    models/<contrastive-...-raw>/                     final model (all data)
    models/<contrastive-...-raw>/training_stats.json

Run it with the FastAPI virtualenv::

    ../fastapi/.venv/Scripts/python.exe train_contrastive.py --limit-anchors 20 --epochs 1
    ../fastapi/.venv/Scripts/python.exe train_contrastive.py
"""

from __future__ import annotations

import argparse
import random
import sys
import time
from collections import defaultdict
from pathlib import Path
from typing import Any, Sequence

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common as C  # noqa: E402

HIGHER_IS_MALICIOUS = False  # contrastive: low cosine similarity => malicious


def model_dirname(args: argparse.Namespace) -> str:
    """Dynamic checkpoint name encoding the hyperparameters (``-raw-`` variant)."""
    return (
        f"contrastive-miniLM-e{args.epochs}-b{args.batch_size}"
        f"-lr{args.lr:g}-mn{args.max_triplets_per_anchor}"
        f"-mrg{args.margin:g}-raw"
    )


# ─────────────────────────────────────────────────────────────────────────────
# Triplet construction
# ─────────────────────────────────────────────────────────────────────────────


def build_triplets(
    scenarios: Sequence[C.Scenario],
    max_per_anchor: int | None,
    seed: int,
) -> list[tuple[str, str, str]]:
    """Build ``(anchor, positive, negative)`` framed triplets, grouped by goal."""
    by_anchor: dict[str, dict[str, list[str]]] = defaultdict(
        lambda: {"pos": [], "neg": []}
    )
    for s in scenarios:
        by_anchor[s.anchor]["pos"].append(C.format_document(s.anchor, s.positive))
        by_anchor[s.anchor]["neg"].append(C.format_document(s.anchor, s.negative))

    rng = random.Random(seed)
    triplets: list[tuple[str, str, str]] = []
    for anchor, groups in by_anchor.items():
        anchors_side = C.format_document(anchor, anchor)
        pairs = [(p, n) for p in groups["pos"] for n in groups["neg"]]
        if max_per_anchor and len(pairs) > max_per_anchor:
            pairs = rng.sample(pairs, max_per_anchor)
        for positive, negative in pairs:
            triplets.append((anchors_side, positive, negative))
    return triplets


# ─────────────────────────────────────────────────────────────────────────────
# Training
# ─────────────────────────────────────────────────────────────────────────────


def train_bi_encoder(
    triplets: Sequence[tuple[str, str, str]],
    *,
    epochs: int,
    batch_size: int,
    learning_rate: float,
    weight_decay: float,
    warmup_ratio: float,
    margin: float,
    seed: int,
    device: str,
    output_dir: str | None = None,
) -> Any:
    """Fine-tune the bi-encoder on ``triplets``; optionally save to ``output_dir``."""
    import torch
    from sentence_transformers import InputExample, SentenceTransformer, losses
    from torch.utils.data import DataLoader

    torch.manual_seed(seed)
    np.random.seed(seed)

    model = SentenceTransformer(C.CONTRASTIVE_BASE, device=device)
    examples = [
        InputExample(texts=[a, p, n]) for (a, p, n) in triplets
    ]
    dataloader = DataLoader(examples, shuffle=True, batch_size=batch_size)

    loss = losses.TripletLoss(
        model,
        distance_metric=losses.TripletDistanceMetric.COSINE,
        triplet_margin=margin,
    )
    model.fit(
        train_objectives=[(dataloader, loss)],
        epochs=epochs,
        warmup_steps=int(warmup_ratio * len(dataloader)),
        optimizer_params={"lr": learning_rate, "weight_decay": weight_decay},
        output_path=output_dir,
        save_best_model=False,
        show_progress_bar=False,
    )
    return model


# ─────────────────────────────────────────────────────────────────────────────
# Scoring
# ─────────────────────────────────────────────────────────────────────────────


def _encode_unique(model: Any, texts: Sequence[str], batch_size: int) -> dict[str, Any]:
    unique = list(dict.fromkeys(texts))
    embeddings = model.encode(
        unique,
        normalize_embeddings=True,
        batch_size=batch_size,
        show_progress_bar=False,
    )
    return dict(zip(unique, embeddings))


def score_examples(
    model: Any, examples: list[dict[str, Any]], batch_size: int = 64
) -> list[dict[str, Any]]:
    """Attach the goal↔subtask cosine similarity to each example (in place)."""
    if not examples:
        return examples
    goal_side = {C.format_document(e["goal"], e["goal"]) for e in examples}
    goal_embs = _encode_unique(model, list(goal_side), batch_size)
    subtask_texts = [C.format_document(e["goal"], e["subtask"]) for e in examples]
    subtask_embs = _encode_unique(model, subtask_texts, batch_size)
    for example, text in zip(examples, subtask_texts):
        goal_emb = goal_embs[C.format_document(example["goal"], example["goal"])]
        example["score"] = float(np.dot(goal_emb, subtask_embs[text]))
    return examples


# ─────────────────────────────────────────────────────────────────────────────
# Main pipeline
# ─────────────────────────────────────────────────────────────────────────────


def run(args: argparse.Namespace) -> dict[str, Any]:
    C.ensure_dirs()
    C.seed_everything(args.seed)

    scenarios = C.load_scenarios(args.dataset, limit_anchors=args.limit_anchors)
    if not scenarios:
        raise SystemExit("No scenarios loaded - check --dataset.")
    folds = C.make_folds(
        scenarios, n_splits=args.folds, seed=args.seed, strategy=args.fold_strategy
    )
    dirname = model_dirname(args)

    print("=" * 74)
    print("CONTRASTIVE BI-ENCODER FINE-TUNING  (Proposed model)")
    print(f"  base={C.CONTRASTIVE_BASE}   loss=TripletLoss(cosine, margin={args.margin})")
    print(f"  scenarios={len(scenarios)}  anchors={len({s.anchor for s in scenarios})}"
          f"  folds={args.folds}  strategy={args.fold_strategy}")
    print(f"  epochs={args.epochs}  batch={args.batch_size}  lr={args.lr}"
          f"  max_triplets/anchor={args.max_triplets_per_anchor}  seed={args.seed}")
    print("=" * 74)

    config = {
        "base": C.CONTRASTIVE_BASE,
        "loss": "TripletLoss(cosine)",
        "margin": args.margin,
        "decision": "cosine < threshold",
        "include_decomposed": False,
        "epochs": args.epochs,
        "batch_size": args.batch_size,
        "learning_rate": args.lr,
        "weight_decay": args.weight_decay,
        "warmup_ratio": args.warmup,
        "max_triplets_per_anchor": args.max_triplets_per_anchor,
        "folds": args.folds,
        "fold_strategy": args.fold_strategy,
        "seed": args.seed,
        "device": args.device,
        "model_dirname": dirname,
    }

    fold_records: list[dict[str, Any]] = []
    fold_scores: list[list[dict[str, Any]]] = []
    t_all = time.time()
    num_train_triplets = None

    for fold_idx, (train_idx, test_idx) in enumerate(folds):
        train_scenarios = [scenarios[i] for i in train_idx]
        test_scenarios = [scenarios[i] for i in test_idx]
        train_triplets = build_triplets(
            train_scenarios, args.max_triplets_per_anchor, seed=args.seed + fold_idx
        )
        num_train_triplets = len(train_triplets)

        print(
            f"\n--- Fold {fold_idx + 1}/{args.folds}: "
            f"train={len(train_scenarios)} scenarios ({len(train_triplets)} triplets), "
            f"test={len(test_scenarios)} scenarios ---"
        )
        t0 = time.time()
        model = train_bi_encoder(
            train_triplets,
            epochs=args.epochs,
            batch_size=args.batch_size,
            learning_rate=args.lr,
            weight_decay=args.weight_decay,
            warmup_ratio=args.warmup,
            margin=args.margin,
            seed=args.seed + fold_idx,
            device=args.device,
            output_dir=None,
        )
        train_time = time.time() - t0

        test_examples = C.build_eval_examples(test_scenarios)
        score_examples(model, test_examples, batch_size=args.eval_batch_size)
        labels = [e["label"] for e in test_examples]
        scores = [e["score"] for e in test_examples]
        threshold, thr_f1 = C.find_best_threshold(labels, scores, HIGHER_IS_MALICIOUS)
        summary = C.summarize(test_examples, threshold, HIGHER_IS_MALICIOUS)

        fold_records.append(
            {
                "fold": fold_idx,
                "train_scenarios": len(train_scenarios),
                "train_triplets": len(train_triplets),
                "test_scenarios": len(test_scenarios),
                "test_examples": len(test_examples),
                "threshold": threshold,
                "threshold_f1": thr_f1,
                "train_time_sec": round(train_time, 1),
                "summary": summary,
            }
        )
        fold_scores.append(test_examples)

        print(
            f"    TPR={summary['tpr']:.1f}%  FPR={summary['fpr']:.1f}%  "
            f"Precision={summary['precision']:.1f}%  F1={summary['f1']:.1f}%  "
            f"(thr={threshold:.3f}, {train_time:.0f}s)"
        )
        print(
            f"    adversarial-paraphrase TPR="
            f"{summary['subsets'][C.SUBSET_PARAPHRASES]['tpr']:.1f}%  "
            f"explicit TPR={summary['subsets'][C.SUBSET_EXPLICIT]['tpr']:.1f}%"
        )

        if args.save_folds:
            fold_dir = C.MODELS_DIR / f"{dirname}-fold{fold_idx}"
            model.save(str(fold_dir))
            print(f"    saved fold checkpoint -> {fold_dir}")

    config["num_train_triplets_per_fold"] = num_train_triplets
    final_threshold = float(np.mean([f["threshold"] for f in fold_records]))
    print(f"\n[threshold] mean across folds = {final_threshold:.4f}")

    for record, examples in zip(fold_records, fold_scores):
        record["fixed_threshold_summary"] = C.summarize(
            examples, final_threshold, HIGHER_IS_MALICIOUS
        )

    aggregate = C.aggregate_summaries([f["summary"] for f in fold_records])
    aggregate_fixed = C.aggregate_summaries(
        [f["fixed_threshold_summary"] for f in fold_records]
    )

    final_model_info: dict[str, Any] = {}
    if args.train_final:
        print(f"\n[final] training on all {len(scenarios)} scenarios...")
        all_triplets = build_triplets(
            scenarios, args.max_triplets_per_anchor, seed=args.seed
        )
        model_dir = C.MODELS_DIR / dirname
        t0 = time.time()
        train_bi_encoder(
            all_triplets,
            epochs=args.epochs,
            batch_size=args.batch_size,
            learning_rate=args.lr,
            weight_decay=args.weight_decay,
            warmup_ratio=args.warmup,
            margin=args.margin,
            seed=args.seed,
            device=args.device,
            output_dir=str(model_dir),
        )
        final_model_info = {
            "dir": str(model_dir.relative_to(C.TRAINING_DIR)),
            "trained_on_scenarios": len(scenarios),
            "train_triplets": len(all_triplets),
            "train_time_sec": round(time.time() - t0, 1),
        }
        print(f"    saved final model -> {model_dir}")
    else:
        print("\n[final] skipped (--no-train-final)")

    results: dict[str, Any] = {
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "model": dirname,
        "role": "contrastive bi-encoder (proposed solution)",
        "base": C.CONTRASTIVE_BASE,
        "loss": "TripletLoss(cosine)",
        "decision": "cosine < threshold",
        "include_decomposed": False,
        "higher_score_means_malicious": HIGHER_IS_MALICIOUS,
        "dataset": {
            **C.dataset_stats(scenarios),
            "path": str(Path(args.dataset).name),
            "limit_anchors": args.limit_anchors,
        },
        "config": config,
        "folds": fold_records,
        "aggregate": aggregate,
        "aggregate_fixed_threshold": aggregate_fixed,
        "final_threshold": final_threshold,
        "final_model": final_model_info,
        "total_runtime_sec": round(time.time() - t_all, 1),
    }

    log_path = C.write_json(C.LOGS_DIR / "contrastive_cv_results.json", results)
    print(f"\n  full log -> {log_path}")

    if final_model_info:
        stats_path = C.write_json(
            C.MODELS_DIR / dirname / "training_stats.json", results
        )
        print(f"  model stats -> {stats_path}")

    _print_summary(results)
    return results


def _print_summary(results: dict[str, Any]) -> None:
    agg = results["aggregate"]["metrics"]
    subs = results["aggregate"]["subsets"]
    print("\n" + "=" * 74)
    print("5-FOLD CV SUMMARY - contrastive bi-encoder (per-fold F1-optimal threshold)")
    print("=" * 74)
    for metric in ("tpr", "fpr", "precision", "f1", "accuracy"):
        print(f"  {metric:>10}: {agg[metric]['mean']:6.2f}% +/- {agg[metric]['std']:.2f}%")
    print(f"  {'threshold':>10}: {results['final_threshold']:.4f}")
    print(
        f"  adversarial paraphrases TPR: "
        f"{subs[C.SUBSET_PARAPHRASES]['tpr']['mean']:.2f}% "
        f"(explicit: {subs[C.SUBSET_EXPLICIT]['tpr']['mean']:.2f}%)"
    )


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--dataset", default=str(C.DATASET_PATH))
    parser.add_argument("--limit-anchors", type=int, default=None)
    parser.add_argument("--folds", type=int, default=5)
    parser.add_argument("--fold-strategy", choices=("group", "stratified"),
                        default="group")
    parser.add_argument("--epochs", type=int, default=4)
    parser.add_argument("--batch-size", type=int, default=16)
    parser.add_argument("--eval-batch-size", type=int, default=64)
    parser.add_argument("--lr", type=float, default=1e-5)
    parser.add_argument("--weight-decay", type=float, default=0.01)
    parser.add_argument("--warmup", type=float, default=0.1)
    parser.add_argument("--margin", type=float, default=0.5)
    parser.add_argument("--max-triplets-per-anchor", type=int, default=128,
                        help="cap on posxneg triplets per goal (0 = unlimited)")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--device", default="cpu")
    parser.add_argument("--save-folds", action="store_true")
    parser.add_argument("--train-final", dest="train_final", action="store_true",
                        default=True)
    parser.add_argument("--no-train-final", dest="train_final", action="store_false")
    return parser.parse_args(argv)


if __name__ == "__main__":
    run(parse_args())
