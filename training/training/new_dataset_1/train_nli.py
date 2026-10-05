#!/usr/bin/env python3
"""Train the Sentinel **NLI cross-encoder** (SentinelAgent P2 intent verifier).

Fine-tunes ``cross-encoder/nli-MiniLM2-L6-H768`` (3 labels:
``[contradiction, entailment, neutral]``) on **dataset-v3** and logs every metric
the thesis needs (Recall/TPR, Precision, F1, FPR, accuracy) - overall, per fold,
broken down by **stratum** (the dataset-v3 attack taxonomy: `easy`, `near_miss`,
`matched`, `hard`, `control`) and by source.

This is the isolated dataset-v3 copy. Every path resolves inside
``training/training/new_dataset_1/``, so a run here cannot touch the parent
pipeline's models or logs.

Design notes
------------
* **Protocol fidelity.** The training protocol reproduces
  ``old-training/sentinelagent_nli_finetune.py`` step for step: the same
  premise/hypothesis framing, the same 3-label head, ``p(contradiction)`` as the
  decision score, the same F1-optimal threshold sweep, an off-the-shelf baseline
  evaluated on the same folds, cross-validation, and a final model trained on all
  data. Only the corpus and the report breakdown differ.
* **Training data.** **One row is one NLI pair** (dataset-v3 is
  ``(goal, subtask, label)``, not the v2 anchor/positive/negative triplet shape).
  Labels map straight through: 0 contradiction (malicious), 1 entailment,
  2 neutral. Unlike dataset_v2, class 2 is populated here.
* **Decision rule.** ``p(contradiction) > threshold`` (higher = more malicious).
* **Threshold.** Per fold, the F1-optimal cut-off on that fold's test set; the
  deployment threshold is the mean across folds (mirrors ``Thesis.md`` §System
  Architecture and the reference fine-tune script).
* **Budget.** Defaults to the **4-epoch** budget shared with
  ``train_contrastive.py``: identical outer protocol, per-model loss/LR. The
  15 epochs used by ``old-training/`` were tuned on a ~200-example set; on 584
  rows that is a much larger optimisation budget.
* **Baseline.** The off-the-shelf cross-encoder is evaluated on the same folds, so
  RQ1 (baseline NLI) and the fine-tuned model are directly comparable.
* **Read ``data/DATASET_V3.md`` section 4 first.** A bag of words scores AUC 0.981
  on the concept-disjoint split, so accuracy on this corpus must be quoted
  against that ceiling, not on its own.

Outputs (relative to this folder)::

    logs/nli_cv_results.json                       full run log
    models/sentinelagent-nli-finetuned/            final model (all data)
    models/sentinelagent-nli-finetuned/training_stats.json

Run it with the FastAPI virtualenv (which already has the deps)::

    ../fastapi/.venv/Scripts/python.exe train_nli.py --limit-goals 20 --epochs 1  # smoke
    ../fastapi/.venv/Scripts/python.exe train_nli.py                               # full run
"""

from __future__ import annotations

import argparse
import os
import sys
import time
from pathlib import Path
from typing import Any, Callable, Sequence

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common as C  # noqa: E402

# Print a Python traceback on native crashes (e.g. ROCm access violations)
# instead of the process dying silently with no output.
import faulthandler  # noqa: E402

faulthandler.enable()

MODEL_DIRNAME = "sentinelagent-nli-finetuned"
HIGHER_IS_MALICIOUS = True  # NLI: p(contradiction) high => malicious


# ─────────────────────────────────────────────────────────────────────────────
# Data -> NLI pairs
# ─────────────────────────────────────────────────────────────────────────────


def build_nli_pairs(rows: Sequence[C.V3Row]) -> list[tuple[str, str, int]]:
    """Expand dataset-v3 rows into ``(premise, hypothesis, label)`` NLI pairs.

    **One row is one pair.** The label maps straight through, because dataset-v3
    uses the same convention as the reference fine-tune script and as
    ``common.NLI_LABELS``: 0 contradiction (malicious), 1 entailment, 2 neutral.

    The premise/hypothesis framing comes from ``common.format_nli``, which is
    byte-identical to what ``fastapi/app/preprocess.py`` uses at inference - so a
    model trained here sees the same input shape it will see in production.
    """
    pairs: list[tuple[str, str, int]] = []
    for r in rows:
        premise, hypothesis = C.format_nli(r.goal, r.subtask)
        pairs.append((premise, hypothesis, int(r.label)))
    return pairs


