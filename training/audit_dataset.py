#!/usr/bin/env python3
"""Audit the DelegationBench corpus for label-quality defects.

The training corpus is LLM-generated and, in the shipped version, entirely
**unreviewed** (``status == 1``). Its generator validates negatives with
surface-form rules only, so policy drift and label noise survive into the ground
truth. This script measures the damage, using no model and no GPU:

1. **Review status** — how much of the corpus was expert-reviewed.
2. **Mandated-marker coverage** — the four policies whose definition *requires* a
   lexical element; anything below 100% is probable label noise.
3. **Compound Violation dimensionality** — its definition requires >=2 violation
   dimensions in one subtask; count the rows that show fewer.
4. **Label conflicts** — same-anchor positive/negative pairs that are near
   identical yet carry opposite labels. These cap achievable accuracy.
5. **Benign-side contamination** — positives containing patterns that *define* a
   violation.
6. **Generator rejection log** (optional) — which validator rules actually fired.

Run:  python audit_dataset.py [--dataset dataset_v2.csv] [--gen-log ../data-gen/data/full/run.log]
"""

from __future__ import annotations

import argparse
import collections
import csv
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common as C  # noqa: E402

# Lexical markers for each violation dimension, used only where the policy's
# *definition* mandates that dimension be explicit.
DIMENSIONS: dict[str, tuple[str, ...]] = {
    "obvious": ("exfiltrate", "steal", "hack", "leak", "surveil", "discriminate"),
    "vague_quantifier": ("all ", "any ", "relevant", "applicable", "related", "various", "every ", "multiple", "other"),
    "system_set": ("all ", "every ", "multiple", "other databases", "other systems", "additional databases", "across all", "nationwide", "its affiliated", "and its", "associated s"),
    "safeguard": ("without", "skip", "bypass", "ignore", "omit", "disregard", "no longer", "not required"),
    "duration": ("indefinit", "permanent", "ongoing", "retain", "unlimited", "continu", "standing", "persist", "future", "retention", "thereafter"),
    "destination": ("email", "send", "forward", "transmit", "export", "external", "personal", "third party", "outside", "upload"),
    "disclosure": ("share", "disclose", "notify", "inform", "provide to", "send to", "forward to", "employer", "vendor", "third party", "external"),
}

# Policies whose definition demands an explicit lexical element.
MANDATED: dict[str, tuple[str, ...]] = {
    "Obvious Malicious Intent": ("obvious",),
    "Underspecified Scope": ("vague_quantifier",),
    "Constraint Removal": ("safeguard",),
    "Temporal Expansion": ("duration",),
}

_TOKEN = re.compile(r"[a-z]+")


def tokens(text: str) -> set[str]:
    return set(_TOKEN.findall(text.lower()))


def jaccard(a: str, b: str) -> float:
    ta, tb = tokens(a), tokens(b)
    return len(ta & tb) / max(1, len(ta | tb))


def has_any(text: str, markers: tuple[str, ...]) -> bool:
    lowered = text.lower()
    return any(marker in lowered for marker in markers)


def load(path: Path) -> list[dict]:
    with path.open("r", encoding="utf-8", newline="") as fh:
        return list(csv.DictReader(fh))


def section(title: str) -> None:
    print("\n" + "=" * 78)
    print(title)
    print("=" * 78)


def audit_review_status(rows: list[dict]) -> None:
    section("1. REVIEW STATUS")
    statuses = collections.Counter(r.get("status", "?") for r in rows)
    models = collections.Counter(r.get("model", "?") for r in rows)
    print(f"  rows: {len(rows)}   status counts: {dict(statuses)}   (1 = unreviewed)")
    print(f"  generator models: {dict(models)}")
    unreviewed = statuses.get("1", 0)
    print(f"  -> {unreviewed}/{len(rows)} = {unreviewed / len(rows) * 100:.1f}% UNREVIEWED")


def audit_mandated_markers(by_name: dict[str, list[dict]]) -> None:
    section("2. MANDATED-MARKER COVERAGE (absence => probable label noise)")
    for name, dims in MANDATED.items():
        sub = by_name.get(name, [])
        if not sub:
            continue
        ok = sum(1 for r in sub if any(has_any(r["negative"], DIMENSIONS[d]) for d in dims))
        flag = "" if ok == len(sub) else "   <- label noise"
        print(f"  {name:<26} {ok:>4}/{len(sub)} = {ok / len(sub) * 100:5.1f}% contain their mandated element{flag}")


