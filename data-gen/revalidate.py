#!/usr/bin/env python3
"""Re-run the generator's validators against an existing corpus.

No LLM calls: this applies ``prompt.validate_positive`` / ``prompt.validate_negative``
to rows that are already on disk.

**Scope caveat:** these are the *lexical* rules only. The semantic gate
(``prompt.judge_negative``, enabled with ``--judge``) needs the model endpoint and
cannot run here, so the rejection rate reported below is a FLOOR, not what the
generator with ``--judge`` would reject. Rows are checked with a fresh ``seen``
set per row regardless of anchor (pass ``--shared-seen`` to match the generator's
per-anchor duplicate rule).

Writes a CSV of rejected rows for review, and prints per-policy counts.

Usage:
  python revalidate.py                       # ../training/dataset.csv
  python revalidate.py --corpus ../training/dataset_v2.csv
  python revalidate.py --corpus data/triplets.csv --out review/revalidate.csv
"""

from __future__ import annotations

import argparse
import collections
import csv
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import prompt as P  # noqa: E402


def main() -> int:
    here = Path(__file__).resolve().parent
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--corpus", default=str(here.parent / "training" / "dataset.csv"))
    parser.add_argument("--out", default=str(here.parent / "training" / "review" / "revalidate.csv"))
    parser.add_argument("--shared-seen", action="store_true",
                        help="reuse one `seen` set across each anchor's rows, matching the "
                             "generator's 'duplicate within this anchor' rule")
    args = parser.parse_args()

    corpus = Path(args.corpus)
    with corpus.open("r", encoding="utf-8", newline="") as fh:
        rows = list(csv.DictReader(fh))

    total = collections.Counter()
    rejected = collections.Counter()
    reasons: dict[str, collections.Counter] = collections.defaultdict(collections.Counter)
    rejects: list[dict] = []
    seen_by_anchor: dict[str, set[str]] = collections.defaultdict(set)

    for index, row in enumerate(rows):
        policy = P.POLICY_BY_ID.get(row["policy_violation"])
        if policy is None:
            continue
        total[row["policy_violation"]] += 1
        seen = seen_by_anchor[row["anchor"]] if args.shared_seen else set()
        if args.shared_seen and row["negative"].lower() in seen:
            # already used by an earlier row of this anchor -> the generator would
            # have rejected it too
            rejected[row["policy_violation"]] += 1
            reasons[row["policy_violation"]]["negative: duplicate within this anchor"] += 1
            rejects.append({
                "row_index": index,
                "data_number": row.get("data_number", ""),
                "policy_violation": row["policy_violation"],
                "policy_name": row["policy_name"],
                "failures": "negative: duplicate within this anchor",
                "anchor": row["anchor"],
                "positive": row["positive"],
                "negative": row["negative"],
            })
            continue

        verdicts = [
            ("positive", P.validate_positive(row["positive"], row["anchor"])),
            ("negative", P.validate_negative(row["negative"], row["positive"], policy, seen)),
        ]
        failures = [(kind, reason) for kind, reason in verdicts if reason]
        if failures:
            rejected[row["policy_violation"]] += 1
            for kind, reason in failures:
                reasons[row["policy_violation"]][f"{kind}: {reason.split('(')[0].strip()}"] += 1
            rejects.append({
                "row_index": index,
                "data_number": row.get("data_number", ""),
                "policy_violation": row["policy_violation"],
                "policy_name": row["policy_name"],
                "failures": " | ".join(f"{kind}: {reason}" for kind, reason in failures),
                "anchor": row["anchor"],
                "positive": row["positive"],
                "negative": row["negative"],
            })

    print(f"corpus: {corpus}  ({len(rows)} rows)")
    print("LEXICAL validators only — the --judge (LLM) gate cannot run offline, so this")
    print("rejection rate is a floor, not the full generator gate.\n")
    print(f"rejected: {len(rejects)} ({len(rejects) / max(1, len(rows)) * 100:.1f}%)\n")
    print(f"  {'policy':<8}{'name':<26}{'rows':>6}{'rejected':>10}{'rate':>8}")
    for code in sorted(total, key=lambda c: int(c.split('-')[1])):
        name = P.POLICY_BY_ID[code]["name"]
        bad, all_rows = rejected[code], total[code]
        print(f"  {code:<8}{name:<26}{all_rows:>6}{bad:>10}{bad / all_rows * 100:>7.1f}%")

    print("\n  top reasons per policy:")
    for code in sorted(reasons, key=lambda c: int(c.split('-')[1])):
        for reason, count in reasons[code].most_common(3):
            print(f"    {code}  {count:>4}  {reason}")

    out = Path(args.out)
    if rejects:
        out.parent.mkdir(parents=True, exist_ok=True)
        with out.open("w", encoding="utf-8", newline="") as fh:
            writer = csv.DictWriter(fh, fieldnames=list(rejects[0].keys()))
            writer.writeheader()
            writer.writerows(rejects)
        print(f"\nwrote {out}")
    else:
        print("\nno rejections — every row passes the current validators")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
