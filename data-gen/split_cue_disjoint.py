#!/usr/bin/env python3
"""Build a concept-disjoint (cue-disjoint) split, and report whether one is possible.

Why
---
AUDIT_REPORT 3.6: the holdout is disjoint from training at the *row* and *goal*
level, but not at the *concept* level - every concept family in the benchmark
(`social`, `sealed`, `internal`, `demo`, `ext`, `travel`) already appears in
training, and only `bench`/`bio` are new. So memorising concept -> violation is
enough to score well, and no generalisation is being measured.

A concept-disjoint split assigns each concept family wholly to TRAIN or TEST, so the
test set's overreach *kinds* are unseen. That is the only split on which "does the
model reason about the boundary rather than the words" is actually being asked.

The feasibility test
--------------------
To measure anything on the test side you need BOTH classes there. So every concept
assigned to TEST must also be represented in the **benign** class - i.e. benign rows
must legitimately use the same concepts. That is precisely what the audit found
missing (benign rows contained 0/281 mentions of `sealed`, `social media`, `travel
pattern`, `benchmark`, `neighborhood`).

So on the current corpus this reports **NOT FEASIBLE**, with the numbers showing why.
That is the intended outcome: it is the machine-checkable statement of what the
corpus still needs. Once concept-matched benign/malicious pairs exist, the same
command should report FEASIBLE.

Usage
-----
    python split_cue_disjoint.py
    python split_cue_disjoint.py --test-share 0.35 --min-per-family 5
"""

from __future__ import annotations

import argparse
import collections
import csv
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = HERE / "data" / "corpus_v3"
sys.path.insert(0, str(HERE))
from concepts import DUAL_USE, OFF_GOAL_ONLY, classify  # noqa: E402

DEFAULT_TRAIN = [OUT / "corpus_clean.csv"]
DEFAULT_TEST = [OUT / "holdout_clean_curated.csv"]


