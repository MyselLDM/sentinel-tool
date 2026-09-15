# ─────────────────────────────────────────────────────────────
# Default training hyperparameters (overridable via CLI)
# ─────────────────────────────────────────────────────────────

MODEL_NAME = "all-MiniLM-L12-v2"  # Sentence-Transformer bi-encoder
BATCH_SIZE = 16  # per-device training batch size
EPOCHS = 4  # fewer epochs to reduce memorisation risk
VAL_SPLIT = 0.20  # larger validation hold-out for better overfitting signal
EVAL_STEPS = 0  # steps between validation checks (0 = once per epoch)
LEARNING_RATE = 1e-5  # lower LR for gentler fine-tuning
WARMUP_STEPS = 0.2  # slightly longer warmup
K_FOLDS = 5  # number of CV folds
RANDOM_SEED = 42  # reproducibility seed (match NLI)
LOG_DIR = "logs"  # directory for JSON logs and summaries
MODEL_BASE_DIR = ".models"  # directory for saved model checkpoints
USE_DECOMPOSED = True  # True = framed-augmentation template
# False = pure raw-text contrastiveness
MAX_NEGATIVES_PER_GOAL = 6  # tighter cap → fewer triplets → less memorisation
# original malicious always kept; LLM negatives sampled


def get_model_dirname():
    """Build a dynamic model directory name from the current hyperparameters.

    Returns a string like:
        contrastive-miniLM-e4-b16-lr1e-05-mn6-dec-vs0.2
    """
    dec_str = "dec" if USE_DECOMPOSED else "raw"
    return (
        f"contrastive-miniLM"
        f"-e{EPOCHS}"
        f"-b{BATCH_SIZE}"
        f"-lr{LEARNING_RATE}"
        f"-mn{MAX_NEGATIVES_PER_GOAL}"
        f"-{dec_str}"
        f"-vs{VAL_SPLIT}"
    )


# ─────────────────────────────────────────────────────────────
# Imports
# ─────────────────────────────────────────────────────────────

import json, time, os, sys, warnings
import numpy as np

warnings.filterwarnings("ignore")

# Point at project root so 'data' and 'sentinel-agent' are importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

# Load original training data (3-tuples) and wrap into 4-tuples with empty decomposed dict
from data.nli_finetune import RAW_TRAINING_DATA as NLI_DATA

GOALS = sorted(set(goal for goal, _, _ in NLI_DATA))

TRAINING_DATA = []
for goal, subtask, label in NLI_DATA:
    TRAINING_DATA.append((goal, subtask, label, {}))  # empty decomposed dict

print(f"  Loaded {len(TRAINING_DATA)} examples from data/nli_finetune.py")

# ── LLM-generated adversarial paraphrases (loaded if available) ──
# Format expected by build_triplets: list of dicts with 'anchor' and 'negative' keys
PROJECT_ROOT = os.path.join(os.path.dirname(__file__), "..", "..")
PARAPHRASES = []  # fallback
try:
    from data.contrastive_paraphrases import PARAPHRASES as LLM_NEGATIVES

    PARAPHRASES = list(LLM_NEGATIVES)
    print(f"  Loaded {len(PARAPHRASES)} LLM-generated paraphrases from .py module")
except ImportError:
    # Try JSON fallback at project root (same data, JSON format)
    _json_path = os.path.join(PROJECT_ROOT, "data", "contrastive_paraphrases.json")
    if os.path.exists(_json_path):
        try:
            with open(_json_path, "r", encoding="utf-8") as _f:
                PARAPHRASES = json.load(_f)
        except (UnicodeDecodeError, json.JSONDecodeError):
            # File may be cp1252-encoded (Windows)
            with open(_json_path, "r", encoding="cp1252") as _f:
                PARAPHRASES = json.load(_f)
        print(f"  Loaded {len(PARAPHRASES)} LLM-generated paraphrases from JSON")
    else:
        print(
            "  WARNING: No contrastive_paraphrases.py or .json found"
            " -- using only original 60 negatives"
        )
        print(
            "    Run prompt.py first to generate LLM negatives for more training variety."
        )


