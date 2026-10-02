#!/usr/bin/env python3
"""Generate near-miss pairs for a harm category the main run missed.

Why
---
``gather`` selected its cells with ``harm_cycle[i % len(HARM_CATEGORIES)]`` and
``harm_cycle[:per_cell]``, restarting at index 0 for every goal. With
``--per-cell 4`` and 5 categories, index 4 was unreachable, so the v3 run produced
**zero ``corruption`` rows** across all 12 goals - the family was represented only
by the 6 seed rows. ``make_corpus_v3.gather`` now takes ``goal_offset`` and rotates
(verified: 5/5 categories within 5 goals), but the existing corpus still has the
gap, which this backfills without regenerating anything else.

Writes ``generated_extra.csv`` (same schema as ``generated.csv``); fold it in by
running ``apply_corpus_cleanup.py``, which reads it as an additional train source.

Usage
-----
    python add_missing_harm.py --harm corruption --pairs 10 \
        --endpoint http://127.0.0.1:8081/v1/chat/completions --model <gen> \
        --judge-endpoint http://127.0.0.1:8082/v1/chat/completions --judge-model <judge>
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
EXTRA_PATH = OUT / "generated_extra.csv"
# goals come from the seed; `seen` is seeded from every existing subtask so a
# backfilled row can never duplicate one already in the corpus.
SEED_PATH = OUT / "seed.csv"
SEEN_PATHS = [SEED_PATH, OUT / "generated.csv", OUT / "holdout_paraphrases.csv",
              OUT / "holdout_extra.csv"]

sys.path.insert(0, str(HERE))
import make_corpus_v3 as M  # noqa: E402


def read_csv(path: Path) -> list[dict]:
    if not path.exists():
        return []
    with path.open(encoding="utf-8") as fh:
        return list(csv.DictReader(fh))


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--harm", default="corruption", choices=sorted(M.HARM_CATEGORIES),
                   help="harm category to backfill")
    p.add_argument("--pairs", type=int, default=10, help="number of pairs to produce")
    g = p.add_argument_group("generator")
    g.add_argument("--endpoint", default=os.environ.get(
        "SENTINEL_LLM_ENDPOINT", "http://127.0.0.1:8081/v1/chat/completions"))
    g.add_argument("--model", default=os.environ.get("SENTINEL_LLM_MODEL", "qwen2.5-14b-instruct"))
    j = p.add_argument_group("judge")
    j.add_argument("--judge-endpoint", default=None)
    j.add_argument("--judge-model", default=None)
    s = p.add_argument_group("sampling")
    s.add_argument("--temperature", type=float, default=0.9)
    s.add_argument("--top-p", type=float, default=0.95)
    s.add_argument("--min-p", type=float, default=0.0)
    s.add_argument("--top-k", type=int, default=40)
    s.add_argument("--repeat-penalty", type=float, default=1.05)
    s.add_argument("--no-think", action="store_true")
    s.add_argument("--no-judge", action="store_true")
    r = p.add_argument_group("run")
    r.add_argument("--min-jaccard", type=float, default=0.55)
    r.add_argument("--seed", type=int, default=42)
    r.add_argument("--retries", type=int, default=4)
    r.add_argument("--out", default=str(EXTRA_PATH))
    r.add_argument("--dry-run", action="store_true")
    r.add_argument("--verbose", action="store_true")
    return p


def main() -> int:
    args = build_parser().parse_args()
    if args.judge_endpoint is None:
        args.judge_endpoint = args.endpoint
    if args.judge_model is None:
        args.judge_model = args.model

    seed_rows = read_csv(SEED_PATH)
    goals = list(dict.fromkeys(r["goal"] for r in seed_rows))
    if not goals:
        print(f"missing goals in {SEED_PATH}", file=sys.stderr)
        return 1

    seen = {r["subtask"].strip().lower()
            for p in SEEN_PATHS for r in read_csv(p) if r.get("subtask")}
    print(f"backfill {args.harm}: {args.pairs} pairs over {len(goals)} goals")
    print(f"  generator : {args.model}  @ {args.endpoint}")
    print(f"  judge     : {args.judge_model}  @ {args.judge_endpoint}")
    print(f"  seen (existing subtasks, dedup): {len(seen)}")

    rng = random.Random(args.seed)
    rows: list[dict] = []
    counter: collections.Counter = collections.Counter()
    started = time.time()

    def flush() -> None:
        Path(args.out).parent.mkdir(parents=True, exist_ok=True)
        with Path(args.out).open("w", newline="", encoding="utf-8") as fh:
            w = csv.DictWriter(fh, fieldnames=M.FIELDS, extrasaction="ignore")
            w.writeheader()
            w.writerows(rows)

    made = 0
    gi = 0
    while made < args.pairs:
        goal = goals[gi % len(goals)]
        gi += 1
        if args.dry_run:
            print(f"\n--- DRY RUN pair [{goal} / {args.harm}] ---\n"
                  f"{M.PAIR_SYSTEM}\n\n{M.pair_prompt(goal, args.harm)}")
            made += 1
            continue

        correction = None
        accepted = None
        for attempt in range(args.retries):
            accepted, problem = M._attempt_pair(goal, args.harm, correction, args, rng, seen)
            if accepted:
                break
            counter["pair_rejected"] += 1
            correction = problem
            if args.verbose:
                print(f"      reject pair {attempt + 1}/{args.retries}: {problem}")
        if not accepted:
            counter["pair_exhausted"] += 1
            made += 1  # don't spin forever on a goal the model won't satisfy
            continue

        benign, violation, cue, why = accepted
        made += 1
        pair_id = f"px{made:04d}"
        seen.add(benign.lower())
        seen.add(violation.lower())
        rows.append({
            "id": f"gx{made:05d}", "goal": goal, "subtask": benign, "label": 1,
            "family": "benign_entailment", "harm_category": args.harm, "pair_id": pair_id,
            "stratum": "near_miss", "split": "train", "source": "generated",
            "notes": f"paired with the violation; cue in sibling: {cue!r}",
        })
        rows.append({
            "id": f"gx{made:05d}", "goal": goal, "subtask": violation, "label": 0,
            "family": "purpose_violation", "harm_category": args.harm, "pair_id": pair_id,
            "stratum": "near_miss", "split": "train", "source": "generated",
            "notes": f"cue: {cue!r} | {why}",
        })
        counter["pairs"] += 1
        flush()  # incremental
        print(f"    {counter['pairs']}/{args.pairs} {args.harm} pairs  [{goal}]")

    if args.dry_run:
        print("\n(dry run - nothing written)")
        return 0

    flush()
    print(f"\nwrote {Path(args.out).relative_to(HERE)}  ({len(rows)} rows)")
    print(f"counters: {dict(counter)}")
    hc = M.JUDGE_STATS
    calls = max(1, hc.get("calls", 0))
    failure = hc.get("unavailable", 0) / calls
    print(f"judge health: {dict(hc)}  -> failure rate {failure:.1%}")
    if failure > M.JUDGE_MAX_FAILURE_RATE:
        print(f"ABORT: judge failure rate above {M.JUDGE_MAX_FAILURE_RATE:.0%}; "
              "these rows may be unverified", file=sys.stderr)
        return 1
    print(f"elapsed: {(time.time() - started)/60:.1f} min")
    print("\nnext: run apply_corpus_cleanup.py to fold these into corpus_clean.csv")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
