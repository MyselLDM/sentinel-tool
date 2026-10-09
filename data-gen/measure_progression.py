#!/usr/bin/env python3
"""Corpus-progression measurement.

Reports, for each generation of the training corpus, the two numbers that explain why
the corpus was rebuilt:

* **rows / distinct opening verbs per goal** - how degenerate the construction is
  (fewer verbs per goal = the same pattern re-instantiated many times), and
* **lexical AUC** - what a TF-IDF bag of words scores under **goal-grouped 5-fold
  cross-validation** (the same control used throughout the audits). Anything near 1.0
  means the labels are recoverable from surface vocabulary, so a neural gap on that
  corpus is not evidence of purpose modelling.

The corpora, in order:

  1. the original DelegationBench v4 P2 set, extracted from the author's script
     (`old-training/sentinelagent_nli_finetune.py`, `TRAINING_DATA`);
  2. `dataset.csv` / `dataset_v2.csv` - the volume expansion of that set;
  3. `dataset-v3/corpus_clean.csv` - the purpose-based rebuild.

Usage
-----
    python measure_progression.py
    python measure_progression.py --folds 10
"""

from __future__ import annotations

import argparse
import ast
import csv
import pathlib
import re
import sys
from collections import Counter, defaultdict
from statistics import mean

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import StratifiedGroupKFold

ROOT = pathlib.Path(__file__).resolve().parent.parent
PRE = "An AI agent is authorized to {g}. The agent performs only tasks that support this goal."
HYP = "The agent is now performing: {s}"


def load_author_script() -> list[tuple[str, str, int]]:
    """Pull (goal, subtask, label) out of the author's fine-tuning script."""
    src = (ROOT / "training/old-training/sentinelagent_nli_finetune.py").read_text(encoding="utf-8")
    for node in ast.parse(src).body:
        if isinstance(node, ast.Assign) and getattr(node.targets[0], "id", "") == "TRAINING_DATA":
            return [(g, s, int(l)) for g, s, l in ast.literal_eval(node.value)]
    raise SystemExit("TRAINING_DATA not found in the author's script")


def lexical_cv(texts, labels, groups, folds: int, seed: int = 0) -> tuple[float, list[float]]:
    """Goal-grouped k-fold mean ROC-AUC for a TF-IDF + logistic-regression baseline."""
    aucs: list[float] = []
    splitter = StratifiedGroupKFold(n_splits=folds, shuffle=True, random_state=seed)
    for tr, te in splitter.split(texts, labels, groups):
        if len({labels[i] for i in te}) < 2:
            continue
        vec = TfidfVectorizer(ngram_range=(1, 2), sublinear_tf=True)
        Xtr = vec.fit_transform([texts[i] for i in tr])
        Xte = vec.transform([texts[i] for i in te])
        model = LogisticRegression(max_iter=2000).fit(Xtr, [labels[i] for i in tr])
        aucs.append(roc_auc_score([labels[i] for i in te], model.predict_proba(Xte)[:, 1]))
    return float(np.mean(aucs)), aucs


def verbs_per_group(pairs) -> float:
    """Distinct opening verbs per goal among the **benign** arm only.

    This is the degeneracy metric: a low number means the benign side is the same
    handful of verbs re-instantiated many times per goal.
    """
    by = defaultdict(set)
    for goal, subtask, label in pairs:
        if int(label) == 0:
            continue
        by[goal].add(subtask.split()[0].lower())
    return mean(len(v) for v in by.values())


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--folds", type=int, default=5)
    args = ap.parse_args()

    corpora: list[tuple[str, int, list[tuple[str, str, int]]]] = []

    corpora.append(("original DelegationBench v4 (author's script)", 190, load_author_script()))

    for name in ("dataset.csv", "dataset_v2.csv"):
        rows = list(csv.DictReader((ROOT / f"training/{name}").open(encoding="utf-8")))
        recs: list[tuple[str, str, int]] = []
        for r in rows:  # each row is a triplet: positive = benign, negative = malicious
            recs.append((r["anchor"], r["positive"], 1))
            recs.append((r["anchor"], r["negative"], 0))
        corpora.append((f"{name} (volume expansion)", len(rows), recs))

    rows = list(csv.DictReader((ROOT / "training/dataset-v3/corpus_clean.csv").open(encoding="utf-8")))
    corpora.append(("corpus v3 (purpose-based rebuild)", len(rows),
                    [(r["goal"], r["subtask"], int(r["label"])) for r in rows]))

    print(f"{'corpus':<44} {'rows':>7} {'examples':>9} {'benign verbs/goal':>18} {'lexical AUC':>12}")
    print("-" * 94)
    for name, nrows, recs in corpora:
        texts = [PRE.format(g=g) + " " + HYP.format(s=s) for g, s, _ in recs]
        labels = [0 if int(l) == 0 else 1 for _, _, l in recs]
        groups = [g for g, _, _ in recs]
        auc, per = lexical_cv(texts, labels, groups, args.folds)
        print(f"{name:<44} {nrows:>7} {len(recs):>9} {verbs_per_group(recs):>18.2f} {auc:>12.3f}")
        print(f"{'':<44} {'':>7} {'':>9} {'':>18}   per-fold {[round(x, 3) for x in per]}")

    # how much of the original survives into the rebuild
    orig = load_author_script()
    v3 = list(csv.DictReader((ROOT / "training/dataset-v3/corpus_clean.csv").open(encoding="utf-8")))
    tagged = [r for r in v3 if r.get("source") == "original_190"]
    norm = lambda s: re.sub(r"\s+", " ", s.strip().lower())  # noqa: E731
    kept = sum(1 for _, s, _ in orig if norm(s) in {norm(r["subtask"]) for r in tagged})
    print()
    print(f"original rows tagged source=original_190 in corpus v3 : {len(tagged)}")
    print(f"author-script subtasks preserved verbatim             : {kept} of {len(orig)}")

    # composition of the original set
    labels = Counter(l for _, _, l in orig)
    per_goal = Counter(g for g, _, _ in orig)
    print()
    print("original set composition")
    print(f"  goals                       : {len(per_goal)}")
    print(f"  examples per goal           : min {min(per_goal.values())} max {max(per_goal.values())} "
          f"mean {mean(per_goal.values()):.1f}")
    print(f"  labels (0 mal / 1 ent / 2 neu): {labels[0]} / {labels[1]} / {labels[2]}")


if __name__ == "__main__":
    main()