# ============================================================
# Framed Augmentation Template
# ============================================================
# Converts a (goal/subtask, decomposed_tuple) pair into a single
# text string that MiniLM can embed.  The raw text is preserved
# first, followed by explicit component labels.
# This is the bridge between DeBERTa/spaCy output and MiniLM input.
#
# Set USE_DECOMPOSED=False to skip the label half (raw-text ablation).


def format_document(
    goal: str, subtask: str, decomposed: dict, include_decomposed: bool = True
):
    """Build a framed-augmentation string for MiniLM embedding.

    Args:
        goal:       root delegation goal (e.g. "Process disability benefits")
        subtask:    the delegation instruction (e.g. "Retrieve medical records")
        decomposed: dict with keys {action, object, scope, constraints}
                    — values are strings or None
        include_decomposed: when False, returns raw text only (ablation mode)

    Returns:
        A single string suitable for SentenceTransformer.encode().
    """
    text = f"Goal: {goal}. Subtask: {subtask}."

    if include_decomposed and decomposed:
        parts = []
        for key in ("action", "object", "scope", "constraints"):
            val = decomposed.get(key)
            if val:
                # Natural-language templates for each component
                if key == "action":
                    parts.append(f"The performed action is {val}.")
                elif key == "object":
                    parts.append(f"The target object is {val}.")
                elif key == "scope":
                    parts.append(f"The authorization scope is {val}.")
                elif key == "constraints":
                    parts.append(f"The applicable constraints are {val}.")

        if parts:
            text += " " + " ".join(parts)

    return text


# ============================================================
# Triplet Construction
# ============================================================
# Groups entries by goal, then builds (anchor, pos, neg) triplets.
# Each anchor is a goal text.  Positives are subtasks labelled 1 or 2
# under the same goal.  Negatives are subtasks labelled 0 under the
# same goal.


def build_triplets(data: list, goals: list, include_decomposed: bool = True) -> list:
    """Convert TRAINING_DATA + LLM paraphrases into contrastive triplets.

    Merges two negative sources:
      1. Original label=0 entries (~60 malicious subtasks, ground truth)
      2. LLM-generated paraphrases from prompt.py (~260 scope-expanding variants)

    Returns: list of dicts:
        {"anchor": str, "positive": str, "negative": str, "negative_source": str}
    """
    from collections import defaultdict

    by_goal = defaultdict(lambda: {"pos": [], "neg": []})

    # ── Positives: all benign entries (label 1 or 2) ──
    for goal, subtask, label, decomposed in data:
        if label != 0:
            subtask_text = format_document(
                goal, subtask, decomposed, include_decomposed
            )
            by_goal[goal]["pos"].append(subtask_text)

    # ── Negatives source 1: original malicious entries ──
    for goal, subtask, label, decomposed in data:
        if label == 0:
            subtask_text = format_document(
                goal, subtask, decomposed, include_decomposed
            )
            by_goal[goal]["neg"].append((subtask_text, "original"))

    # ── Negatives source 2: LLM-generated paraphrases (if available) ──
    for p in PARAPHRASES:
        goal = p["anchor"]
        neg_text = p["negative"]
        if include_decomposed:
            neg_text = format_document(
                p["anchor"], p["negative"], {}, include_decomposed
            )
        by_goal[goal]["neg"].append((neg_text, "llm"))

    # ── Sample negatives per goal to bound the pos×neg explosion ──
    # Original malicious entries are always kept (they're ground truth);
    # LLM paraphrases are randomly sampled to fill the remaining budget.
    import random

    total_before, total_after = 0, 0
    for goal in goals:
        negs = by_goal[goal]["neg"]
        total_before += len(negs)
        if len(negs) > MAX_NEGATIVES_PER_GOAL:
            originals = [n for n in negs if n[1] == "original"]
            llms = [n for n in negs if n[1] == "llm"]
            random.shuffle(llms)
            slots = MAX_NEGATIVES_PER_GOAL - len(originals)
            by_goal[goal]["neg"] = originals + llms[: max(0, slots)]
        total_after += len(by_goal[goal]["neg"])

    if total_before > total_after:
        print(
            f"  Negatives sampled: {total_before} → {total_after} "
            f"(max {MAX_NEGATIVES_PER_GOAL}/goal)"
        )

    # ── Build triplets ──
    triplets = []
    for goal in goals:
        entries = by_goal[goal]
        if not entries["pos"] or not entries["neg"]:
            continue

        anchor = format_document(goal, goal, {}, include_decomposed)
        for pos in entries["pos"]:
            for neg_text, neg_source in entries["neg"]:
                triplets.append({
                    "anchor": anchor,
                    "positive": pos,
                    "negative": neg_text,
                    "negative_source": neg_source,
                })

    return triplets


