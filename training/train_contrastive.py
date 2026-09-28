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
* **Matched budget.** The **4-epoch** budget is shared with ``train_nli.py``
  (see README "Training configuration"): identical outer protocol, per-model
  loss/LR. One contrastive epoch is ~23,000 triplets at the default cap.
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

# Print a Python traceback on native crashes (e.g. ROCm access violations)
# instead of the process dying silently with no output.
import faulthandler  # noqa: E402

faulthandler.enable()

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
    use_amp: bool = False,
    evaluator: Any | None = None,
) -> Any:
    """Fine-tune the bi-encoder on ``triplets``; optionally save to ``output_dir``.

    ``evaluator`` is a ``SentenceEvaluator`` invoked once per epoch (the
    per-epoch training curve).
    """
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
        use_amp=use_amp,
        evaluator=evaluator,
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


def make_epoch_evaluator(
    test_examples: Sequence[dict[str, Any]], fold_idx: int, batch_size: int
) -> Any:
    """Build a ``SentenceEvaluator`` that records the per-epoch training curve.

    ``model.fit`` (legacy DataLoader path) calls it once per epoch as
    ``evaluator(model, output_path=..., epoch=..., steps=...)`` with a **0-based**
    epoch; we store ``epoch + 1`` so row 1 is the first trained epoch.
    """
    from sentence_transformers.sentence_transformer.evaluation import SentenceEvaluator

    class _EpochEvaluator(SentenceEvaluator):
        def __init__(self) -> None:
            super().__init__()
            self.fold = fold_idx
            self.history: list[dict[str, Any]] = []

        def __call__(self, model, output_path=None, epoch=-1, steps=-1):  # noqa: ARG002
            examples = [dict(e) for e in test_examples]
            score_examples(model, examples, batch_size=batch_size)
            labels = [e["label"] for e in examples]
            scores = [e["score"] for e in examples]
            threshold, _ = C.find_best_threshold(labels, scores, HIGHER_IS_MALICIOUS)
            summary = C.summarize(examples, threshold, HIGHER_IS_MALICIOUS)
            display_epoch = (epoch + 1) if isinstance(epoch, int) and epoch >= 0 else len(self.history) + 1
            self.history.append(C.curve_point(display_epoch, threshold, summary))
            return summary["f1"] / 100.0  # scalar ST uses for best-model tracking

        def __str__(self) -> str:
            return f"epoch-eval(fold={self.fold})"

    return _EpochEvaluator()


# ─────────────────────────────────────────────────────────────────────────────
# Main pipeline
# ─────────────────────────────────────────────────────────────────────────────


def run(args: argparse.Namespace) -> dict[str, Any]:
    args.dataset = str(Path(args.dataset).resolve())
    C.pin_visible_gpus(args.gpu)
    moved_temp = C.ensure_space_free_temp()
    C.ensure_dirs()
    C.seed_everything(args.seed)
    device = C.resolve_device(args.device)
    C.guard_rocm_windows_cwd(device)
    C.patch_rocm_windows_torch()

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
    print(f"  device={device}  use_amp={args.use_amp}")
    _diag = C.device_summary()
    print(f"  cwd={_diag.get('cwd')}  vram_free={_diag.get('vram_free_gb', 'n/a')}GB")
    if moved_temp:
        print(f"  note: TEMP/TMP moved to {moved_temp} (a space in the old path crashes ROCm)")
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
        "device": device,
        "use_amp": args.use_amp,
        "model_dirname": dirname,
    }

    # ── Baseline: the UNTRAINED bi-encoder on the shared folds ("before training") ──
    baseline_folds: list[dict[str, Any]] = []
    if args.eval_baseline:
        from sentence_transformers import SentenceTransformer

        print("\n[baseline] loading untrained bi-encoder (no fine-tuning)...")
        baseline_model = SentenceTransformer(C.CONTRASTIVE_BASE, device=device)
        for fold_idx, (_, test_idx) in enumerate(folds):
            test_examples = C.build_eval_examples([scenarios[i] for i in test_idx])
            score_examples(baseline_model, test_examples, batch_size=args.eval_batch_size)
            labels = [e["label"] for e in test_examples]
            scores = [e["score"] for e in test_examples]
            threshold, thr_f1 = C.find_best_threshold(labels, scores, HIGHER_IS_MALICIOUS)
            summary = C.summarize(test_examples, threshold, HIGHER_IS_MALICIOUS)
            baseline_folds.append(
                {"fold": fold_idx, "threshold": threshold,
                 "threshold_f1": thr_f1, "summary": summary}
            )
            print(
                f"[baseline] fold {fold_idx}: TPR={summary['tpr']:.1f}%  "
                f"FPR={summary['fpr']:.1f}%  F1={summary['f1']:.1f}%  thr={threshold:.3f}"
            )

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
        test_examples = C.build_eval_examples(test_scenarios)
        evaluator = (
            make_epoch_evaluator(test_examples, fold_idx, args.eval_batch_size)
            if args.eval_per_epoch
            else None
        )
        model = train_bi_encoder(
            train_triplets,
            epochs=args.epochs,
            batch_size=args.batch_size,
            learning_rate=args.lr,
            weight_decay=args.weight_decay,
            warmup_ratio=args.warmup,
            margin=args.margin,
            seed=args.seed + fold_idx,
            device=device,
            output_dir=None,
            use_amp=args.use_amp,
            evaluator=evaluator,
        )
        train_time = time.time() - t0

        score_examples(model, test_examples, batch_size=args.eval_batch_size)
        labels = [e["label"] for e in test_examples]
        scores = [e["score"] for e in test_examples]
        threshold, thr_f1 = C.find_best_threshold(labels, scores, HIGHER_IS_MALICIOUS)
        summary = C.summarize(test_examples, threshold, HIGHER_IS_MALICIOUS)

        # Per-epoch curve, seeded with epoch 0 = the untrained model on this fold.
        curve: list[dict[str, Any]] = []
        if baseline_folds and fold_idx < len(baseline_folds):
            base = baseline_folds[fold_idx]
            curve.append(C.curve_point(0, base["threshold"], base["summary"]))
        if evaluator is not None:
            curve.extend(evaluator.history)

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
                "training_curve": curve,
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
            device=device,
            output_dir=str(model_dir),
            use_amp=args.use_amp,
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
        "compute": C.device_summary(),
        "dataset": {
            **C.dataset_stats(scenarios),
            "path": str(Path(args.dataset).name),
            "limit_anchors": args.limit_anchors,
        },
        "config": config,
        "folds": fold_records,
        "aggregate": aggregate,
        "aggregate_fixed_threshold": aggregate_fixed,
        "aggregate_curve": C.aggregate_curve([f["training_curve"] for f in fold_records]),
        "final_threshold": final_threshold,
        "baseline": (
            {
                "description": "untrained all-MiniLM-L12-v2 baseline (before training)",
                "folds": baseline_folds,
                "aggregate": C.aggregate_summaries(
                    [f["summary"] for f in baseline_folds]
                ),
                "final_threshold": float(
                    np.mean([f["threshold"] for f in baseline_folds])
                ),
            }
            if baseline_folds
            else {}
        ),
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
    _print_curve(results)
    print(
        f"  adversarial paraphrases TPR: "
        f"{subs[C.SUBSET_PARAPHRASES]['tpr']['mean']:.2f}% "
        f"(explicit: {subs[C.SUBSET_EXPLICIT]['tpr']['mean']:.2f}%)"
    )