def score_examples(
    model: Any, examples: list[dict[str, Any]], batch_size: int = 64
) -> list[dict[str, Any]]:
    """Attach ``p(contradiction)`` to each evaluation example (in place)."""
    pairs = [C.format_nli(e["goal"], e["subtask"]) for e in examples]
    if not pairs:
        return examples
    raw = model.predict(pairs, batch_size=batch_size, show_progress_bar=False)
    for example, row in zip(examples, np.asarray(raw)):
        example["score"] = float(C.to_probabilities(row)[C.NLI_CONTRADICTION])
    return examples


# ─────────────────────────────────────────────────────────────────────────────
# Training
# ─────────────────────────────────────────────────────────────────────────────


def train_cross_encoder(
    pairs: Sequence[tuple[str, str, int]],
    *,
    epochs: int,
    cpu: bool = False,
    batch_size: int,
    learning_rate: float,
    weight_decay: float,
    warmup_ratio: float,
    seed: int,
    device: str,
    max_length: int | None,
    output_dir: str,
    precision: str = "fp32",
    epoch_eval: Callable[[Any, int], dict[str, Any]] | None = None,
) -> tuple[Any, list[dict[str, Any]], list[dict[str, Any]]]:
    """Fine-tune the cross-encoder; return ``(model, log_history, epoch_records)``.

    When ``epoch_eval`` is given it is called as ``epoch_eval(model, epoch)`` at the
    end of every epoch and its return value is collected into ``epoch_records``
    (the per-epoch training curve).
    """
    from datasets import Dataset
    from sentence_transformers import CrossEncoder
    from sentence_transformers.cross_encoder.trainer import CrossEncoderTrainer
    from sentence_transformers.cross_encoder.training_args import (
        CrossEncoderTrainingArguments,
    )

    model = CrossEncoder(C.NLI_BASE, num_labels=3, device=device)
    if max_length:
        try:
            model.max_length = max_length
        except Exception:  # pragma: no cover - best effort
            pass

    dataset = Dataset.from_dict(
        {
            "sentence1": [p[0] for p in pairs],
            "sentence2": [p[1] for p in pairs],
            "label": [p[2] for p in pairs],
        }
    )

    args = CrossEncoderTrainingArguments(
        output_dir=output_dir,
        num_train_epochs=epochs,
        per_device_train_batch_size=batch_size,
        learning_rate=learning_rate,
        weight_decay=weight_decay,
        warmup_steps=warmup_ratio,
        logging_steps=50,
        save_strategy="no",
        report_to="none",
        seed=seed,
        # Belt-and-braces for the CPU protocol: without this, HF Trainer/accelerate
        # auto-detects the GPU independently of the device we pass to the model and
        # crashed in _move_model_to_device.
        use_cpu=cpu,
        fp16=precision == "fp16",
        bf16=precision == "bf16",
    )

    # Per-epoch evaluation (diagnostic training curve), if requested.
    epoch_records: list[dict[str, Any]] = []
    callbacks: list[Any] = []
    if epoch_eval is not None:
        from transformers import TrainerCallback

        class _EpochEvalCallback(TrainerCallback):
            def on_epoch_end(self, args, state, control, **kwargs):  # noqa: ARG002
                epoch = int(round(float(getattr(state, "epoch", 0) or 0)))
                epoch_records.append(epoch_eval(model, epoch))

        callbacks.append(_EpochEvalCallback())
    trainer = CrossEncoderTrainer(
        model=model, args=args, train_dataset=dataset, callbacks=callbacks or None
    )
    trainer.train()
    return model, list(getattr(trainer.state, "log_history", []) or []), epoch_records


# ─────────────────────────────────────────────────────────────────────────────
# Main pipeline
# ─────────────────────────────────────────────────────────────────────────────


