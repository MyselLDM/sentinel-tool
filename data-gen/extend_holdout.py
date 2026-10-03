#!/usr/bin/env python3
"""Add benign + neutral control rows to the frozen corpus v3 holdout.

Why
---
``holdout_paraphrases.csv`` is 26 rows, **all label 0** (the human-authored
adversarial paraphrases). A benchmark that is entirely malicious cannot detect
over-flagging: a model that blocks everything scores 100% on it. This script
generates benign (label 1) and neutral (label 2) rows for the *same goals*, so the
holdout estimates TPR and FPR on equal denominators.

Guarantees
----------
* **Disjoint from training.** Every candidate is rejected if it reaches
  Jaccard >= ``--max-train-jaccard`` (default 0.75) against ANY training subtask,
  against the existing holdout, or against an already-accepted candidate. The
  frozen paraphrases stay untouched.
* **Judged**, using the ``authorised`` gate - a holdout control row that is not
  actually authorised would corrupt the FPR estimate.
* **Incremental write**: ``holdout_extra.csv`` is rewritten after every accepted
  row, so a crash loses at most one row.

Output is folded into ``holdout_clean.csv`` by ``apply_corpus_cleanup.py``.

Usage
-----
    python extend_holdout.py --endpoint http://127.0.0.1:8081/v1/chat/completions \
        --model <generator> --judge-endpoint http://127.0.0.1:8082/v1/chat/completions \
        --judge-model <judge>

    # pilot
    python extend_holdout.py --limit-goals 2 ...
"""

from __future__ import annotations

import argparse
import collections
import csv
import os
import random
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = HERE / "data" / "corpus_v3"
HOLDOUT_PATH = OUT / "holdout_paraphrases.csv"
TRAIN_PATHS = [OUT / "seed.csv", OUT / "generated.csv"]
EXTRA_PATH = OUT / "holdout_extra.csv"

sys.path.insert(0, str(HERE))
import make_corpus_v3 as M  # noqa: E402

FIELDS = ["id", "goal", "subtask", "label", "family", "harm_category", "pair_id",
          "stratum", "split", "source", "notes"]

KINDS = [("benign", "entailment", 1, "benign_entailment", "hb"),
         ("neutral", "neutral", 2, "benign_neutral", "hn")]


def read_csv(path: Path) -> list[dict]:
    if not path.exists():
        return []
    with path.open(encoding="utf-8") as fh:
        return list(csv.DictReader(fh))


def max_jaccard(text: str, corpus: list[str]) -> tuple[float, str]:
    best, hit = 0.0, ""
    for other in corpus:
        if not other:
            continue
        j = M.jaccard(text, other)
        if j > best:
            best, hit = j, other
    return best, hit


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    g = p.add_argument_group("generator")
    g.add_argument("--endpoint", default=os.environ.get(
        "SENTINEL_LLM_ENDPOINT", "http://127.0.0.1:8081/v1/chat/completions"))
    g.add_argument("--model", default=os.environ.get("SENTINEL_LLM_MODEL", "qwen2.5-14b-instruct"))
    j = p.add_argument_group("judge")
    j.add_argument("--judge-endpoint", default=None,
                   help="defaults to --endpoint (self-judge); point at a DIFFERENT model for real verification")
    j.add_argument("--judge-model", default=None, help="defaults to --model")
    s = p.add_argument_group("sampling")
    s.add_argument("--temperature", type=float, default=0.9)
    s.add_argument("--top-p", type=float, default=0.95)
    s.add_argument("--min-p", type=float, default=0.0)
    s.add_argument("--top-k", type=int, default=40)
    s.add_argument("--repeat-penalty", type=float, default=1.05)
    s.add_argument("--no-think", action="store_true")
    s.add_argument("--no-judge", action="store_true")
    j.add_argument("--judge-fail-closed", action="store_true",
                   help="treat a judge outage as a REJECTION instead of accepting the row"
                        " unverified; use for holdout/benchmark rows")
    r = p.add_argument_group("run")
    r.add_argument("--seed", type=int, default=42)
    r.add_argument("--retries", type=int, default=4,
                   help="attempts per row; the rejection reason is fed back into the next prompt")
    r.add_argument("--max-train-jaccard", type=float, default=0.75,
                   help="reject a candidate at/above this similarity to any training subtask")
    r.add_argument("--limit-goals", type=int, default=0, help="pilot on the first N goals (0 = all)")
    r.add_argument("--dry-run", action="store_true")
    r.add_argument("--verbose", action="store_true")
    return p


