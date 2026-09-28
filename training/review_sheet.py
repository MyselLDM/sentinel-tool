#!/usr/bin/env python3
"""Build and score a manual review sheet for the DelegationBench corpus.

Two subcommands:

  make   emit a review sheet (CSV) — blind, shuffled, stratified
  score  read a filled sheet and compute what the review actually bought us

Why blind: the lexical flags in ``flag_questionable_rows.py`` are heuristics with
unmeasured precision (my own gate rejected 91% of P-02 before I caught it). Showing
them anchors the reviewer. The sheet therefore shows only the row and the policy
being claimed, and the reviewer decides independently.

Why a sample first: the whole "will cleaner data help?" question reduces to the
corpus's label-error rate. implementation.md §7 already specifies the sampling
protocol — 95% confidence, ±5% margin, ~370 examples. Reviewing 370 rows answers
it; reviewing 9,900 rows confirms it. Use ``make --sample 370`` first, then
``make --full`` only for the rows that matter.

Usage:
  python review_sheet.py make --sample 370 --out review/sheet_batch1.csv
  python review_sheet.py make --full   --out review/sheet_full.csv
  python review_sheet.py score --sheet review/sheet_batch1_completed.csv
"""

from __future__ import annotations

import argparse
import collections
import csv
import math
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common as C  # noqa: E402

SHEET_FIELDS = [
    "row_index", "data_number", "domain", "policy_violation", "policy_name",
    "anchor", "positive", "negative",
    "positive_is_authorised", "negative_commits_policy", "notes",
]

YES = {"y", "yes", "true", "1", "t"}
NO = {"n", "no", "false", "0", "f"}
UNSURE = {"", "?", "unsure", "u", "unknown"}


def _policy_notes() -> dict[str, str]:
    """Short 'how it is committed' note per policy, from data-gen/prompt.py if present."""
    prompt_py = C.TRAINING_DIR.parent / "data-gen" / "prompt.py"
    if not prompt_py.exists():
        return {}
    try:
        import importlib.util

        spec = importlib.util.spec_from_file_location("_gen_prompt", prompt_py)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)  # type: ignore[union-attr]
        return {p["id"]: p["mechanism"] for p in module.POLICIES}
    except Exception:  # noqa: BLE001 - optional context only
        return {}


def wilson(successes: int, total: int, z: float = 1.96) -> tuple[float, float]:
    """Wilson score interval for a proportion (better than normal at small n)."""
    if total == 0:
        return 0.0, 0.0
    phat = successes / total
    denom = 1 + z * z / total
    centre = (phat + z * z / (2 * total)) / denom
    half = z * math.sqrt(phat * (1 - phat) / total + z * z / (4 * total * total)) / denom
    return max(0.0, centre - half), min(1.0, centre + half)


def load_rows(path: Path) -> list[dict]:
    with path.open("r", encoding="utf-8", newline="") as fh:
        return list(csv.DictReader(fh))


def cmd_make(args: argparse.Namespace) -> int:
    rows = load_rows(Path(args.dataset))
    mechanisms = _policy_notes()

    # ── select: either the whole corpus or a stratified random sample ──
    if args.full:
        selected = [(i, r) for i, r in enumerate(rows)]
    else:
        by_policy: dict[str, list[tuple[int, dict]]] = collections.defaultdict(list)
        for i, r in enumerate(rows):
            by_policy[r["policy_violation"]].append((i, r))
        rng = random.Random(args.seed)
        selected = []
        total = len(rows)
        for policy, pool in sorted(by_policy.items()):
            share = round(args.sample * len(pool) / total)
            share = max(share, args.min_per_policy)
            share = min(share, len(pool))
            selected += rng.sample(pool, share)
        rng.shuffle(selected)

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=SHEET_FIELDS)
        writer.writeheader()
        for index, row in selected:
            writer.writerow({
                "row_index": index,
                "data_number": row.get("data_number", ""),
                "domain": row.get("domain", ""),
                "policy_violation": row["policy_violation"],
                "policy_name": row["policy_name"],
                "anchor": row["anchor"],
                "positive": row["positive"],
                "negative": row["negative"],
                "positive_is_authorised": "",
                "negative_commits_policy": "",
                "notes": "",
            })

    mode = "FULL" if args.full else f"sample n={len(selected)}"
    print(f"wrote {out}  ({mode} of {len(rows)} rows)")
    if not args.full:
        print(f"  strata: {len({r['policy_violation'] for _, r in selected})} policies,"
              f" {len({r['anchor'] for _, r in selected})} anchors")
        lo, hi = wilson(0, len(selected))
        print(f"  with n={len(selected)} a single-rater agreement estimate carries a 95% CI of"
              f" roughly ±{max(abs(0.5-lo), abs(hi-0.5))*100:.0f}pp worst case (p≈0.5),")
        print(f"  and about ±{1.96*math.sqrt(0.9*0.1/len(selected))*100:.1f}pp if agreement is ~90%.")

    print("\nHOW TO FILL IT IN (one row at a time, independently):")
    print("  positive_is_authorised   y | n | ?    is the POSITIVE plainly inside the goal's")
    print("                                        authorisation boundary? (should be y)")
    print("  negative_commits_policy  y | n | ?    does the NEGATIVE really commit the named")
    print("                                        policy? (should be y)")
    print("  notes                                 one line, only when you answered n/?")
    print("\nJudge the MEANING, not the wording. Use ? when you genuinely cannot decide —")
    print("those rows are themselves a finding (they bound what any model can score).")

    if mechanisms:
        print("\nPOLICY DEFINITIONS (what 'commits this policy' means):")
        for code in sorted(mechanisms, key=lambda c: int(c.split("-")[1])):
            name = next((r["policy_name"] for _, r in selected if r["policy_violation"] == code), "")
            print(f"  {code} {name}")
            print(f"      {mechanisms[code]}")
    return 0


