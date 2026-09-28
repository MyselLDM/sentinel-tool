#!/usr/bin/env python3
"""Build ``dataset_v2.csv`` from ``dataset.csv``.

Transform: **drop the P-10 (Replay Exploitation) family**, then renumber the
remaining policy codes so they are contiguous again (``P-11 -> P-10``).
Everything else — anchors, subtasks, domains, strategies, other columns — is
copied through unchanged. ``dataset.csv`` is left untouched.

Why drop it: Replay Exploitation negatives are single-referent swaps
("the specified student" -> "another specified student"), which are arguably
entailed by the goal text. It accounts for ~75% of every remaining error in both
models (TPR ~84% vs >=98.4% for every other policy).

Run:  python make_dataset_v2.py
"""

from __future__ import annotations

import csv
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent
SRC = HERE / "dataset.csv"
DST = HERE / "dataset_v2.csv"
DROP_POLICY = "P-10"


def policy_number(code: str) -> int:
    try:
        return int(code.split("-")[-1])
    except ValueError:
        return 10**6  # unknown codes sort last


def main() -> int:
    with SRC.open("r", encoding="utf-8", newline="") as fh:
        reader = csv.DictReader(fh)
        header = list(reader.fieldnames or [])
        rows = list(reader)

    if not rows:
        raise SystemExit(f"no rows read from {SRC}")

    before = Counter(r["policy_violation"] for r in rows)
    kept = [r for r in rows if r["policy_violation"] != DROP_POLICY]
    if len(kept) == len(rows):
        raise SystemExit(f"{DROP_POLICY} not found — nothing to drop")

    # Renumber the surviving codes in their original order.
    remaining = sorted({r["policy_violation"] for r in kept}, key=policy_number)
    remap = {old: f"P-{i:02d}" for i, old in enumerate(remaining, start=1)}

    # Sanity: a code must map to exactly one policy_name.
    names: dict[str, set[str]] = {}
    for row in kept:
        names.setdefault(row["policy_violation"], set()).add(row["policy_name"])
    for code, found in names.items():
        if len(found) != 1:
            raise SystemExit(f"policy {code} has multiple names: {sorted(found)}")

    for row in kept:
        row["policy_violation"] = remap[row["policy_violation"]]

    with DST.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=header)
        writer.writeheader()
        writer.writerows(kept)

    after = Counter(r["policy_violation"] for r in kept)
    print(f"{SRC.name}: {len(rows)} rows  ->  {DST.name}: {len(kept)} rows  (dropped {len(rows) - len(kept)})")
    print("\npolicy remap:")
    for old in sorted(before, key=policy_number):
        if old == DROP_POLICY:
            print(f"  {old}  {sorted(names.get(old, {'(dropped)'}))[0]:<26} DROPPED  ({before[old]} rows)")
        else:
            new = remap[old]
            label = sorted(names[old])[0]
            moved = "" if new == old else f"  ->  {new}"
            print(f"  {old}  {label:<26} {before[old]:>4} rows{moved}")

    print("\nresulting distribution:")
    for code in sorted(after, key=policy_number):
        label = sorted(names[code])[0] if code in names else ""
        # label lookup after renumbering
        label = next((sorted(names[o])[0] for o, n in remap.items() if n == code), label)
        print(f"  {code}  {label:<26} {after[code]:>4} rows")
    print(f"\nunique anchors: {len({r['anchor'] for r in kept})}")
    print(f"wrote {DST}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