# ============================================================
# Contrastive Model Training (Single Fold)
# ============================================================


def train_single_fold(
    train_triplets: list, fold_num: int = 0, seed: int = 42, val_triplets: list = None
):
    """Train a MiniLM bi-encoder on contrastive triplets.

    Uses TripletLoss with cosine distance: for each (anchor, positive, negative)
    triplet, the positive is pulled closer while the negative is pushed away.
    If val_triplets is provided, a TripletEvaluator monitors validation loss
    each epoch to detect overfitting; the best checkpoint is saved.
    """
    import torch
    from sentence_transformers import SentenceTransformer, losses, InputExample
    from sentence_transformers.sentence_transformer.evaluation import TripletEvaluator
    from torch.utils.data import DataLoader

    # Per-fold seed for independent initialisation (matches nli_testTrain.py)
    torch.manual_seed(seed)
    np.random.seed(seed)

    # Load base model
    model = SentenceTransformer(MODEL_NAME)

    # Convert triplet dicts → InputExample objects
    train_examples = [
        InputExample(texts=[t["anchor"], t["positive"], t["negative"]])
        for t in train_triplets
    ]

    train_dataloader = DataLoader(
        train_examples,
        shuffle=True,
        batch_size=BATCH_SIZE,
    )

    train_loss = losses.TripletLoss(
        model,
        distance_metric=losses.TripletDistanceMetric.COSINE,
    )

    # ── Validation evaluator (anti-overfitting) ──
    evaluator = None
    eval_steps = EVAL_STEPS if EVAL_STEPS > 0 else len(train_dataloader)
    if val_triplets:
        val_anchors = [t["anchor"] for t in val_triplets]
        val_positives = [t["positive"] for t in val_triplets]
        val_negatives = [t["negative"] for t in val_triplets]
        evaluator = TripletEvaluator(
            anchors=val_anchors,
            positives=val_positives,
            negatives=val_negatives,
            name="val",
            show_progress_bar=False,
        )
        print(f"  Validation triplets: {len(val_triplets)}")

    print(
        f"  Training for {EPOCHS} epochs on {len(train_triplets)} triplets "
        f"({len(train_dataloader)} batches/epoch, seed={seed})..."
    )

    # Fit
    model.fit(
        train_objectives=[(train_dataloader, train_loss)],
        epochs=EPOCHS,
        warmup_steps=int(WARMUP_STEPS * len(train_dataloader)),
        optimizer_params={"lr": LEARNING_RATE, "weight_decay": 0.01},
        evaluator=evaluator,
        evaluation_steps=eval_steps,
        output_path=f"{MODEL_BASE_DIR}/{get_model_dirname()}/fold_{fold_num}",
        save_best_model=(evaluator is not None),
        show_progress_bar=True,
    )

    return model


# ============================================================
# Cosine-Similarity Evaluation
# ============================================================
# Mirror the metric structure of evaluate_model() in
# sentinel-agent/sentinelagent_nli_finetune.py so that
# per-fold results are directly comparable (TPR, FPR, F1, etc.)