def read(paths: list[Path]) -> list[dict]:
    rows: list[dict] = []
    for p in paths:
        if p.exists():
            rows.extend(csv.DictReader(p.open(encoding="utf-8")))
    return rows


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--min-per-family", type=int, default=4,
                    help="a family needs at least this many rows in a class to count")
    ap.add_argument("--min-test-malicious", type=int, default=30,
                    help="a TEST set smaller than this cannot support a statistical claim")
    ap.add_argument("--min-test-benign", type=int, default=20,
                    help="ditto for the benign/control side of TEST")
    ap.add_argument("--out-csv", default=str(OUT / "cue_split.csv"))
    ap.add_argument("--out-json", default=str(OUT / "cue_split.json"))
    args = ap.parse_args()

    rows = read(DEFAULT_TRAIN + DEFAULT_TEST)
    for r in rows:
        tag = classify(r.get("subtask", ""), r.get("cue", ""))
        r["_concept"] = tag.concept
        r["_roles"] = ",".join(sorted(tag.roles))

    mal = [r for r in rows if r["label"] == "0"]
    ben = [r for r in rows if r["label"] in ("1", "2")]
    print(f"tagged {len(rows)} rows ({len(mal)} malicious, {len(ben)} benign/neutral)\n")

    m_by = collections.Counter(r["_concept"] for r in mal)
    b_by = collections.Counter(r["_concept"] for r in ben)
    print(f"  {'concept':<22}{'malicious':>10}{'benign':>8}   usable as a TEST family?")
    for c in sorted(set(m_by) | set(b_by), key=lambda x: -m_by.get(x, 0)):
        mm, bb = m_by.get(c, 0), b_by.get(c, 0)
        ok = (mm >= args.min_per_family and bb >= args.min_per_family
              and c not in OFF_GOAL_ONLY)
        if c in OFF_GOAL_ONLY:
            why = "excluded by design - no legitimate role, so no boundary to test"
        else:
            why = "yes" if ok else ("benign support missing" if mm >= args.min_per_family
                                    else "too few malicious rows")
        print(f"  {c:<22}{mm:>10}{bb:>8}   {why}")

    eligible = [c for c in m_by
                if m_by[c] >= args.min_per_family and b_by.get(c, 0) >= args.min_per_family
                and c != "unclassified" and c not in OFF_GOAL_ONLY]
    total = sum(m_by[c] for c in eligible)
    print(f"\n  families usable as TEST: {len(eligible)}  {sorted(eligible) or '(none)'}")
    print(f"  malicious mass available in those families: {total}/{len(mal)}")

    if not eligible:
        print("\n  VERDICT: NOT FEASIBLE")
        print("  No concept family has both classes with enough mass, so a concept-disjoint")
        print("  split cannot produce a TEST set containing both malicious and benign rows.")
        print("  Root cause: benign rows carry no violation concepts at all")
        for c in ("privileged_internal", "subject_social", "subject_location",
                  "third_party_external", "demographic_proxy"):
            print(f"    {c:<22} malicious {m_by.get(c,0):>3}   benign {b_by.get(c,0):>3}")
        print("\n  Fix (AUDIT_REPORT 5.1/5.2): generate concept-matched pairs - benign rows")
        print("  that use these SAME concepts for an authorised purpose - then re-run this.")
        json.dump({"feasible": False, "eligible": [], "malicious_by_concept": dict(m_by),
                   "benign_by_concept": dict(b_by)}, Path(args.out_json).open("w"),
                  indent=2)
        print(f"\nwrote {Path(args.out_json).name} (feasible: false)")
        return 0

    # Accumulate families into TEST until BOTH class targets are met. The earlier
    # version stopped as soon as the malicious-mass share was reached, which parked a
    # single family in TEST and left it with 5 benign rows against a target of 20 - a
    # structurally valid split that still could not estimate FPR.
    order = sorted(eligible, key=lambda x: -(b_by.get(x, 0) + m_by.get(x, 0)))
    assign: dict[str, str] = {}
    te_m = te_b = 0
    for i, c in enumerate(order):
        if te_m >= args.min_test_malicious and te_b >= args.min_test_benign:
            break
        if len(order) - i <= 1:          # always leave at least one family for TRAIN
            break
        assign[c] = "test"
        te_m += m_by[c]
        te_b += b_by.get(c, 0)
    for c in eligible:
        assign.setdefault(c, "train")
    assign["unclassified"] = "train"
    print(f"\n  assignment: test={sorted(k for k,v in assign.items() if v=='test')}")
    print(f"              train={sorted(k for k,v in assign.items() if v=='train')}")

    for r in rows:
        r["cue_split"] = assign.get(r["_concept"], "train")

    # verification: no concept family straddles the split
    straddle = [c for c in set(r["_concept"] for r in rows)
                if len({r["cue_split"] for r in rows if r["_concept"] == c}) > 1]
    te_m = sum(1 for r in rows if r["cue_split"] == "test" and r["label"] == "0")
    te_b = sum(1 for r in rows if r["cue_split"] == "test" and r["label"] in ("1", "2"))
    print(f"\n  concept families straddling train/test: {len(straddle)} (must be 0)")
    print(f"  TEST: {te_m} malicious, {te_b} benign/neutral")

    # A structurally valid split that is too small to measure anything is still useless.
    usable = (straddle == [] and te_m >= args.min_test_malicious
              and te_b >= args.min_test_benign)
    if usable:
        print("\n  VERDICT: FEASIBLE - concept-disjoint and large enough to measure")
    else:
        print("\n  VERDICT: NOT USABLE")
        if straddle:
            print(f"  {len(straddle)} concept family/families straddle the split")
        if te_m < args.min_test_malicious:
            print(f"  TEST has only {te_m} malicious rows (need >= {args.min_test_malicious}).")
            print(f"  Only {total}/{len(mal)} malicious rows sit in a family that ALSO has")
            print("  benign support, so almost nothing can be held out at the concept level.")
        if te_b < args.min_test_benign:
            print(f"  TEST has only {te_b} benign rows (need >= {args.min_test_benign}); FPR")
            print("  would be unestimable.")
        print("\n  Root cause (AUDIT_REPORT 3.3): benign rows contain no violation concepts.")
        print("  Fix: generate concept-matched benign/malicious pairs (5.2) so each family has")
        print("  both classes, then re-run this command. Until then no concept-level")
        print("  generalisation is being measured, whatever split is used.")

    cols = ["id", "goal", "subtask", "label", "stratum", "source"]
    with Path(args.out_csv).open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=cols + ["concept", "roles", "cue_split"],
                           extrasaction="ignore")
        w.writeheader()
        for r in rows:
            w.writerow({**{k: r.get(k, "") for k in cols},
                        "concept": r["_concept"], "roles": r["_roles"],
                        "cue_split": r["cue_split"]})
    json.dump({"feasible": usable, "usable": usable, "eligible": sorted(eligible),
               "assign": assign, "test_malicious": te_m, "test_benign": te_b,
               "straddling_families": straddle,
               "malicious_by_concept": dict(m_by), "benign_by_concept": dict(b_by)},
              Path(args.out_json).open("w"), indent=2)
    print(f"\nwrote {Path(args.out_csv).name} and {Path(args.out_json).name} (usable: {usable})")
    if usable:
        print("next: run lexical_baseline.py --split-file ... to confirm the leak is closed")
    return 0 if usable else 2


if __name__ == "__main__":
    raise SystemExit(main())
