#!/usr/bin/env python3
"""Bag-of-words control harness.

The audit (AUDIT_REPORT 3.1) measured AUC 0.950 for TF-IDF + logistic regression on
the frozen hard benchmark. That number is the corpus's **leak ceiling**: a model with
no syntax and no notion of purpose gets it for free, so a fine-tuned transformer can
only be credited with the margin above it.

This promotes that one-off measurement into a standing control:

* run it on any split (`--train` / `--test`), and
* report AUC plus TPR at fixed low FPR, alongside a style-only variant that carries
  no content words (so the source of any power is attributable).

Interpretation
--------------
    AUC ~ 0.50   concepts no longer predict the label; the split is genuinely hard
    AUC ~ 0.95   the corpus is still solving the task lexically; a neural gap is
                 not evidence of purpose modelling

Usage
-----
    # default: train on corpus_clean, test on the frozen holdout
    python lexical_baseline.py

    # after a concept-disjoint split exists
    python lexical_baseline.py --split-file data/corpus_v3/cue_split.csv
"""

from __future__ import annotations

import argparse
import csv
import re
import sys
from pathlib import Path

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score, roc_curve
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

HERE = Path(__file__).resolve().parent
OUT = HERE / "data" / "corpus_v3"


def read(paths: list[Path]) -> list[dict]:
    rows: list[dict] = []
    for p in paths:
        if p.exists():
            rows.extend(csv.DictReader(p.open(encoding="utf-8")))
    return rows


def style_features(text: str) -> list[float]:
    """Length / register only - no content words, so power here is pure style."""
    w = re.findall(r"[a-z']+", text.lower())
    n = max(1, len(w))
    return [len(w), float(np.mean([len(x) for x in w])), text.count(","),
            len(re.findall(r"\w+'s\b", text)) / n,
            len(re.findall(r"\w+(?:tion|ment|ance|ence|ing)\b", text.lower())) / n,
            len(re.findall(r"\b(the|and|of|for|with|to|on|in)\b", text.lower())) / n,
            sum(c.isdigit() for c in text) / n]


def tpr_at_fpr(y: np.ndarray, s: np.ndarray, targets=(0.0, 0.019, 0.05)) -> list[tuple[float, float]]:
    fpr, tpr, _ = roc_curve(y, s)
    out = []
    for t in targets:
        i = np.searchsorted(fpr, t, side="right") - 1
        out.append((t, float(tpr[max(i, 0)])))
    return out


def report(tag: str, y: np.ndarray, s: np.ndarray) -> float:
    auc = roc_auc_score(y, s)
    print(f"\n  {tag}: ROC-AUC {auc:.3f}   (n_pos={int(y.sum())}, n_neg={int((1-y).sum())})")
    for t, tp in tpr_at_fpr(y, s):
        print(f"      TPR at FPR {t*100:4.1f}%  ->  {tp*100:5.1f}%")
    return auc


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--train", default="", help="train file(s), comma separated")
    ap.add_argument("--test", default="", help="test file(s), comma separated")
    ap.add_argument("--split-file", default="",
                    help="a cue_split.csv: use its cue_split column instead of --train/--test")
    ap.add_argument("--min-df", type=int, default=2)
    args = ap.parse_args()

    if args.split_file:
        all_rows = read([Path(args.split_file)])
        tr = [r for r in all_rows if r.get("cue_split") == "train"]
        te = [r for r in all_rows if r.get("cue_split") == "test"]
        if not te:
            print(f"{args.split_file} has no test rows - run split_cue_disjoint.py first",
                  file=sys.stderr)
            return 1
        print(f"concept-disjoint split: train {len(tr)}, test {len(te)}")
    else:
        tr = read([Path(p) for p in (args.train.split(",") if args.train
                                     else [str(OUT / "corpus_clean.csv")])])
        te = read([Path(p) for p in (args.test.split(",") if args.test
                                     else [str(OUT / "holdout_clean_curated.csv")])])

    Xtr = [r["subtask"] for r in tr]
    ytr = np.array([1 if r["label"] == "0" else 0 for r in tr])
    Xte = [r["subtask"] for r in te]
    yte = np.array([1 if r["label"] == "0" else 0 for r in te])
    if yte.min() == yte.max():
        print("test set has only one class - cannot compute AUC", file=sys.stderr)
        return 1

    print(f"\n  train: {len(Xtr)} rows ({int(ytr.sum())} malicious)")
    print(f"  test : {len(Xte)} rows ({int(yte.sum())} malicious)")

    print("\n=== bag of words (TF-IDF 1-2grams + logistic regression) ===")
    clf = make_pipeline(TfidfVectorizer(ngram_range=(1, 2), min_df=args.min_df, sublinear_tf=True),
                        LogisticRegression(max_iter=2000, class_weight="balanced"))
    clf.fit(Xtr, ytr)
    s = clf.predict_proba(Xte)[:, 1]
    auc_bow = report("lexical", yte, s)

    print("\n=== style only (no content words) ===")
    clf2 = make_pipeline(StandardScaler(),
                         LogisticRegression(max_iter=2000, class_weight="balanced"))
    clf2.fit([style_features(t) for t in Xtr], ytr)
    auc_style = report("style-only", yte, clf2.predict_proba([style_features(t) for t in Xte])[:, 1])

    print("\n=== verdict ===")
    print(f"  lexical AUC {auc_bow:.3f}   style AUC {auc_style:.3f}")
    if auc_bow < 0.70:
        print("  Lexical power is low: the concepts no longer predict the label, so a")
        print("  neural model's margin here is attributable to the boundary, not the words.")
    else:
        print("  Lexical power is HIGH: a bag of words still separates the classes, so any")
        print("  architecture gap on this split is confounded with keyword matching.")
        print("  Report this number next to both models.")
    if auc_style > 0.70:
        print("  Style alone separates the classes - register is also leaking.")
    else:
        print("  Style carries no signal (expected: the audit found 0.504).")

    names = clf[0].get_feature_names_out()
    coef = clf[1].coef_[0]
    print("\n  top lexical indicators of 'malicious' (the blacklist, if any):")
    for i in np.argsort(-coef)[:10]:
        print(f"    {coef[i]:+.2f}  {names[i]!r}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
