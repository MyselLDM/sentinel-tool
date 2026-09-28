#!/usr/bin/env python3
"""Flag questionable rows in the corpus for human review.

The corpus is LLM-generated. ``audit_dataset.py`` measures the defects at corpus
level; this script turns them into a **row-level work list** a reviewer can work
through. Writes:

    review/flagged_rows.csv   one row per flagged corpus row, with reasons
    review/summary.md         counts per reason + a readable summary

Nothing is modified — this is read-only triage. Feed the CSV back after review
and we can apply the verdicts (see ``--apply-review`` on the roadmap, not yet
implemented).

Reasons emitted (severity order):

  H1 duplicate_label_conflict       same anchor, positive and negative are the
                                    SAME text with OPPOSITE labels
  H2 near_duplicate_label_conflict  same anchor, positive/negative Jaccard >= 0.90
  H3 compound_missing_dimensions    Compound Violation shows < 2 violation dimensions
  M1 benign_contains_violation      positive carries a pattern that DEFINES a violation
  M2 negative_missing_mandated      P-01/P-03/P-06/P-07 negative lacks its required element
  M3 no_detectable_violation        negative shows none of its policy's dimensions
  L1 entity_drift                   negative names an entity absent from the anchor
  L2 moderate_label_conflict        same anchor, Jaccard 0.75-0.90

Run:  python flag_questionable_rows.py [--dataset dataset_v2.csv] [--min-jaccard 0.75]
"""

from __future__ import annotations

import argparse
import collections
import csv
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common as C  # noqa: E402
from audit_dataset import COMPOUND_DIMENSIONS, DIMENSIONS, MANDATED, has_any, jaccard  # noqa: E402

REASONS: dict[str, tuple[str, int, str]] = {
    "H1_duplicate_label_conflict": ("high", 0, "identical text, opposite labels (same anchor)"),
    "H2_near_duplicate_label_conflict": ("high", 1, "Jaccard >= 0.90 vs an opposite-label sibling"),
    "H3_compound_missing_dimensions": ("high", 2, "Compound Violation shows < 2 violation dimensions"),
    "M1_benign_contains_violation": ("medium", 3, "positive contains a pattern that defines a violation"),
    "M2_negative_missing_mandated": ("medium", 4, "negative lacks the element its policy requires"),
    "M3_no_detectable_violation": ("medium", 5, "negative shows none of its policy's dimensions"),
    "L1_entity_drift": ("low", 6, "negative names an entity absent from the anchor"),
    "L2_moderate_label_conflict": ("low", 7, "Jaccard 0.75-0.90 vs an opposite-label sibling"),
}

# Policy -> the dimension(s) its definition is built on (for M3).
# Privilege Escalation shares the permanence vocabulary with Temporal Expansion --
# a real property of the taxonomy, not an oversight.
EXPECTED_DIMENSION: dict[str, tuple[str, ...]] = {
    "Obvious Malicious Intent": ("obvious",),
    "Scope Creep": ("system_set",),
    "Underspecified Scope": ("vague_quantifier",),
    "Constraint Removal": ("safeguard",),
    "Temporal Expansion": ("duration",),
    "Data Exfiltration": ("destination",),
    "Unauthorized Sharing": ("disclosure",),
    "Resource Expansion": ("system_set",),
    "Privilege Escalation": ("duration",),
    "Replay Exploitation": ("different_subject",),
}

# Entities that make a P-01 / any negative obviously about the wrong subject.
ENTITIES = (
    "veteran", "student", "patient", "taxpayer", "employee", "citizen", "applicant",
    "customer", "borrower", "household", "provider", "claimant", "beneficiary",
)

CSV_FIELDS = [
    "row_index", "data_number", "severity", "reasons", "detail",
    "domain", "anchor_index", "sample_index", "policy_violation", "policy_name",
    "strategy", "anchor", "positive", "negative",
    "reviewer_verdict", "reviewer_notes",
]