def evaluate_contrastive(
    model, test_data: list, include_decomposed: bool = True, threshold: float = None
) -> dict:
    """Evaluate contrastive model on test (goal, subtask, label, decomposed) pairs.

    Computes cosine similarity between goal embedding and subtask embedding.
    If threshold is None, finds the optimal threshold that maximizes F1
    on this test set (note: in CV this uses test-fold labels — acceptable
    for within-fold calibration).
    """
    # Embed all unique goal texts
    goal_texts = {}
    goal_embs = {}
    for goal, subtask, label, decomposed in test_data:
        if goal not in goal_texts:
            goal_text = format_document(goal, goal, decomposed, include_decomposed)
            goal_texts[goal] = goal_text
            goal_embs[goal] = model.encode(goal_text, normalize_embeddings=True)

    # Compute cosine similarities
    y_true = []  # 1 = malicious (label 0), 0 = benign (label 1 or 2)
    y_scores = []  # cosine similarity (higher = more similar → more benign)

    for goal, subtask, label, decomposed in test_data:
        sub_text = format_document(goal, subtask, decomposed, include_decomposed)
        sub_emb = model.encode(sub_text, normalize_embeddings=True)
        cos_sim = float(np.dot(goal_embs[goal], sub_emb))
        y_true.append(1 if label == 0 else 0)
        y_scores.append(cos_sim)

    # If no threshold provided, find the one that maximizes F1
    if threshold is None:
        best_f1, best_thresh = 0, 0.5
        for thresh in np.linspace(0.0, 1.0, 201):
            preds = [1 if s < thresh else 0 for s in y_scores]  # low sim = malicious
            tp = sum(1 for t, p in zip(y_true, preds) if t == 1 and p == 1)
            fp = sum(1 for t, p in zip(y_true, preds) if t == 0 and p == 1)
            fn = sum(1 for t, p in zip(y_true, preds) if t == 1 and p == 0)
            tn = sum(1 for t, p in zip(y_true, preds) if t == 0 and p == 0)

            prec = tp / (tp + fp) if (tp + fp) > 0 else 0
            rec = tp / (tp + fn) if (tp + fn) > 0 else 0
            f1 = 2 * prec * rec / (prec + rec) if (prec + rec) > 0 else 0

            if f1 > best_f1:
                best_f1 = f1
                best_thresh = thresh
        threshold = best_thresh

    # Classify using threshold
    y_pred = [1 if s < threshold else 0 for s in y_scores]
    tp = sum(1 for t, p in zip(y_true, y_pred) if t == 1 and p == 1)
    fp = sum(1 for t, p in zip(y_true, y_pred) if t == 0 and p == 1)
    fn = sum(1 for t, p in zip(y_true, y_pred) if t == 1 and p == 0)
    tn = sum(1 for t, p in zip(y_true, y_pred) if t == 0 and p == 0)
    total = len(y_true)
    correct = tp + tn

    accuracy = correct / total * 100 if total > 0 else 0
    tpr = tp / (tp + fn) * 100 if (tp + fn) > 0 else 0  # recall on malicious
    fpr = fp / (fp + tn) * 100 if (fp + tn) > 0 else 0  # false positives on benign
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
    }


# ============================================================
# 5-Fold Stratified Cross-Validation
# ============================================================


def _split_train_val(train_data: list, val_split: float, seed: int = 42):
    """Stratified split of train_data into train / val subsets.

    Preserves label proportions within each goal so that val triplets
    are representative of the same goals as train triplets.
    """
    if val_split <= 0 or len(train_data) < 4:
        return train_data, []

    np.random.seed(seed)
    train_out, val_out = [], []
    # Group by label for stratified sampling
    by_label = {0: [], 1: [], 2: []}
    for item in train_data:
        by_label[item[2]].append(item)

    for label, items in by_label.items():
        n_val = max(1, int(len(items) * val_split))
        idxs = np.random.permutation(len(items))
        val_out.extend([items[i] for i in idxs[:n_val]])
        train_out.extend([items[i] for i in idxs[n_val:]])

    np.random.seed(None)  # reset to system entropy
    return train_out, val_out


