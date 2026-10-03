#!/usr/bin/env python3
"""Re-judge rows and report which fail the semantic gate.

Two uses:
  * catch **fail-open** rows - when the judge endpoint is unreachable, generation
    accepts the row unjudged and only counts it. Those rows never passed a gate.
  * audit a corpus against a second pass, to find label defects that survived.

Writes JSON so the result can be diffed across runs.

Usage
-----
    python rejudge_rows.py --file data/corpus_v3/holdout_clean.csv --stratum hard
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
import make_corpus_v3 as M  # noqa: E402


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--file", default=str(HERE / "data" / "corpus_v3" / "holdout_clean.csv"))
    p.add_argument("--stratum", default="hard", help="only rows with this stratum ('' = all)")
    p.add_argument("--label", default="0", help="only rows with this label ('' = all)")
    p.add_argument("--only-source", default="", help="only rows with this source")
    p.add_argument("--limit", type=int, default=0)
    p.add_argument("--judge-endpoint", default=os.environ.get(
        "SENTINEL_JUDGE_ENDPOINT", "http://127.0.0.1:8082/v1/chat/completions"))
    p.add_argument("--judge-model", default=os.environ.get(
        "SENTINEL_JUDGE_MODEL", "D:\\llamacpp-rocm\\build\\bin\\models\\Qwen3.5-9B-abliterated-Q4_K_M.gguf"))
    p.add_argument("--out", default="")
    args = p.parse_args()

    rows = list(csv.DictReader(Path(args.file).open(encoding="utf-8")))
    if args.stratum:
        rows = [r for r in rows if r["stratum"] == args.stratum]
    if args.label:
        rows = [r for r in rows if r["label"] == args.label]
    if args.only_source:
        rows = [r for r in rows if r["source"] == args.only_source]
    if args.limit:
        rows = rows[:args.limit]
    if not rows:
        print("no rows selected", file=sys.stderr)
        return 1

    # a Namespace with just what judge() touches
    jargs = argparse.Namespace(
        endpoint=args.judge_endpoint, model=args.judge_model,
        judge_endpoint=args.judge_endpoint, judge_model=args.judge_model,
        temperature=0.0, top_p=0.95, min_p=0.0, top_k=40, repeat_penalty=1.05,
        no_think=False, no_judge=False,
    )

    print(f"re-judging {len(rows)} rows (stratum={args.stratum or '*'} label={args.label or '*'})")
    print(f"  judge: {args.judge_model}")

    results = []
    for i, r in enumerate(rows, 1):
        harm = r.get("harm_category") or None
        if harm not in M.HARM_CATEGORIES:
            harm = None
        ok, why = M.judge(M.JUDGE_VIOLATION_SYSTEM, "violates", r["goal"], r["subtask"],
                          jargs, seed=i, harm=harm)
        results.append({"id": r["id"], "subtask": r["subtask"], "goal": r["goal"],
                        "harm_category": r.get("harm_category", ""),
                        "verdict": "PASS" if ok else "FAIL", "reason": why})
        flag = "  " if ok else "<-"
        print(f"  {i:>3}/{len(rows)} {flag} [{r.get('harm_category',''):<20}] {r['subtask'][:66]}")
        if not ok:
            print(f"        reason: {why}")

    fails = [x for x in results if x["verdict"] == "FAIL"]
    hc = M.JUDGE_STATS
    calls = max(1, hc.get("calls", 0))
    print(f"\njudge health: {dict(hc)}  -> failure rate {hc.get('unavailable',0)/calls:.1%}")
    print(f"verdicts: {dict(collections.Counter(x['verdict'] for x in results))}")
    print(f"\n--- FAILING ROWS ({len(fails)}) ---")
    for x in fails:
        print(f"  {x['id']} [{x['harm_category']}] {x['subtask']}")
        print(f"      {x['reason']}")

    out = Path(args.out) if args.out else Path(args.file).with_name(
        Path(args.file).stem + "_rejudge.json")
    out.write_text(json.dumps({"file": args.file, "stratum": args.stratum,
                               "judge": args.judge_model, "results": results},
                              indent=2), encoding="utf-8")
    print(f"\nwrote {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