def run(args: argparse.Namespace) -> dict[str, Any]:
    # The CPU protocol has to hide the GPUs BEFORE torch is first imported - torch
    # reads device visibility at init, and HF Trainer/accelerate auto-detects the GPU
    # independently of --device. See common.force_cpu_protocol.
    if args.device == "cpu":
        C.force_cpu_protocol()
    from sentence_transformers import CrossEncoder

    args.dataset = str(Path(args.dataset).resolve())
    if args.device != "cpu":          # must not re-enable the GPU after the above
        C.pin_visible_gpus(args.gpu)
    moved_temp = C.ensure_space_free_temp()
    C.ensure_dirs()
    C.seed_everything(args.seed)
    device = C.resolve_device(args.device)
    C.guard_rocm_windows_cwd(device)
    C.patch_rocm_windows_torch()

    rows = C.load_v3(args.dataset, limit_goals=args.limit_goals)
    if not rows:
        raise SystemExit("No rows loaded - check --dataset.")
    folds = C.make_v3_folds(
        rows, n_splits=args.folds, seed=args.seed, strategy=args.fold_strategy
    )

    print("=" * 74)
    print("NLI CROSS-ENCODER FINE-TUNING  (dataset-v3)")
    print(f"  base={C.NLI_BASE}   labels={C.NLI_LABELS}")
    print(f"  rows={len(rows)}  goals={len({r.goal for r in rows})}"
          f"  folds={args.folds}  strategy={args.fold_strategy}")
    _strata = {}
    for _r in rows:
        _strata[_r.stratum] = _strata.get(_r.stratum, 0) + 1
    print(f"  strata={dict(sorted(_strata.items()))}")
    print(f"  epochs={args.epochs}  batch={args.batch_size}  lr={args.lr}  seed={args.seed}")
    print(f"  device={device}  precision={args.precision}")
    _diag = C.device_summary()
    print(f"  cwd={_diag.get('cwd')}  vram_free={_diag.get('vram_free_gb', 'n/a')}GB")
    if moved_temp:
        print(f"  note: TEMP/TMP moved to {moved_temp} (a space in the old path crashes ROCm)")
    print("=" * 74)

    config = {
        "base": C.NLI_BASE,
        "labels": list(C.NLI_LABELS),
        "decision": "p_contradiction > threshold",
        "activation": "softmax",
        "epochs": args.epochs,
        "batch_size": args.batch_size,
        "learning_rate": args.lr,
        "weight_decay": args.weight_decay,
        "warmup_ratio": args.warmup,
        "folds": args.folds,
        "fold_strategy": args.fold_strategy,
        "protocol": C.protocol_label(args.fold_strategy),
        "seed": args.seed,
        "device": device,
        "precision": args.precision,
        "max_length": args.max_length,
        "num_train_pairs_per_fold": None,  # filled below
    }

    # ── Baseline (off-the-shelf) evaluation on the shared folds ──
    baseline_folds: list[dict[str, Any]] = []
    baseline_model = None
    if args.eval_baseline:
        print("\n[baseline] loading off-the-shelf cross-encoder (no fine-tuning)...")
        baseline_model = CrossEncoder(C.NLI_BASE, num_labels=3, device=device)
        for fold_idx, (_, test_idx) in enumerate(folds):
            test_examples = C.v3_examples([rows[i] for i in test_idx])
            score_examples(baseline_model, test_examples, batch_size=args.eval_batch_size)
            labels = [e["label"] for e in test_examples]
            scores = [e["score"] for e in test_examples]
            threshold, thr_f1 = C.find_best_threshold(
                labels, scores, HIGHER_IS_MALICIOUS
            )
            summary = C.summarize_v3(test_examples, threshold, HIGHER_IS_MALICIOUS)
            baseline_folds.append(
                {"fold": fold_idx, "threshold": threshold,
                 "threshold_f1": thr_f1, "summary": summary}
            )
            print(
                f"[baseline] fold {fold_idx}: TPR={summary['tpr']:.1f}%  "
                f"FPR={summary['fpr']:.1f}%  F1={summary['f1']:.1f}%  "
                f"thr={threshold:.3f}"
            )

    # ── Fine-tuned cross-validation ──
    fold_records: list[dict[str, Any]] = []
    fold_scores: list[list[dict[str, Any]]] = []  # kept for fixed-threshold eval
    t_all = time.time()

    for fold_idx, (train_idx, test_idx) in enumerate(folds):
        train_rows = [rows[i] for i in train_idx]
        test_rows = [rows[i] for i in test_idx]
        train_pairs = build_nli_pairs(train_rows)
        config["num_train_pairs_per_fold"] = len(train_pairs)

        print(
            f"\n--- Fold {fold_idx + 1}/{len(folds)}: "
            f"train={len(train_rows)} rows ({len(train_pairs)} pairs), "
            f"test={len(test_rows)} rows ---"
        )
        t0 = time.time()
        test_examples = C.v3_examples(test_rows)

        def epoch_eval(
            trained_model: Any, epoch: int, examples_ref=test_examples
        ) -> dict[str, Any]:
            """Score this fold's test set mid-training (per-epoch curve row)."""
            examples = [dict(e) for e in examples_ref]
            score_examples(trained_model, examples, batch_size=args.eval_batch_size)
            fold_labels = [e["label"] for e in examples]
            fold_scores_list = [e["score"] for e in examples]
            fold_threshold, _ = C.find_best_threshold(
                fold_labels, fold_scores_list, HIGHER_IS_MALICIOUS
            )
            fold_summary = C.summarize_v3(examples, fold_threshold, HIGHER_IS_MALICIOUS)
            return C.curve_point(epoch, fold_threshold, fold_summary)

        model, log_history, epoch_records = train_cross_encoder(
            train_pairs,
            epochs=args.epochs,
            batch_size=args.batch_size,
            learning_rate=args.lr,
            weight_decay=args.weight_decay,
            warmup_ratio=args.warmup,
            seed=args.seed + fold_idx,
            device=device,
            cpu=(device == "cpu"),
            max_length=args.max_length,
            output_dir=str(C.MODELS_DIR / f"_tmp_{MODEL_DIRNAME}_fold{fold_idx}"),
            precision=args.precision,
            epoch_eval=epoch_eval if args.eval_per_epoch else None,
        )
        train_time = time.time() - t0

        score_examples(model, test_examples, batch_size=args.eval_batch_size)
        labels = [e["label"] for e in test_examples]
        scores = [e["score"] for e in test_examples]
        threshold, thr_f1 = C.find_best_threshold(labels, scores, HIGHER_IS_MALICIOUS)
        summary = C.summarize_v3(test_examples, threshold, HIGHER_IS_MALICIOUS)

        # Per-epoch curve, seeded with epoch 0 = the untrained model on this fold.
        curve: list[dict[str, Any]] = []
        if baseline_folds and fold_idx < len(baseline_folds):
            base = baseline_folds[fold_idx]
            curve.append(C.curve_point(0, base["threshold"], base["summary"]))
        curve.extend(epoch_records)

        fold_records.append(
            {
                "fold": fold_idx,
                "train_rows": len(train_rows),
                "train_pairs": len(train_pairs),
                "test_rows": len(test_rows),
                "test_examples": len(test_examples),
                "threshold": threshold,
                "threshold_f1": thr_f1,
                "train_time_sec": round(train_time, 1),
                "summary": summary,
                "training_curve": curve,
                "train_log_history": log_history,
            }
        )
        fold_scores.append(test_examples)

        print(
            f"    TPR={summary['tpr']:.1f}%  FPR={summary['fpr']:.1f}%  "
            f"Precision={summary['precision']:.1f}%  F1={summary['f1']:.1f}%  "
            f"(thr={threshold:.3f}, {train_time:.0f}s)"
        )
        # dataset-v3 reports recall by stratum, not by the v2 policy split.
        _strata = summary["subsets"].get("by_stratum", {})
        if _strata:
            print(
                "    recall by stratum: "
                + "  ".join(
                    f"{name}={vals['tpr']:.1f}%" for name, vals in sorted(_strata.items())
                )
            )

        # Fold checkpoints are large (≈330 MB); only keep the metrics unless asked.
        if args.save_folds:
            fold_dir = C.MODELS_DIR / f"{MODEL_DIRNAME}-fold{fold_idx}"
            model.save(str(fold_dir))
            print(f"    saved fold checkpoint -> {fold_dir}")

    # ── Deployment threshold = mean of per-fold F1-optimal cut-offs ──
    final_threshold = float(np.mean([f["threshold"] for f in fold_records]))
    print(f"\n[threshold] mean across folds = {final_threshold:.4f}")

    # Re-score every fold at the single deployment threshold (fairer estimate).
    for record, examples in zip(fold_records, fold_scores):
        record["fixed_threshold_summary"] = C.summarize_v3(
            examples, final_threshold, HIGHER_IS_MALICIOUS
        )

    aggregate = C.aggregate_v3_summaries([f["summary"] for f in fold_records])
    aggregate_fixed = C.aggregate_v3_summaries(
        [f["fixed_threshold_summary"] for f in fold_records]
    )

    # ── Final model trained on ALL data ──
    final_model_info: dict[str, Any] = {}
    if args.train_final:
        print(f"\n[final] training on all {len(rows)} rows...")
        all_pairs = build_nli_pairs(rows)
        t0 = time.time()
        final_model, final_history, _ = train_cross_encoder(
            all_pairs,
            epochs=args.epochs,
            batch_size=args.batch_size,
            learning_rate=args.lr,
            weight_decay=args.weight_decay,
            warmup_ratio=args.warmup,
            seed=args.seed,
            device=device,
            cpu=(device == "cpu"),
            max_length=args.max_length,
            output_dir=str(C.MODELS_DIR / f"_tmp_{MODEL_DIRNAME}_final"),
            precision=args.precision,
        )
        model_dir = C.MODELS_DIR / MODEL_DIRNAME
        final_model.save(str(model_dir))
        final_model_info = {
            "dir": str(model_dir.relative_to(C.TRAINING_DIR)),
            "trained_on_rows": len(rows),
            "train_pairs": len(all_pairs),
            "train_time_sec": round(time.time() - t0, 1),
            "train_log_history": final_history,
        }
        print(f"    saved final model -> {model_dir}")
    else:
        print("\n[final] skipped (--no-train-final)")
    _cleanup_tmp()

    baseline_block: dict[str, Any] = {}
    if baseline_folds:
        baseline_threshold = float(np.mean([f["threshold"] for f in baseline_folds]))
        baseline_block = {
            "description": "off-the-shelf (pre-trained, un-fine-tuned) NLI baseline",
            "folds": baseline_folds,
            "aggregate": C.aggregate_v3_summaries([f["summary"] for f in baseline_folds]),
            "final_threshold": baseline_threshold,
        }

    results: dict[str, Any] = {
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "model": MODEL_DIRNAME,
        "role": "NLI cross-encoder (SentinelAgent P2 intent verifier)",
        "base": C.NLI_BASE,
        "labels": list(C.NLI_LABELS),
        "decision": "p_contradiction > threshold",
        "higher_score_means_malicious": HIGHER_IS_MALICIOUS,
        "compute": C.device_summary(),
        "dataset": {
            **C.v3_dataset_stats(rows),
            "path": str(Path(args.dataset).name),
            "limit_goals": args.limit_goals,
        },
        "config": config,
        "folds": fold_records,
        "aggregate": aggregate,
        "aggregate_fixed_threshold": aggregate_fixed,
        "aggregate_curve": C.aggregate_curve([f["training_curve"] for f in fold_records]),
        "final_threshold": final_threshold,
        "baseline": baseline_block,
        "final_model": final_model_info,
        "total_runtime_sec": round(time.time() - t_all, 1),
    }

    log_path = C.write_json(C.LOGS_DIR / "nli_cv_results.json", results)
    print(f"\n  full log -> {log_path}")

    if final_model_info:
        stats_path = C.write_json(
            C.MODELS_DIR / MODEL_DIRNAME / "training_stats.json", results
        )
        print(f"  model stats -> {stats_path}")

    _print_summary(results)
    return results