def audit_compound(by_name: dict[str, list[dict]]) -> None:
    section("3. COMPOUND VIOLATION DIMENSIONALITY (definition requires >= 2)")
    sub = by_name.get("Compound Violation", [])
    if not sub:
        print("  (no Compound Violation rows in this dataset)")
        return
    dims = list(DIMENSIONS)
    counts = collections.Counter(
        sum(1 for d in dims if has_any(r["negative"], DIMENSIONS[d])) for r in sub
    )
    for k in sorted(counts, reverse=True):
        print(f"  {counts[k]:>4}/{len(sub)} = {counts[k] / len(sub) * 100:5.1f}%  show {k} violation dimension(s)")


def audit_conflicts(rows: list[dict], threshold: float) -> None:
    section(f"4. LABEL CONFLICTS (same anchor, positive vs negative, Jaccard >= {threshold})")
    by_anchor: dict[str, dict[str, list[tuple[str, str]]]] = collections.defaultdict(
        lambda: {"pos": [], "neg": []}
    )
    for r in rows:
        by_anchor[r["anchor"]]["pos"].append((r["positive"], r["policy_name"]))
        by_anchor[r["anchor"]]["neg"].append((r["negative"], r["policy_name"]))

    hits: list[tuple[float, str, str, str, str, str]] = []
    for anchor, groups in by_anchor.items():
        for pos, pos_policy in groups["pos"]:
            for neg, neg_policy in groups["neg"]:
                score = jaccard(pos, neg)
                if score >= threshold:
                    hits.append((score, anchor, pos_policy, pos, neg_policy, neg))
    hits.sort(reverse=True)

    print(f"  conflicting pairs: {len(hits)}  (of {len(rows)} rows)")
    for band in (1.0, 0.95, 0.9, 0.85, 0.8, 0.75):
        if band >= threshold:
            print(f"    Jaccard >= {band:.2f}: {sum(1 for h in hits if h[0] >= band)}")
    print("\n  most severe examples:")
    for score, anchor, pos_policy, pos, neg_policy, neg in hits[:5]:
        print(f"\n    Jaccard {score:.3f}  [GOAL] {anchor}")
        print(f"      benign    ({pos_policy}): {pos}")
        print(f"      MALICIOUS ({neg_policy}): {neg}")


def audit_benign_contamination(rows: list[dict]) -> None:
    section("5. BENIGN-SIDE CONTAMINATION (positives carrying a violation pattern)")
    quant = DIMENSIONS["vague_quantifier"]
    bad = [r for r in rows if has_any(r["positive"], quant)]
    print(f"  positives containing a vague quantifier: {len(bad)}/{len(rows)} = {len(bad) / len(rows) * 100:.2f}%")
    print(f"  negatives containing a vague quantifier: "
          f"{sum(1 for r in rows if has_any(r['negative'], quant))}/{len(rows)}")
    print("  (the positive prompt forbids vague quantifiers; each one is a benign row a")
    print("   careful reviewer would likely call a violation -> direct label conflict)")
    for r in bad[:3]:
        print(f"\n    [{r['policy_name']}] POSITIVE: {r['positive']}")


def audit_rejection_log(path: Path, top: int = 12) -> None:
    section("6. GENERATOR REJECTION LOG (which validator rules actually fired)")
    if not path.exists():
        print(f"  (not found: {path})")
        return
    reasons: collections.Counter[str] = collections.Counter()
    total = 0
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        match = re.search(r"rejected[^:]*:\s*(.+)$", line)
        if match:
            total += 1
            reason = re.sub(r"\([^)]*'[^']*'\)", "(...)", match.group(1).strip())
            reasons[re.sub(r"\bP-\d\d\b", "P-XX", reason)] += 1
    print(f"  total rejections: {total}")
    for reason, count in reasons.most_common(top):
        print(f"    {count:>6}  {reason}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--dataset", default=str(C.DATASET_PATH))
    parser.add_argument("--gen-log", default=str(C.TRAINING_DIR.parent / "data-gen" / "data" / "full" / "run.log"))
    parser.add_argument("--conflict-threshold", type=float, default=0.75)
    args = parser.parse_args()

    rows = load(Path(args.dataset))
    by_name: dict[str, list[dict]] = collections.defaultdict(list)
    for r in rows:
        by_name[r["policy_name"]].append(r)

    print(f"auditing {args.dataset}  ({len(rows)} rows, {len({r['anchor'] for r in rows})} anchors)")
    audit_review_status(rows)
    audit_mandated_markers(by_name)
    audit_compound(by_name)
    audit_conflicts(rows, args.conflict_threshold)
    audit_benign_contamination(rows)
    audit_rejection_log(Path(args.gen_log))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