def run_contrastive_cv():
    """Main entry point — 5-fold stratified cross-validation."""
    print("=" * 70)
    print("CONTRASTIVE BI-ENCODER FINE-TUNING")
    print(f"Model: {MODEL_NAME}")
    print(f"Decomposed: {USE_DECOMPOSED}")
    print("=" * 70)

    # ── Data summary ──
    print(f"\nTotal examples: {len(TRAINING_DATA)}")
    label_counts = {0: 0, 1: 0, 2: 0}
    for _, _, label, _ in TRAINING_DATA:
        label_counts[label] += 1
    print(f"  Contradiction (malicious): {label_counts[0]}")
    print(f"  Entailment (benign):       {label_counts[1]}")
    print(f"  Neutral (benign):          {label_counts[2]}")

    # ── Stratify by label ──
    indices_by_label = {0: [], 1: [], 2: []}
    for i, (_, _, label, _) in enumerate(TRAINING_DATA):
        indices_by_label[label].append(i)

    np.random.seed(RANDOM_SEED)
    for label in indices_by_label:
        np.random.shuffle(indices_by_label[label])

    K = K_FOLDS
    fold_results = []
    t_total = time.time()

    for fold in range(K):
        # Build train/test split per label stratum
        test_indices = []
        train_indices = []
        for label in [0, 1, 2]:
            idxs = indices_by_label[label]
            n = len(idxs)
            fold_size = n // K
            start = fold * fold_size
            end = start + fold_size if fold < K - 1 else n
            test_indices.extend(idxs[start:end])
            train_indices.extend(idxs[:start] + idxs[end:])

        train_data = [TRAINING_DATA[i] for i in train_indices]
        test_data = [TRAINING_DATA[i] for i in test_indices]

        print(
            f"\n--- Fold {fold + 1}/{K}: train={len(train_data)}, "
            f"test={len(test_data)} ---"
        )

        # ── Hold out VAL_SPLIT fraction of train for validation ──
        val_data = []
        if VAL_SPLIT > 0:
            train_data, val_data = _split_train_val(
                train_data, VAL_SPLIT, seed=RANDOM_SEED + fold
            )

        # Build triplets from TRAIN split only
        train_triplets = build_triplets(
            train_data, GOALS, include_decomposed=USE_DECOMPOSED
        )
        val_triplets = (
            build_triplets(val_data, GOALS, include_decomposed=USE_DECOMPOSED)
            if val_data
            else None
        )
        print(
            f"  Training triplets: {len(train_triplets)}"
            + (f"  |  Validation triplets: {len(val_triplets)}" if val_triplets else "")
        )

        # Train
        t0 = time.time()
        model = train_single_fold(
            train_triplets,
            fold_num=fold,
            seed=RANDOM_SEED + fold,
            val_triplets=val_triplets,
        )
        train_time = time.time() - t0

        # Evaluate on test split
        results = evaluate_contrastive(
            model, test_data, include_decomposed=USE_DECOMPOSED
        )

        print(f"  Accuracy:      {results['accuracy']:.1f}%")
        print(
            f"  Malicious TPR: {results['tpr']:.1f}% "
            f"({results['tp']}/{results['tp'] + results['fn']})"
        )
        print(
            f"  Benign FPR:    {results['fpr']:.1f}% "
            f"({results['fp']}/{results['fp'] + results['tn']})"
        )
        print(f"  Malicious F1:  {results['f1']:.1f}%")
        print(f"  Precision:     {results['precision']:.1f}%")
        print(f"  Threshold:     {results['threshold']:.3f}")
        print(f"  Train time:    {train_time:.1f}s")

        fold_results.append(results)

    # ── Aggregate across folds ──
    metrics = ["accuracy", "tpr", "fpr", "precision", "f1"]
    print(f"\n{'=' * 70}")
    print(f"5-FOLD CROSS-VALIDATION SUMMARY")
    print(f"{'=' * 70}")
    for m in metrics:
        vals = [r[m] for r in fold_results]
        print(f"  {m:>12}:  {np.mean(vals):.1f}% ± {np.std(vals):.1f}%")

    # Aggregate confusion matrix
    total_tp = sum(r["tp"] for r in fold_results)
    total_fp = sum(r["fp"] for r in fold_results)
    total_fn = sum(r["fn"] for r in fold_results)
    total_tn = sum(r["tn"] for r in fold_results)
    print(f"\n  Aggregate confusion matrix (all folds):")
    print(f"    TP={total_tp:>4}  FP={total_fp:>4}")
    print(f"    FN={total_fn:>4}  TN={total_tn:>4}")
    agg_tpr = total_tp / (total_tp + total_fn) * 100 if (total_tp + total_fn) else 0
    agg_fpr = total_fp / (total_fp + total_tn) * 100 if (total_fp + total_tn) else 0
    print(f"    Aggregate TPR: {agg_tpr:.1f}%")
    print(f"    Aggregate FPR: {agg_fpr:.1f}%")

    print(f"\n  Total time: {time.time() - t_total:.1f}s")

    # ── Print negative source breakdown ──
    print(f"\n  Negative sources used:")
    print(f"    Original malicious:    ~60")
    print(f"    LLM-generated paraphrases: {len(PARAPHRASES)}")

    # ── Save per-fold results (same schema as nli_testTrain.py) ──
    os.makedirs(LOG_DIR, exist_ok=True)

    # Compute aggregate
    metrics = ["accuracy", "tpr", "fpr", "precision", "f1"]
    aggregate = {}
    for m in metrics:
        vals = [r[m] for r in fold_results]
        aggregate[m] = {"mean": float(np.mean(vals)), "std": float(np.std(vals))}

    # Convert numpy types
    folds_serialized = []
    for r in fold_results:
        folds_serialized.append({
            k: (float(v) if isinstance(v, (np.floating, np.integer)) else v)
            for k, v in r.items()
        })

    cv_output = {
        "model": f"contrastive-{MODEL_NAME}",
        "decomposed": USE_DECOMPOSED,
        "folds": folds_serialized,
        "aggregate": aggregate,
        "confusion_matrix": {
            "tp": total_tp,
            "fp": total_fp,
            "fn": total_fn,
            "tn": total_tn,
            "tpr": round(agg_tpr, 2),
            "fpr": round(agg_fpr, 2),
        },
        "total_runtime_sec": round(time.time() - t_total, 1),
        "llm_paraphrases_used": len(PARAPHRASES),
    }

    result_path = f"{LOG_DIR}/contrastive_cv_results.json"
    with open(result_path, "w") as f:
        json.dump(cv_output, f, indent=2)
    print(f"\n  Per-fold results saved to {result_path}")

    # Also save a human-readable summary alongside the JSON
    summary_path = f"{LOG_DIR}/contrastive_cv_summary.txt"
    with open(summary_path, "w") as f:
        f.write("RAW CONTRASTIVENESS — 5-FOLD CV SUMMARY\n")
        f.write("=" * 60 + "\n\n")
        for m in metrics:
            vals = [r[m] for r in fold_results]
            f.write(f"  {m:>12}:  {np.mean(vals):.1f}% ± {np.std(vals):.1f}%\n")
        f.write(f"\n  Aggregate confusion matrix:\n")
        f.write(f"    TP={total_tp:>4}  FP={total_fp:>4}\n")
        f.write(f"    FN={total_fn:>4}  TN={total_tn:>4}\n")
        f.write(f"    TPR: {agg_tpr:.1f}%  FPR: {agg_fpr:.1f}%\n")
    print(f"  Human-readable summary saved to {summary_path}")

    # --- Train final model on ALL data and save ---
    print(f"\n{'=' * 70}")
    print("TRAINING FINAL MODEL ON ALL DATA")
    print(f"{'=' * 70}")

    all_triplets = build_triplets(
        TRAINING_DATA, GOALS, include_decomposed=USE_DECOMPOSED
    )
    print(f"  Training on all {len(TRAINING_DATA)} examples ({len(all_triplets)} triplets)...")

    import torch
    from sentence_transformers import SentenceTransformer, losses, InputExample
    from torch.utils.data import DataLoader

    torch.manual_seed(RANDOM_SEED)
    np.random.seed(RANDOM_SEED)

    final_model = SentenceTransformer(MODEL_NAME)
    train_examples = [
        InputExample(texts=[t["anchor"], t["positive"], t["negative"]])
        for t in all_triplets
    ]
    train_dataloader = DataLoader(
        train_examples, shuffle=True, batch_size=BATCH_SIZE
    )
    train_loss = losses.TripletLoss(
        final_model, distance_metric=losses.TripletDistanceMetric.COSINE
    )

    final_output_dir = f"{MODEL_BASE_DIR}/{get_model_dirname()}"
    final_model.fit(
        train_objectives=[(train_dataloader, train_loss)],
        epochs=EPOCHS,
        warmup_steps=int(WARMUP_STEPS * len(train_dataloader)),
        optimizer_params={"lr": LEARNING_RATE, "weight_decay": 0.01},
        output_path=final_output_dir,
        save_best_model=False,
        show_progress_bar=True,
    )
    print(f"  Final model saved to {final_output_dir}/")

    # Sanity check on training data
    final_results = evaluate_contrastive(
        final_model, TRAINING_DATA, include_decomposed=USE_DECOMPOSED
    )
    print(
        f"  Final model on training data: "
        f"TPR={final_results['tpr']:.1f}%  FPR={final_results['fpr']:.1f}%  "
        f"F1={final_results['f1']:.1f}%"
    )

    return fold_results


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(
        description="Contrastive bi-encoder fine-tuning with 5-fold CV"
    )
    parser.add_argument("--model-name", default=MODEL_NAME)
    parser.add_argument("--batch-size", type=int, default=BATCH_SIZE)
    parser.add_argument("--epochs", type=int, default=EPOCHS)
    parser.add_argument("--val-split", type=float, default=VAL_SPLIT)
    parser.add_argument("--eval-steps", type=int, default=EVAL_STEPS)
    parser.add_argument("--learning-rate", type=float, default=LEARNING_RATE)
    parser.add_argument("--warmup-steps", type=float, default=WARMUP_STEPS)
    parser.add_argument("--k-folds", type=int, default=K_FOLDS)
    parser.add_argument("--random-seed", type=int, default=RANDOM_SEED)
    parser.add_argument("--log-dir", default=LOG_DIR)
    parser.add_argument("--model-base-dir", default=MODEL_BASE_DIR)
    parser.add_argument(
        "--use-decomposed",
        type=lambda x: x.lower() in ("true", "1", "yes"),
        default=USE_DECOMPOSED,
    )
    parser.add_argument(
        "--max-negatives-per-goal", type=int, default=MAX_NEGATIVES_PER_GOAL
    )

    a = parser.parse_args()

    # Override module-level globals from CLI
    MODEL_NAME = a.model_name
    BATCH_SIZE = a.batch_size
    EPOCHS = a.epochs
    VAL_SPLIT = a.val_split
    EVAL_STEPS = a.eval_steps
    LEARNING_RATE = a.learning_rate
    WARMUP_STEPS = a.warmup_steps
    K_FOLDS = a.k_folds
    RANDOM_SEED = a.random_seed
    LOG_DIR = a.log_dir
    MODEL_BASE_DIR = a.model_base_dir
    USE_DECOMPOSED = a.use_decomposed
    MAX_NEGATIVES_PER_GOAL = a.max_negatives_per_goal

    run_contrastive_cv()