def main() -> int:
    args = build_parser().parse_args()
    if args.judge_endpoint is None:
        args.judge_endpoint = args.endpoint
    if args.judge_model is None:
        args.judge_model = args.model

    holdout = read_csv(HOLDOUT_PATH)
    if not holdout:
        print(f"missing {HOLDOUT_PATH}", file=sys.stderr)
        return 1
    train = [r for p in TRAIN_PATHS for r in read_csv(p)]

    # mirror the malicious rows' goal distribution: same goals, equal denominators
    per_goal_malicious = collections.OrderedDict(
        (g, n) for g, n in collections.Counter(r["goal"] for r in holdout).items())
    if args.limit_goals:
        per_goal_malicious = collections.OrderedDict(list(per_goal_malicious.items())[:args.limit_goals])

    print(f"holdout control generation: {len(per_goal_malicious)} goals")
    print(f"  generator : {args.model}  @ {args.endpoint}")
    print(f"  judge     : {args.judge_model}  @ {args.judge_endpoint}")
    print(f"  plan      : {sum(per_goal_malicious.values())} benign + "
          f"{sum(per_goal_malicious.values())} neutral control rows")

    rng = random.Random(args.seed)
    train_texts = [r["subtask"] for r in train] + [r["subtask"] for r in holdout]

    rows: list[dict] = []
    seen: set[str] = set()
    counter: collections.Counter = collections.Counter()
    started = time.time()

    def flush() -> None:
        with EXTRA_PATH.open("w", newline="", encoding="utf-8") as fh:
            w = csv.DictWriter(fh, fieldnames=FIELDS)
            w.writeheader()
            w.writerows(rows)

    fmt = {"hb": lambda i: f"hb{i:04d}", "hn": lambda i: f"hn{i:04d}"}

    for goal, n_mal in per_goal_malicious.items():
        if not args.dry_run:
            print(f"\n  [{goal}]")

        for _kind_label, kind, label, family, prefix in KINDS:
            for cell in range(n_mal):
                correction = None
                accepted = None
                for attempt in range(args.retries):
                    user = M.single_prompt(goal, kind, None, correction)
                    if args.dry_run:
                        print(f"\n--- DRY RUN {kind} [{goal}] ---\n{M.SINGLE_SYSTEM}\n\n{user}")
                        break
                    result = M.call(M.SINGLE_SYSTEM, user, args, rng.randrange(1 << 30))
                    if not result:
                        correction = "endpoint returned nothing"
                        counter["endpoint_empty"] += 1
                        continue
                    text = M.P.normalise(str(result.get("subtask", "")))
                    problem = M.usable(text, goal)
                    if not problem and text.lower() in seen:
                        problem = "duplicate within the holdout additions"
                    if not problem:
                        best, hit = max_jaccard(text, train_texts)
                        if best >= args.max_train_jaccard:
                            problem = (f"too similar to a training row (Jaccard {best:.2f} >= "
                                       f"{args.max_train_jaccard}): {hit[:60]!r}")
                    if not problem:
                        ok, why = M.maybe_judge(M.JUDGE_AUTHORISED_SYSTEM, "authorised",
                                                goal, text, args, rng.randrange(1 << 30))
                        if not ok:
                            problem = f"not authorised ({why})"
                    if problem:
                        counter[f"{kind}_rejected"] += 1
                        correction = problem
                        if args.verbose:
                            print(f"      reject {kind} {attempt+1}/{args.retries}: {problem}")
                        continue
                    accepted = text
                    break

                if accepted is None:
                    if not args.dry_run:
                        counter[f"{kind}_exhausted"] += 1
                    continue
                seen.add(accepted.lower())
                counter[kind] += 1
                i = counter[kind]
                rows.append({
                    "id": fmt[prefix](i), "goal": goal, "subtask": accepted, "label": label,
                    "family": family, "harm_category": "", "pair_id": "",
                    "stratum": "control", "split": "holdout",
                    "source": "v3-holdout-gen",
                    "notes": f"holdout {kind} control, generated for FPR measurement",
                })
                if not args.dry_run:
                    flush()  # incremental: a crash costs at most this row

    if args.dry_run:
        print("\n(dry run - nothing written)")
        return 0

    flush()
    elapsed = time.time() - started
    print(f"\nwrote {EXTRA_PATH.relative_to(HERE)}  ({len(rows)} rows)")
    print(f"counters: {dict(counter)}")

    hc = M.JUDGE_STATS
    calls = max(1, hc.get("calls", 0))
    failure = hc.get("unavailable", 0) / calls
    print(f"judge health: {dict(hc)}  -> failure rate {failure:.1%}")
    if failure > M.JUDGE_MAX_FAILURE_RATE:
        print(f"ABORT: judge failure rate above {M.JUDGE_MAX_FAILURE_RATE:.0%}; "
              "the control rows may be unverified", file=sys.stderr)
        return 1

    # disjointness evidence
    worst = 0.0
    for r in rows:
        j, _ = max_jaccard(r["subtask"], [t for t in train_texts])
        worst = max(worst, j)
    print(f"max Jaccard of any new row vs train/holdout: {worst:.3f} "
          f"(guard {args.max_train_jaccard})")
    print(f"elapsed: {elapsed/60:.1f} min")
    print("\nnext: run apply_corpus_cleanup.py to fold these into holdout_clean.csv")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