def _print_curve(results: dict[str, Any]) -> None:
    """Print the mean-across-folds per-epoch curve (epoch 0 = untrained)."""
    curve = results.get("aggregate_curve") or []
    if not curve:
        return
    print("\n  Per-epoch curve (mean across folds; epoch 0 = untrained):")
    print(f"    {'epoch':>5}  {'TPR':>7}  {'FPR':>7}  {'Prec':>7}  {'F1':>7}")
    for point in curve:
        print(
            f"    {point['epoch']:>5}  {point['tpr']['mean']:>7.2f}  "
            f"{point['fpr']['mean']:>7.2f}  {point['precision']['mean']:>7.2f}  "
            f"{point['f1']['mean']:>7.2f}"
        )


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--dataset", default=str(C.DATASET_PATH))
    parser.add_argument("--limit-anchors", type=int, default=None)
    parser.add_argument("--folds", type=int, default=5)
    parser.add_argument("--fold-strategy", choices=("group", "stratified"),
                        default="group")
    parser.add_argument("--epochs", type=int, default=4,
                        help="matched epoch budget, shared with train_nli.py")
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--eval-batch-size", type=int, default=64)
    parser.add_argument("--lr", type=float, default=1e-5)
    parser.add_argument("--weight-decay", type=float, default=0.01)
    parser.add_argument("--warmup", type=float, default=0.1)
    parser.add_argument("--margin", type=float, default=0.5)
    parser.add_argument("--max-triplets-per-anchor", type=int, default=64,
                        help="cap on posxneg triplets per goal (0 = unlimited)")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--device", default="auto",
                        help="auto | cpu | cuda (AMD ROCm exposes the GPU as cuda)")
    parser.add_argument("--gpu", type=int, default=0,
                        help="GPU index to pin (single-GPU; avoids DataParallel)")
    parser.add_argument("--use-amp", action=argparse.BooleanOptionalAction,
                        default=True, help="fp16 autocast during training")
    parser.add_argument("--eval-baseline", dest="eval_baseline", action="store_true",
                        default=True,
                        help="evaluate the untrained bi-encoder before training")
    parser.add_argument("--no-eval-baseline", dest="eval_baseline",
                        action="store_false")
    parser.add_argument("--eval-per-epoch", dest="eval_per_epoch",
                        action="store_true", default=True,
                        help="log test-fold metrics after every epoch")
    parser.add_argument("--no-eval-per-epoch", dest="eval_per_epoch",
                        action="store_false")
    parser.add_argument("--save-folds", action="store_true")
    parser.add_argument("--train-final", dest="train_final", action="store_true",
                        default=True)
    parser.add_argument("--no-train-final", dest="train_final", action="store_false")
    return parser.parse_args(argv)


if __name__ == "__main__":
    run(parse_args())
