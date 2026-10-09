"""Does a corpus carry what the thesis's declared analyses require?

Checks each generation of the corpus against the fields the study's own reporting needs
(per-stratum / per-source recall, paired benign-vs-violation counterexamples, a
concept-disjoint split, a measurable false-positive rate), plus the resolution of the
per-fold metrics and the counterexample gap.

Usage
-----
    python admissibility_check.py
"""

from __future__ import annotations

import ast
import csv
import pathlib
from collections import Counter

import numpy as np
from sklearn.model_selection import StratifiedGroupKFold

ROOT = pathlib.Path(__file__).resolve().parent.parent

# the vocabulary the lexical-baseline harness keeps flagging as "malicious"
CONCEPTS = [
    "social media", "sealed", "reviewer notes", "neighbourhood", "benchmark",
    "travel pattern", "biometric", "network", "external", "internal review",
]

# the analyses the thesis reports, and the field each one needs
DECLARED = [
    ("recall by stratum (easy / near_miss / matched)", "stratum"),
    ("provenance split (generated / original_190 / v3-matched)", "source"),
    ("paired benign-vs-violation counterexamples", "pair_id"),
    ("concept-disjoint evaluation split", "cue_concept"),
]


def load_original():
    src = (ROOT / "training/old-training/sentinelagent_nli_finetune.py").read_text(encoding="utf-8")
    for n in ast.parse(src).body:
        if isinstance(n, ast.Assign) and getattr(n.targets[0], "id", "") == "TRAINING_DATA":
            return [(g, s, int(l)) for g, s, l in ast.literal_eval(n.value)]
    raise SystemExit("TRAINING_DATA not found")


def load_csv(path):
    return list(csv.DictReader((ROOT / path).open(encoding="utf-8")))


def concept_gap(rows, subtask_key, label_key):
    """How many benign rows use a concept the violations reach for?"""
    mal = [r for r in rows if str(r[label_key]) == "0"]
    ben = [r for r in rows if str(r[label_key]) != "0"]
    hits = 0
    for t in CONCEPTS:
        m = sum(1 for r in mal if t in r[subtask_key].lower())
        b = sum(1 for r in ben if t in r[subtask_key].lower())
        hits += 1 if (m and not b) else 0
    return hits, len(CONCEPTS)


def resolution(recs, folds=5, seed=42):
    y = [0 if l == 0 else 1 for _, _, l in recs]
    groups = [g for g, _, _ in recs]
    skf = StratifiedGroupKFold(n_splits=folds, shuffle=True, random_state=seed)
    ben, mal = [], []
    for _, te in skf.split(recs, y, groups):
        c = Counter(y[i] for i in te)
        ben.append(c.get(1, 0))
        mal.append(c.get(0, 0))
    return min(ben), 100.0 / min(ben), min(mal), 100.0 / min(mal)


def main() -> None:
    orig = load_original()
    orig_rows = [{"goal": g, "subtask": s, "label": str(l)} for g, s, l in orig]
    v3 = load_csv("training/dataset-v3/corpus_clean.csv")
    hold = load_csv("training/dataset-v3/holdout_clean_curated.csv")

    corpora = [
        ("original DelegationBench v4 (script)", orig_rows, ["goal", "subtask", "label"]),
        ("dataset_v2.csv", load_csv("training/dataset_v2.csv"),
         list(load_csv("training/dataset_v2.csv")[0].keys())),
        ("corpus v3", v3, list(v3[0].keys())),
    ]

    print("=== fields available ===")
    for name, rows, cols in corpora:
        print(f"  {name:<40} {len(cols)} fields: {', '.join(cols)}")

    print("\n=== declared analyses -> can the corpus produce them? ===")
    for label, field in DECLARED:
        line = f"  {label:<52}"
        for name, rows, _ in corpora:
            if rows and field in rows[0]:
                filled = sum(1 for r in rows if str(r.get(field, "")).strip())
                line += f" | {name.split()[0]}: {filled}/{len(rows)}"
            else:
                line += f" | {name.split()[0]}: ABSENT"
        print(line)

    print("\n=== false-positive rate in the frozen holdout ===")
    for name, rows in (("original (no holdout shipped)", []), ("corpus v3 holdout", hold)):
        if not rows:
            print(f"  {name:<28} n/a - the script ships only the 190 training rows")
            continue
        c = Counter("malicious" if r["label"] == "0" else "benign" for r in rows)
        print(f"  {name:<28} n={len(rows)}  malicious={c['malicious']}  benign={c['benign']}")

    print("\n=== counterexample gap (concepts used by violations but never by benign rows) ===")
    h_o, n = concept_gap(orig_rows, "subtask", "label")
    print(f"  original DelegationBench v4 : {h_o}/{n} concepts are violation-only")
    h_v, n = concept_gap(v3, "subtask", "label")
    print(f"  corpus v3                   : {h_v}/{n} concepts are violation-only")

    print("\n=== per-fold metric resolution (smallest non-zero step, worst fold) ===")
    for name, recs in (("original DelegationBench v4", orig),
                       ("corpus v3", [(r["goal"], r["subtask"], int(r["label"])) for r in v3])):
        b, bq, m, mq = resolution(recs)
        print(f"  {name:<28} min benign/fold={b:3} -> FPR step {bq:4.2f} pts | "
              f"min malicious/fold={m:3} -> TPR step {mq:4.2f} pts")


if __name__ == "__main__":
    main()
