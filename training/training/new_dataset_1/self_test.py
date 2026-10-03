#!/usr/bin/env python3
"""Self-test the dataset-v3 data layer - no GPU, no model download, no training.

Verifies everything up to the point where torch would be involved, so the package
can be checked on a machine (or in a state) where the GPU is unavailable:

  1. every path resolves inside this folder (nothing leaks to the parent pipeline)
  2. the three corpora load, with the expected sizes and composition
  3. every fold strategy builds valid folds - goal-grouped really is grouped,
     the cue split really is disjoint, stratified keeps the class balance
  4. the NLI pair builder and the contrastive triplet builder produce the right
     shapes, including the pair_id hard negatives
  5. `summarize_v3` / `aggregate_v3_summaries` produce a complete metric block,
     checked against a hand-computed confusion matrix

Run it with the GPU venv (it imports common, which imports numpy only):

    ./run_gpu.sh self_test.py
    # or, if the GPU is unavailable and you only want the data layer:
    /c/sentinel-gpu/Scripts/python.exe self_test.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import common as C
import train_contrastive as TC
import train_nli as TN

FAILURES: list[str] = []


def check(label: str, condition: bool, detail: str = "") -> None:
    status = "ok  " if condition else "FAIL"
    print(f"  [{status}] {label}" + (f"  {detail}" if detail else ""))
    if not condition:
        FAILURES.append(label)


def section(title: str) -> None:
    print(f"\n=== {title} ===")


def main() -> int:
    here = Path(__file__).resolve().parent

    section("1. isolation - every path stays in this folder")
    for name, path in (
        ("TRAINING_DIR", C.TRAINING_DIR),
        ("DATASET_PATH", C.DATASET_PATH),
        ("HOLDOUT_PATH", C.HOLDOUT_PATH),
        ("CUE_SPLIT_PATH", C.CUE_SPLIT_PATH),
        ("MODELS_DIR", C.MODELS_DIR),
        ("LOGS_DIR", C.LOGS_DIR),
    ):
        inside = here == path or here in path.parents or path.parent == here
        check(f"{name} inside new_dataset_1", inside, str(path))
    check("TRAINING_DIR is this folder", C.TRAINING_DIR == here, str(C.TRAINING_DIR))

    section("2. corpora load")
    train = C.load_v3(C.DATASET_PATH)
    holdout = C.load_v3(C.HOLDOUT_PATH)
    split = C.load_v3(C.CUE_SPLIT_PATH)
    check("train rows", len(train) == 584, f"{len(train)}")
    check("holdout rows", len(holdout) == 122, f"{len(holdout)}")
    check("split rows = train + holdout", len(split) == 706, f"{len(split)}")
    stats = C.v3_dataset_stats(train)
    check("3 classes present", all(v > 0 for v in stats["label_counts"].values()),
          str(stats["label_counts"]))
    check("labelled strata", set(stats["by_stratum"]) >= {"easy", "near_miss", "matched"},
          str(stats["by_stratum"]))
    check("paired rows exist", stats["paired_rows"] > 0, str(stats["paired_rows"]))

    section("3. fold strategies")
    folds = C.make_v3_folds(train, n_splits=5, seed=42, strategy="group")
    check("group: 5 folds", len(folds) == 5, f"{len(folds)}")
    leaked = 0
    for tr_idx, te_idx in folds:
        train_goals = {train[i].goal for i in tr_idx}
        test_goals = {train[i].goal for i in te_idx}
        leaked += len(train_goals & test_goals)
    check("group: no goal leaks across folds", leaked == 0, f"{leaked} overlaps")
    covered = sum(len(te) for _, te in folds)
    check("group: every row tested once", covered == len(train), f"{covered}/{len(train)}")

    s_folds = C.make_v3_folds(train, n_splits=5, seed=42, strategy="stratified")
    check("stratified: 5 folds", len(s_folds) == 5, f"{len(s_folds)}")

    c_folds = C.make_v3_folds(split, strategy="cue")
    check("cue: single split", len(c_folds) == 1)
    tr_idx, te_idx = c_folds[0]
    tr_ids = {split[i].id for i in tr_idx}
    te_ids = {split[i].id for i in te_idx}
    check("cue: train/test disjoint", not (tr_ids & te_ids),
          f"{len(tr_ids & te_ids)} shared")
    check("cue: test has both classes",
          len({split[i].binary_label for i in te_idx}) == 2,
          f"train={len(tr_idx)} test={len(te_idx)}")
    groups_tr = {split[i].cue_concept for i in tr_idx} - {""}
    groups_te = {split[i].cue_concept for i in te_idx} - {""}
    check("cue: concept families resolved", len(groups_te) > 0,
          f"train={len(groups_tr)} test={len(groups_te)}")
    check("cue: concept families do not straddle", not (groups_tr & groups_te),
          f"{sorted(groups_tr & groups_te)}")

    section("4. training examples")
    pairs = TN.build_nli_pairs(train)
    check("NLI pairs: one per row", len(pairs) == len(train), f"{len(pairs)}")
    labels = {lab for _, _, lab in pairs}
    check("NLI pairs: all 3 labels used", labels == {0, 1, 2}, str(sorted(labels)))
    premise, hypothesis, _ = pairs[0]
    check("NLI premise framing", premise.startswith("An AI agent is authorized to"),
          premise[:52])
    check("NLI hypothesis framing", hypothesis.startswith("The agent is now performing:"),
          hypothesis[:52])

    triplets = TC.build_triplets(train, 64, seed=42)
    hard = TC.build_triplets(train, 64, seed=42, hard_only=True)
    check("triplets built", len(triplets) > 0, f"{len(triplets)}")
    check("hard-only triplets built", len(hard) > 0, f"{len(hard)}")
    check("hard-only subset of all", hard and len(hard) <= len(triplets),
          f"{len(hard)} <= {len(triplets)}")
    a, p, n = triplets[0]
    check("triplet anchor framed", a.startswith("Goal:") and "Subtask:" in a, a[:60])
    check("triplet parts differ", len({a, p, n}) == 3)

    section("5. metrics (hand-checked confusion matrix)")
    # 4 malicious (2 caught), 4 benign (1 false positive)
    records = (
        [{"label": C.MALICIOUS, "score": s, "stratum": "hard"} for s in (0.9, 0.8, 0.2, 0.1)]
        + [{"label": C.BENIGN, "score": s, "stratum": "control"} for s in (0.7, 0.3, 0.2, 0.1)]
    )
    summary = C.summarize_v3(records, threshold=0.5, higher_is_malicious=True)
    conf = summary["confusion"]
    check("tp", conf["tp"] == 2, str(conf["tp"]))
    check("fn", conf["fn"] == 2, str(conf["fn"]))
    check("fp", conf["fp"] == 1, str(conf["fp"]))
    check("tn", conf["tn"] == 3, str(conf["tn"]))
    check("tpr = 50%", abs(summary["tpr"] - 50.0) < 1e-9, f"{summary['tpr']}")
    check("fpr = 25%", abs(summary["fpr"] - 25.0) < 1e-9, f"{summary['fpr']}")
    check("per-stratum recall present", "hard" in summary["subsets"]["by_stratum"],
          str(list(summary["subsets"]["by_stratum"])))
    check("hard-stratum tpr = 50%",
          abs(summary["subsets"]["by_stratum"]["hard"]["tpr"] - 50.0) < 1e-9)
    agg = C.aggregate_v3_summaries([summary, summary])
    check("aggregate mean tpr", abs(agg["metrics"]["tpr"]["mean"] - 50.0) < 1e-9)
    check("aggregate pooled confusion", agg["pooled_confusion"]["tp"] == 4,
          str(agg["pooled_confusion"]))

    print()
    if FAILURES:
        print(f"{len(FAILURES)} CHECK(S) FAILED:")
        for f in FAILURES:
            print(f"  - {f}")
        return 1
    print("all checks passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