@dataclass
class Flag:
    reasons: list[str] = field(default_factory=list)
    detail: list[str] = field(default_factory=list)

    def add(self, reason: str, detail: str = "") -> None:
        if reason not in self.reasons:
            self.reasons.append(reason)
        if detail:
            self.detail.append(detail)


def worst_severity(reasons: list[str]) -> str:
    return min((REASONS[r][0] for r in reasons), key=lambda s: {"high": 0, "medium": 1, "low": 2}[s])


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--dataset", default=str(C.DATASET_PATH))
    parser.add_argument("--out-dir", default=str(C.TRAINING_DIR / "review"))
    parser.add_argument("--min-jaccard", type=float, default=0.75)
    parser.add_argument("--include-low", action="store_true", help="also emit low-severity flags")
    args = parser.parse_args()

    with Path(args.dataset).open("r", encoding="utf-8", newline="") as fh:
        rows = list(csv.DictReader(fh))

    flags: dict[int, Flag] = collections.defaultdict(Flag)

    # ── Contradictions: opposite-label siblings within one anchor ──
    by_anchor: dict[str, dict[str, list[int]]] = collections.defaultdict(lambda: {"pos": [], "neg": []})
    for index, row in enumerate(rows):
        by_anchor[row["anchor"]]["pos"].append(index)
        by_anchor[row["anchor"]]["neg"].append(index)

    for groups in by_anchor.values():
        for p_index in groups["pos"]:
            for n_index in groups["neg"]:
                p, n = rows[p_index], rows[n_index]
                score = jaccard(p["positive"], n["negative"])
                if score < args.min_jaccard:
                    continue
                if score >= 1.0:
                    reason = "H1_duplicate_label_conflict"
                elif score >= 0.90:
                    reason = "H2_near_duplicate_label_conflict"
                else:
                    reason = "L2_moderate_label_conflict"
                detail = (
                    f"Jaccard={score:.3f} with data_number={n['data_number']} "
                    f"({n['policy_name']})"
                )
                flags[p_index].add(reason, detail)
                flags[n_index].add(reason, f"Jaccard={score:.3f} with data_number={p['data_number']} (benign sibling)")

    # ── Row-local defects ──
    for index, row in enumerate(rows):
        name, policy = row["policy_name"], row["policy_violation"]

        if name in MANDATED and not any(has_any(row["negative"], DIMENSIONS[d]) for d in MANDATED[name]):
            flags[index].add("M2_negative_missing_mandated", f"needs one of {MANDATED[name]}")

        if has_any(row["positive"], DIMENSIONS["vague_quantifier"]):
            flags[index].add("M1_benign_contains_violation", "positive contains a vague quantifier")

        if name == "Compound Violation":
            dims = sum(1 for d in COMPOUND_DIMENSIONS.values() if has_any(row["negative"], d))
            if dims < 2:
                flags[index].add("H3_compound_missing_dimensions", f"only {dims} dimension(s) detected")

        expected = EXPECTED_DIMENSION.get(name)
        if expected and not any(has_any(row["negative"], DIMENSIONS[d]) for d in expected):
            flags[index].add("M3_no_detectable_violation", f"no {'/'.join(expected)} marker in the negative")

        anchor_lower = row["anchor"].lower()
        drifted = [e for e in ENTITIES if e in row["negative"].lower() and e not in anchor_lower]
        if drifted:
            flags[index].add("L1_entity_drift", f"names {drifted} not present in the anchor")

    # ── Emit ──
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    out_csv = out_dir / "flagged_rows.csv"

    emitted = []
    for index, flag in flags.items():
        severity = worst_severity(flag.reasons)
        if severity == "low" and not args.include_low:
            # low flags stay visible in the summary but out of the default work list
            continue
        ordered = sorted(flag.reasons, key=lambda r: REASONS[r][1])
        row = rows[index]
        emitted.append({
            "row_index": index,
            "data_number": row["data_number"],
            "severity": severity,
            "reasons": ";".join(ordered),
            "detail": " | ".join(flag.detail),
            "domain": row["domain"],
            "anchor_index": row["anchor_index"],
            "sample_index": row["sample_index"],
            "policy_violation": row["policy_violation"],
            "policy_name": row["policy_name"],
            "strategy": row["strategy"],
            "anchor": row["anchor"],
            "positive": row["positive"],
            "negative": row["negative"],
            "reviewer_verdict": "",
            "reviewer_notes": "",
        })
    emitted.sort(key=lambda r: ({"high": 0, "medium": 1, "low": 2}[r["severity"]], int(r["row_index"])))

    with out_csv.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=CSV_FIELDS)
        writer.writeheader()
        writer.writerows(emitted)

    counts = collections.Counter()
    for flag in flags.values():
        for reason in flag.reasons:
            counts[reason] += 1
    severity_counts = collections.Counter(worst_severity(f.reasons) for f in flags.values())

    summary = out_dir / "summary.md"
    lines = [
        "# Corpus review work list",
        "",
        f"Source: `{Path(args.dataset).name}` ({len(rows)} rows, {len(by_anchor)} anchors)",
        f"Flagged rows: **{len(flags)}** ({len(flags) / len(rows) * 100:.1f}%)"
        f"  |  in work list (high+medium): **{len(emitted)}**",
        "",
        "| severity | flagged rows |",
        "| --- | --- |",
    ]
    for severity in ("high", "medium", "low"):
        lines.append(f"| {severity} | {severity_counts.get(severity, 0)} |")
    lines += ["", "| reason | severity | rows | what it means |", "| --- | --- | --- | --- |"]
    for reason, (severity, _rank, description) in sorted(REASONS.items(), key=lambda kv: kv[1][1]):
        lines.append(f"| `{reason}` | {severity} | {counts.get(reason, 0)} | {description} |")
    lines += [
        "",
        "## How to read this (important)",
        "",
        "These are **lexical triage signals, not defect rates.** The marker tables",
        "cannot see meaning, and we measured how badly they over-flag: applied as a",
        "rejection gate they failed 28.8% of the corpus, including **91.3% of all",
        "P-02 (Scope Creep)** — rows a reviewer passed as legitimate scope creep",
        "(\"...and associated student records system\"). So treat a flag as",
        "\"a human should look at this\", not as \"this is wrong\". Precision of each",
        "reason is unmeasured; `L1`/`M3`/`H3` in particular are heuristic.",
        "",
        "For the same reason, do not quote these counts as corpus defect rates in the",
        "thesis. Rows that need semantic judgement (e.g. a subject swap such as",
        "\"...the current 9th-grade year\") carry no lexical marker at all and appear",
        "here only by accident.",
        "",
        "## How to review",
        "",
        "1. Open `flagged_rows.csv` (Excel/Sheets is fine).",
        "2. For each row decide: keep the label, correct it, or drop the row.",
        "   Put that in `reviewer_verdict` (`keep` / `relabel:<policy>` / `drop`)",
        "   and any rationale in `reviewer_notes`.",
        "3. `reasons` and `detail` explain why the row was flagged; `data_number`",
        "   uniquely identifies it in the source dataset.",
        "",
        "Low-severity flags are excluded from the CSV by default; rerun with",
        "`--include-low` to include them.",
        "",
    ]
    summary.write_text("\n".join(lines), encoding="utf-8")

    print(f"audited {args.dataset}: {len(rows)} rows, {len(by_anchor)} anchors")
    print(f"flagged {len(flags)} rows ({len(flags) / len(rows) * 100:.1f}%)"
          f"  -> work list {len(emitted)} rows (high+medium)")
    for severity in ("high", "medium", "low"):
        print(f"    {severity:<7} {severity_counts.get(severity, 0)}")
    print("  by reason:")
    for reason, count in counts.most_common():
        print(f"    {count:>4}  {reason}")
    print(f"\nwrote {out_csv}")
    print(f"wrote {summary}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