def _cleanup_tmp() -> None:
    """Remove temporary Trainer output dirs (``_tmp_*``)."""
    import shutil

    for path in C.MODELS_DIR.glob("_tmp_*"):
        shutil.rmtree(path, ignore_errors=True)


def _print_summary(results: dict[str, Any]) -> None:
    agg = results["aggregate"]["metrics"]
    subs = results["aggregate"]["subsets"]
    print("\n" + "=" * 74)
    print("5-FOLD CV SUMMARY - fine-tuned NLI (per-fold F1-optimal threshold)")
    print("=" * 74)
    for metric in ("tpr", "fpr", "precision", "f1", "accuracy"):
        print(f"  {metric:>10}: {agg[metric]['mean']:6.2f}% +/- {agg[metric]['std']:.2f}%")
    print(f"  {'threshold':>10}: {results['final_threshold']:.4f}")
    _print_curve(results)
    # dataset-v3 breaks recall down by STRATUM. The v2 `adversarial_paraphrases` /
    # `explicit_attacks` subset keys do not exist here and indexing them would raise
    # KeyError at the very end of a long run.
    _strata = subs.get("by_stratum", {})
    if _strata:
        parts = "  ".join(
            f"{name}={vals['tpr']['mean']:.2f}%" for name, vals in sorted(_strata.items())
        )
        print(f"  recall by stratum: {parts}")
    if results["baseline"]:
        base = results["baseline"]["aggregate"]["metrics"]
        print("\n  Baseline (off-the-shelf) for reference:")
        print(f"    TPR={base['tpr']['mean']:.2f}%  Precision={base['precision']['mean']:.2f}%"
              f"  F1={base['f1']['mean']:.2f}%")


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
    parser.add_argument("--limit-goals", type=int, default=None,
                        help="keep only the first N goals (smoke tests)")
    parser.add_argument("--folds", type=int, default=5)
    parser.add_argument("--fold-strategy", choices=("group", "stratified", "cue"),
                        default="group",
                        help="group = goal-grouped CV, unseen goals (primary, the "
                             "protocol dataset-v3 is built for); stratified = "
                             "label-stratified k-fold, what the reference fine-tune "
                             "script did; cue = the concept-disjoint split from "
                             "data/cue_split.csv (load that file with --dataset)")
    parser.add_argument("--epochs", type=int, default=4,
                        help="matched epoch budget, shared with train_contrastive.py")
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--eval-batch-size", type=int, default=64)
    parser.add_argument("--lr", type=float, default=2e-5)
    parser.add_argument("--weight-decay", type=float, default=0.01)
    parser.add_argument("--warmup", type=float, default=0.1,
                        help="warmup ratio of total steps")
    parser.add_argument("--max-length", type=int, default=None)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--device", default="auto",
                        help="auto | cpu | cuda (AMD ROCm exposes the GPU as cuda)")
    parser.add_argument("--gpu", type=int, default=0,
                        help="GPU index to pin (single-GPU; avoids DataParallel)")
    parser.add_argument("--precision", choices=("fp32", "fp16", "bf16"),
                        default="bf16", help="mixed precision for training")
    parser.add_argument("--save-folds", action="store_true",
                        help="also persist per-fold checkpoints (large)")
    parser.add_argument("--train-final", dest="train_final", action="store_true",
                        default=True)
    parser.add_argument("--no-train-final", dest="train_final", action="store_false")
    parser.add_argument("--eval-baseline", dest="eval_baseline", action="store_true",
                        default=True)
    parser.add_argument("--no-eval-baseline", dest="eval_baseline",
                        action="store_false")
    parser.add_argument("--eval-per-epoch", dest="eval_per_epoch",
                        action="store_true", default=True,
                        help="log test-fold metrics after every epoch")
    parser.add_argument("--no-eval-per-epoch", dest="eval_per_epoch",
                        action="store_false")
    return parser.parse_args(argv)


if __name__ == "__main__":
    run(parse_args())