def _parse(value: str) -> str:
    v = (value or "").strip().lower()
    if v in YES:
        return "yes"
    if v in NO:
        return "no"
    if v in UNSURE:
        return "unsure"
    return "invalid"


def cmd_score(args: argparse.Namespace) -> int:
    sheet = load_rows(Path(args.sheet))
    if not sheet:
        raise SystemExit(f"{args.sheet} has no rows")

    pos = collections.Counter()
    neg = collections.Counter()
    per_policy: dict[str, collections.Counter] = collections.defaultdict(collections.Counter)
    undecided: list[dict] = []
    zero_notes: list[dict] = []
    blank = 0

    for row in sheet:
        p, n = _parse(row.get("positive_is_authorised", "")), _parse(row.get("negative_commits_policy", ""))
        if p == "unsure" and n == "unsure" and not (row.get("notes") or "").strip():
            blank += 1
            continue
        pos[p] += 1
        neg[n] += 1
        policy = row.get("policy_violation", "?")
        for verdict, side in ((p, "pos"), (n, "neg")):
            if verdict == "yes":
                per_policy[policy]["agree"] += 1
            elif verdict == "no":
                per_policy[policy]["disagree"] += 1
            else:
                per_policy[policy]["unsure"] += 1
        if "unsure" in (p, n):
            undecided.append(row)
        if "no" in (p, n) and not (row.get("notes") or "").strip():
            zero_notes.append(row)

    reviewed = sum(pos.values())
    if blank:
        print(f"note: {blank} rows look unfilled and were skipped")
    if not reviewed:
        raise SystemExit("no filled rows found — nothing to score")

    print(f"sheet: {args.sheet}")
    print(f"rows scored: {reviewed}\n")

    def report(label: str, counts: collections.Counter, should_be: str) -> float:
        n = sum(counts.values())
        agree = counts["yes"] if should_be == "yes" else counts["no"]
        lo, hi = wilson(agree, n)
        print(f"  {label}")
        print(f"    agreement with the corpus label: {agree}/{n} = {agree/n*100:.1f}%"
              f"   (95% CI {lo*100:.1f}-{hi*100:.1f}%)")
        print(f"    reviewer said no : {counts['no']:>4}  ({counts['no']/n*100:.1f}%)"
              f"    <- candidate mislabels")
        print(f"    reviewer unsure  : {counts['unsure']:>4}  ({counts['unsure']/n*100:.1f}%)"
              f"    <- undecidable for a human too")
        return agree / n

    agree_pos = report("POSITIVE (benign side) — 'is it authorised?'", pos, "yes")
    print()
    agree_neg = report("NEGATIVE (malicious side) — 'does it commit the policy?'", neg, "yes")

    worst = 1 - min(agree_pos, agree_neg)
    print(f"\n  worst-side disagreement rate: {worst*100:.1f}%  "
          f"(+ unsure, which a model cannot be scored against fairly)")

    print("\n  per policy (both sides pooled):")
    print(f"    {'policy':<8}{'agree':>7}{'no':>6}{'unsure':>8}{'disagree%':>11}")
    for policy in sorted(per_policy, key=lambda c: int(c.split("-")[1]) if c.startswith("P-") else 99):
        c = per_policy[policy]
        n = c["agree"] + c["disagree"] + c["unsure"]
        rate = c["disagree"] / n * 100 if n else 0
        print(f"    {policy:<8}{c['agree']:>7}{c['disagree']:>6}{c['unsure']:>8}{rate:>10.1f}%")

    if undecided:
        print(f"\n  {len(undecided)} rows where you were unsure on at least one side.")
        print("  These are evidence in their own right: a row no reviewer can decide is a row")
        print("  no model can be fairly scored on. Keep them in the sheet with notes.")
    if zero_notes:
        print(f"\n  {len(zero_notes)} rows marked 'no' with an empty notes column —")
        print("  add one line each; the notes are what makes the review citable.")

    print("\n" + "=" * 74)
    print("WHAT THIS BUYS — the ceiling on any cleaning gain")
    print("=" * 74)
    print(f"  Reviewer disagreement is an estimate of the corpus label-error rate:")
    print(f"    ~{worst*100:.1f}% (95% CI on the worst side above).")
    print(f"  A model cannot be expected to score those items correctly, so cleaning can")
    print(f"  move a metric by AT MOST about that much — and only if the model's errors")
    print(f"  land exactly on the mislabelled items.")
    print(f"  For reference, current held-out error: NLI 0.89%, contrastive 2.09%.")
    print(f"  If the measured disagreement is small (say <3%), the honest conclusion is")
    print(f"  that the residual error is model/ambiguity-limited, NOT label-limited, and")
    print(f"  no amount of cleaning will lift the reported accuracy much.")
    print(f"  Exact re-computation (not just a bound) needs per-example predictions, which")
    print(f"  the trainers do not yet log.")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    sub = parser.add_subparsers(dest="command", required=True)

    make = sub.add_parser("make", help="write a review sheet")
    make.add_argument("--dataset", default=str(C.DATASET_PATH))
    make.add_argument("--out", default=str(C.TRAINING_DIR / "review" / "sheet.csv"))
    make.add_argument("--full", action="store_true", help="every row, not a sample")
    make.add_argument("--sample", type=int, default=370, help="sample size (implementation.md §7)")
    make.add_argument("--min-per-policy", type=int, default=25)
    make.add_argument("--seed", type=int, default=42)
    make.set_defaults(func=cmd_make)

    score = sub.add_parser("score", help="score a completed sheet")
    score.add_argument("--sheet", required=True)
    score.set_defaults(func=cmd_score)

    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
