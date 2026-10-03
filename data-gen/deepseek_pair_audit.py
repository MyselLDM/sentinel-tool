#!/usr/bin/env python3
"""Audit the EXISTING matched pairs with DeepSeek as an independent judge.

This is the experiment that decides whether the corpus or the model is at fault.

The matched pairs in `matched_pairs_extra.csv` were validated by the local 9B judge,
which had already been caught falsely accepting a clear non-violation. A stronger,
independent judge re-checking those same rows separates two explanations:

* DeepSeek **rejects many of my pairs** -> the corpus has a label-quality problem that
  a better judge would have caught (a corpus issue, fixable).
* DeepSeek **accepts them** -> the pairs are sound, and the 0/5 full-gate result on
  DeepSeek's own output was about DeepSeek's generation, not the corpus (a
  model-specific issue).

Reads the API key from the environment only. Writes JSON for the audit record.

Usage
-----
    export DEEPSEEK_API_KEY=sk-...
    python deepseek_pair_audit.py                 # all matched pairs
    python deepseek_pair_audit.py --limit 5       # quick pilot
"""

from __future__ import annotations

import argparse
import collections
import csv
import json
import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from test_deepseek import DEFAULT_BASE, call, load_key  # noqa: E402
import make_corpus_v3 as M  # noqa: E402

PAIRS = HERE / "data" / "corpus_v3" / "matched_pairs_extra.csv"  # default only
# cross-check against the rows the 9B judge accepted while building the hard holdout
HARD = HERE / "data" / "corpus_v3" / "holdout_hard_extra.csv"


def make_args(base: str, model: str) -> argparse.Namespace:
    """Namespace for ``M.judge``, which builds the prompt CORRECTLY - including the
    ``CLAIMED HARM CATEGORY`` block.

    An earlier version of this script called the API directly and omitted that block.
    Measured: adding it flipped 2 of 3 probe verdicts, in both directions (one
    violation became visible, one false positive was corrected). Any validity figure
    produced that way is not a measure of corpus quality, so the audit was re-run.
    """
    ep = f"{base}/chat/completions"
    return argparse.Namespace(
        endpoint=ep, model=model, judge_endpoint=ep, judge_model=model,
        temperature=0.0, top_p=0.95, min_p=0.0, top_k=40, repeat_penalty=1.05,
        no_think=False, no_judge=False, judge_fail_closed=True)


def judge_pair(args: argparse.Namespace, goal: str, benign: str, violation: str,
               harm: str | None) -> dict:
    v_ok, v_why = M.judge(M.JUDGE_VIOLATION_SYSTEM, "violates", goal, violation,
                          args, 1, harm=harm or None)
    b_ok, b_why = M.judge(M.JUDGE_AUTHORISED_SYSTEM, "authorised", goal, benign, args, 1)
    return {
        "violation_confirmed": v_ok,
        "benign_authorised": b_ok,
        "violation_reason": str(v_why)[:200],
        "benign_reason": str(b_why)[:200],
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--model", default="deepseek-chat")
    ap.add_argument("--base", default=DEFAULT_BASE)
    ap.add_argument("--pairs", default=str(PAIRS),
                    help="the pair CSV to audit (default: the 9B-gated set)")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--write-valid", default="",
                    help="write only the pairs that pass this audit to the given CSV, so the "
                         "defective ones can be dropped from the corpus")
    ap.add_argument("--out", default=str(HERE / "data" / "corpus_v3" / "deepseek_pair_audit.json"))
    args = ap.parse_args()

    key = load_key()
    if not key:
        print("DEEPSEEK_API_KEY not set (see test_deepseek.py)", file=sys.stderr)
        return 2

    rows = list(csv.DictReader(Path(args.pairs).open(encoding="utf-8")))
    by_pair: dict[str, dict[str, dict]] = collections.defaultdict(dict)
    for r in rows:
        by_pair[r["pair_id"]][r["label"]] = r
    pairs = [(pid, v) for pid, v in by_pair.items() if len(v) == 2]
    if args.limit:
        pairs = pairs[:args.limit]

    jargs = make_args(args.base, args.model)
    print(f"independent audit of {len(pairs)} matched pairs by {args.model}")
    print("  this checks whether my pairs are sound, or whether the 9B judge let bad")
    print("  rows through (which would make it a CORPUS problem, not a model problem)\n")

    results = []
    tally = collections.Counter()
    for i, (pid, sides) in enumerate(pairs, 1):
        benign, violation = sides["1"], sides["0"]
        verdict = judge_pair(jargs, benign["goal"], benign["subtask"],
                             violation["subtask"], benign.get("harm_category", ""))
        ok = verdict["violation_confirmed"] and verdict["benign_authorised"]
        tally["valid" if ok else "invalid"] += 1
        if not verdict["violation_confirmed"]:
            tally["violation_not_a_violation"] += 1
        if not verdict["benign_authorised"]:
            tally["benign_not_authorised"] += 1
        results.append({"pair_id": pid, "goal": benign["goal"],
                        "concept": benign.get("cue_concept", ""),
                        "benign": benign["subtask"], "violation": violation["subtask"],
                        **verdict,
                        "verdict": "VALID" if ok else "INVALID"})
        print(f"  {i:>2}/{len(pairs)} {benign.get('cue_concept',''):<22} "
              f"{'VALID  ' if ok else 'INVALID'}  {violation['subtask'][:58]}")
        if not verdict["violation_confirmed"]:
            print(f"          violation side: {verdict['violation_reason'][:96]}")
        if not verdict["benign_authorised"]:
            print(f"          benign side   : {verdict['benign_reason'][:96]}")

    n = len(pairs)
    print(f"\n  VALID   : {tally['valid']}/{n}  ({100*tally['valid']/max(1,n):.0f}%)")
    print(f"  INVALID : {tally['invalid']}/{n}")
    print(f"    of which violation-is-not-a-violation: {tally['violation_not_a_violation']}")
    print(f"    of which benign-is-not-authorised    : {tally['benign_not_authorised']}")
    print(f"\n  by concept:")
    per = collections.Counter(r["concept"] for r in results if r["verdict"] == "VALID")
    tot = collections.Counter(r["concept"] for r in results)
    for c in sorted(tot):
        print(f"    {c:<22} {per.get(c,0)}/{tot[c]} valid")

    Path(args.out).write_text(json.dumps({"model": args.model, "n_pairs": n,
                                          "tally": dict(tally), "results": results},
                                         indent=2), encoding="utf-8")
    print(f"\nwrote {Path(args.out).name}")

    if args.write_valid:
        valid_ids = {r["pair_id"] for r in results if r["verdict"] == "VALID"}
        keep = [r for r in rows if r["pair_id"] in valid_ids]
        with Path(args.write_valid).open("w", newline="", encoding="utf-8") as fh:
            w = csv.DictWriter(fh, fieldnames=list(rows[0].keys()), extrasaction="ignore")
            w.writeheader()
            w.writerows(keep)
        print(f"wrote {Path(args.write_valid).name}: {len(keep)} rows "
              f"({len(valid_ids)} of {n} pairs survived the audit)")
        print(f"  {n - len(valid_ids)} pairs dropped as defective")
    print("\ninterpretation:")
    print("  high VALID rate  -> my pairs are sound; the 0/5 on DeepSeek's own output is")
    print("                      about its generation, and the generator is not the issue")
    print("  low  VALID rate  -> the 9B judge let defects through; the corpus needs the")
    print("                      strongest available judge, regardless of generator")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
