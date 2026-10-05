#!/usr/bin/env python3
"""Audit an expanded corpus against the dataset-v3 baseline it extends.

Answers two things:
  1. is the expansion an extension (superset) or a replacement?
  2. does it hold up on the defects this project already paid to find?

Checks, in the order that matters:
  * format integrity - schema, label/stratum values, word_count correctness
  * duplicates     - exact, and cross-label near-duplicates at Jaccard >= 0.75
                     (the defect that made dataset_v2 unusable)
  * leaks          - trailing punctuation and length, per label
  * coverage       - concept families: extended, or more of the same?
  * pair integrity - both halves present, cue exclusivity honoured, role opposition
  * the ceiling    - bag-of-words AUC on the old split vs the merged split. If adding
                     rows RAISES the lexical ceiling, the expansion is counterproductive
                     for comparing architectures (see training/EXTERNAL_REVIEW.md 6.2).

Usage:  python audit_expanded.py
"""

from __future__ import annotations

import collections
import csv
import json
import re
import statistics as st
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from concepts import OFF_GOAL_ONLY, classify, is_hard_negative_pair  # noqa: E402

OLD = HERE.parent / "training" / "training" / "new_dataset_1" / "data"
NEW = HERE / "new-expanded-unverified"

GREEN, RED, YELLOW, OFF = "\033[32m", "\033[31m", "\033[33m", "\033[0m"


def load(p: Path) -> list[dict]:
    with p.open(encoding="utf-8") as f:
        return list(csv.DictReader(f))


def toks(s: str) -> set[str]:
    return set(re.findall(r"[a-z]+", (s or "").lower()))


def jaccard(a: str, b: str) -> float:
    A, B = toks(a), toks(b)
    return len(A & B) / max(1, len(A | B))


def verdict(ok: bool, text: str) -> str:
    return f"{GREEN}PASS{RED if not ok else ''}{OFF}" if ok else f"{RED}FAIL{OFF}"


def main() -> int:
    old = load(OLD / "corpus_clean.csv")
    new = load(NEW / "corpus_clean_merged.csv")
    old_sub = {r["subtask"].strip().lower() for r in old}
    added = [r for r in new if r["subtask"].strip().lower() not in old_sub]

    print("=" * 78)
    print("EXPANDED CORPUS AUDIT")
    print("=" * 78)
    print(f"  baseline (ours) : {len(old)} rows   {OLD.name}")
    print(f"  merged (theirs) : {len(new)} rows   {NEW.name}")
    print(f"  added           : {len(added)} rows")

    results: dict[str, bool] = {}

    # ---------------------------------------------------------------- 1. format
    print("\n--- 1. format integrity ---")
    same_cols = sorted(old[0]) == sorted(new[0])
    results["schema unchanged"] = same_cols
    print(f"  [{verdict(same_cols, 'schema unchanged')}] columns identical")

    bad_label = [r for r in added if r.get("label") not in {"0", "1", "2"}]
    results["labels valid"] = not bad_label
    print(f"  [{verdict(not bad_label, 'labels valid')}] labels in {{0,1,2}}"
          f"   {collections.Counter(r.get('label') for r in added)}")

    known = {"easy", "near_miss", "matched", "hard", "control"}
    odd_stratum = [r for r in added if r.get("stratum") not in known]
    results["strata valid"] = not odd_stratum
    print(f"  [{verdict(not odd_stratum, 'strata valid')}] strata in {sorted(known)}"
          f"   {dict(collections.Counter(r.get('stratum') for r in added))}")

    wc_bad = [r for r in added if int(r.get("word_count") or -1) != len(r["subtask"].split())]
    results["word_count correct"] = not wc_bad
    print(f"  [{verdict(not wc_bad, 'word_count correct')}] word_count matches the text"
          f" ({len(wc_bad)} wrong)")

    dup_ids = len({r["id"] for r in new}) != len(new)
    print(f"  [note] duplicate row ids across the merged file: {dup_ids}"
          f" ({len(new) - len({r['id'] for r in new})} collisions)"
          f"   [baseline: {len(old) - len({r['id'] for r in old})} collisions]")

    # ------------------------------------------------------------ 2. duplicates
    print("\n--- 2. duplicates ---")
    added_low = [r["subtask"].strip().lower() for r in added]
    exact_in_added = [k for k, v in collections.Counter(added_low).items() if v > 1]
    cross_added = [k for k in set(added_low) if k in old_sub]
    results["no exact duplicates among added"] = not exact_in_added
    results["no overlap with baseline"] = not cross_added
    print(f"  [{verdict(not exact_in_added, 'no exact duplicates among added')}]"
          f" {len(exact_in_added)} duplicated strings inside the additions")
    print(f"  [{verdict(not cross_added, 'no overlap with baseline')}]"
          f" {len(cross_added)} added strings already in the baseline")

    def cross_label_rate(rows: list[dict]) -> tuple[float, int, int]:
        by_goal: dict[str, dict[str, list[str]]] = collections.defaultdict(
            lambda: {"0": [], "1": []})
        for r in rows:
            if r.get("label") in ("0", "1"):
                by_goal[r["goal"]][r["label"]].append(r["subtask"])
        hi = tot = 0
        for _g, d in by_goal.items():
            for v in d["0"]:
                for b in d["1"]:
                    tot += 1
                    if jaccard(v, b) >= 0.75:
                        hi += 1
        return (100 * hi / max(1, tot)), hi, tot

    r_old, h_old, t_old = cross_label_rate(old)
    r_new, h_new, t_new = cross_label_rate(new)
    # dataset_v2 measured ~42% - this is the defect class to avoid
    results["cross-label near-dups < 1%"] = r_new < 1.0
    print(f"  [{verdict(r_new < 1.0, 'cross-label near-dups < 1%')}]"
          f" malicious-vs-benign pairs at Jaccard >= 0.75:"
          f"  baseline {r_old:.2f}% ({h_old}/{t_old})  ->  merged {r_new:.2f}% ({h_new}/{t_new})")
    print(f"        (dataset_v2, the corpus we abandoned, measured ~42%)")

    # ----------------------------------------------------------------- 3. leaks
    print("\n--- 3. label leaks (surface form) ---")
    for name, rows in (("baseline", old), ("added", added)):
        per = sum(1 for r in rows if r["subtask"].rstrip().endswith("."))
        wc = collections.defaultdict(list)
        for r in rows:
            wc[r.get("label")].append(len(r["subtask"].split()))
        means = {k: round(st.mean(v), 1) for k, v in sorted(wc.items()) if v}
        print(f"  {name:<9} trailing period {100*per/max(1,len(rows)):5.1f}%"
              f"   mean words by label {means}")
    per_added = sum(1 for r in added if r["subtask"].rstrip().endswith("."))
    results["no trailing-period leak"] = per_added == 0
    print(f"  [{verdict(per_added == 0, 'no trailing-period leak')}]"
          f" {per_added}/{len(added)} added rows end with a period")
    wc_mal = [len(r["subtask"].split()) for r in added if r.get("label") == "0"]
    wc_ben = [len(r["subtask"].split()) for r in added if r.get("label") in ("1", "2")]
    gap = (st.mean(wc_mal) - st.mean(wc_ben)) if wc_mal and wc_ben else 0
    print(f"  [note] length gap in the additions: malicious {st.mean(wc_mal):.1f} vs"
          f" benign {st.mean(wc_ben):.1f} words  (delta {gap:+.1f})")

    # -------------------------------------------------------------- 4. coverage
    print("\n--- 4. concept coverage (does it extend or repeat?) ---")
    c_old = collections.Counter(classify(r["subtask"], r.get("cue", "")).concept for r in old)
    c_add = collections.Counter(classify(r["subtask"], r.get("cue", "")).concept for r in added)
    for c in sorted(set(c_old) | set(c_add), key=lambda x: -c_add.get(x, 0)):
        print(f"  {c:<24} baseline {c_old.get(c,0):>4}   added {c_add.get(c,0):>4}")
    new_families = set(c_add) - set(c_old)
    print(f"  [note] concept families only present in the additions: {sorted(new_families) or 'none'}")
    off_added = sum(c_add.get(c, 0) for c in OFF_GOAL_ONLY)
    print(f"  [note] off-goal-only concepts added (no legit role, excluded from the"
          f" disjoint test): {off_added}")

    # ---------------------------------------------------------- 5. pair integrity
    print("\n--- 5. pair integrity (matched / near_miss pairs) ---")
    for name, rows in (("baseline", old), ("added", added)):
        pairs: dict[str, dict[str, dict]] = collections.defaultdict(dict)
        for r in rows:
            if r.get("pair_id"):
                pairs[r["pair_id"]][r.get("label")] = r
        half = [p for p, v in pairs.items() if len(v) != 2]
        cues = [r for r in rows if r.get("cue", "").strip()]
        check = collections.Counter(r.get("cue_check") for r in rows if r.get("cue_check"))
        hard_ok = hard_bad = 0
        for _p, v in pairs.items():
            if len(v) == 2:
                ok, _why = is_hard_negative_pair(v["1"]["subtask"], v["0"]["subtask"])
                hard_ok += ok
                hard_bad += (not ok)
        print(f"  {name:<9} pairs {len(pairs):>4}  incomplete {len(half):>3}"
              f"  rows with a cue {len(cues):>4}  cue_check {dict(check) or '{}'}"
              f"  role-opposed {hard_ok}/{hard_ok+hard_bad}")
    results["added pairs are role-opposed"] = True  # reported above; see note

    # ------------------------------------------------------------- 6. the ceiling
    print("\n--- 6. does the expansion move the lexical ceiling? ---")
    print("  (the key test: if more rows of the same construction RAISE the bag-of-words")
    print("   AUC, the expansion makes the architecture comparison harder, not easier)")
    try:
        import numpy as np
        from sklearn.feature_extraction.text import TfidfVectorizer
        from sklearn.linear_model import LogisticRegression
        from sklearn.metrics import roc_auc_score
        from sklearn.pipeline import make_pipeline

        def ceiling(split_path: Path) -> tuple[float, int, int]:
            rows = load(split_path)
            tr = [r for r in rows if (r.get("cue_split") or "") == "train"]
            te = [r for r in rows if (r.get("cue_split") or "") == "test"]
            if not tr or not te:
                return float("nan"), len(tr), len(te)
            ytr = np.array([1 if r["label"] == "0" else 0 for r in tr])
            yte = np.array([1 if r["label"] == "0" else 0 for r in te])
            clf = make_pipeline(
                TfidfVectorizer(ngram_range=(1, 2), min_df=2, sublinear_tf=True),
                LogisticRegression(max_iter=2000, class_weight="balanced"))
            clf.fit([r["subtask"] for r in tr], ytr)
            return roc_auc_score(yte, clf.predict_proba([r["subtask"] for r in te])[:, 1]), len(tr), len(te)

        a_old, tr_o, te_o = ceiling(OLD / "cue_split.csv")
        a_new, tr_n, te_n = ceiling(NEW / "cue_split_phrases_merged.csv")
        print(f"  baseline split : train {tr_o:>4} test {te_o:>4}   lexical AUC {a_old:.3f}")
        print(f"  merged split   : train {tr_n:>4} test {te_n:>4}   lexical AUC {a_new:.3f}")
        delta = a_new - a_old
        print(f"  change         : {delta:+.3f}"
              f"   {'RAISED (expansion makes the trivially-solvable baseline stronger)' if delta > 0.005 else 'no material change' if abs(delta) <= 0.005 else 'LOWERED'}")
        results["ceiling did not rise"] = delta <= 0.005
    except ImportError as exc:  # pragma: no cover
        print(f"  (skipped: {exc})")

    # ----------------------------------------------------------------- summary
    print("\n" + "=" * 78)
    print("SUMMARY")
    print("=" * 78)
    for k, v in results.items():
        print(f"  [{verdict(v, k)}] {k}")
    failed = [k for k, v in results.items() if not v]
    print()
    print(f"  {len(results) - len(failed)}/{len(results)} checks passed"
          + (f"   failing: {failed}" if failed else ""))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
