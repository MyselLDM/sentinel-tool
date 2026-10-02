#!/usr/bin/env python3
"""Extract the original 190-example corpus from the old NLI script into a corpus file.

Source: ``training/old-training/sentinelagent_nli_finetune.py`` — the only
hand-authored, *purpose-based* corpus in the repo. Its 26 "adversarial
paraphrases" are euphemistic violations that read as normal casework, which is why
the off-the-shelf NLI collapsed on them (see REPORT/notes). Everything here is
deterministic: no LLM, no network.

Outputs (both written under ``data/corpus_v3/``):

    seed.csv                 the 164 rows that may be trained on
    holdout_paraphrases.csv  the 26 frozen adversarial paraphrases (TEST ONLY)

Schema (the corpus-v3 contract; see CORPUS_V3.md):

    id, goal, subtask, label, family, harm_category, pair_id, stratum, split,
    source, notes

  label            0 = malicious (contradiction), 1 = entailment (benign),
                   2 = neutral (benign, related but indirect)
  family           benign_entailment | benign_neutral | explicit_violation |
                   adversarial_paraphrase
  harm_category    exfiltration | bias | privilege_escalation | surveillance |
                   corruption | mixed   (for violations); '' for benign
  pair_id          reserved for the matched near-identical benign/violation pairs
                   that make_corpus_v3.py creates (empty for the original rows)
  stratum          easy | hard | near_miss
  split            train | holdout

Run:  python extract_old_corpus.py
"""

from __future__ import annotations

import ast
import collections
import csv
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
SOURCE = HERE.parent / "training" / "old-training" / "sentinelagent_nli_finetune.py"
OUT_DIR = HERE / "data" / "corpus_v3"

FIELDS = [
    "id", "goal", "subtask", "label", "family", "harm_category", "pair_id",
    "stratum", "split", "source", "notes",
]

# Section comment -> (family, harm_category, stratum)
HARM_SECTIONS = {
    "data exfiltration": ("exfiltration", "easy"),
    "bias injection": ("bias", "easy"),
    "privilege escalation": ("privilege_escalation", "easy"),
    "surveillance": ("surveillance", "easy"),
    "corruption / tampering": ("corruption", "easy"),
    "adversarial paraphrases": ("mixed", "hard"),
}


def _literal_assignments(path: Path) -> dict[str, object]:
    """Return module-level literal assignments (GOALS, TRAINING_DATA, ...)."""
    tree = ast.parse(path.read_text(encoding="utf-8"))
    found: dict[str, object] = {}
    for node in tree.body:
        if isinstance(node, ast.Assign):
            name = getattr(node.targets[0], "id", None)
            if name in ("GOALS", "TRAINING_DATA"):
                found[name] = ast.literal_eval(node.value)
    for required in ("GOALS", "TRAINING_DATA"):
        if required not in found:
            raise SystemExit(f"{required} not found in {path}")
    return found


def _section_map(path: Path) -> list[str]:
    """For each TRAINING_DATA entry, the nearest preceding section header.

    The source labels its groups with comments ('# Data exfiltration (8)',
    '# Adversarial paraphrases (26) - ...'), so the category is read from the
    file rather than guessed from position. Entries are ordered 1, 2, 0; the
    label-0 groups come last (eval_contrastive.py:44 documents the layout).
    """
    text = path.read_text(encoding="utf-8")
    start = text.index("TRAINING_DATA = [")
    end = text.index("def format_for_nli")
    current = "benign entailment"
    sections: list[str] = []
    for line in text[start:end].splitlines():
        stripped = line.strip()
        if stripped.startswith("#") and not stripped.startswith("# ===="):
            body = stripped.lstrip("# ").strip()
            key = re.sub(r"\s*\(\d+\).*$", "", body).strip().lower()
            key = re.sub(r"\s*\(label=\d\).*$", "", key).strip()
            if key:
                current = key
        if re.match(r'^\s*\("', line) or re.match(r'^\s*\(\s*$', line):
            sections.append(current)
    return sections


def main() -> int:
    if not SOURCE.exists():
        raise SystemExit(f"source not found: {SOURCE}")

    data = _literal_assignments(SOURCE)["TRAINING_DATA"]
    goals = _literal_assignments(SOURCE)["GOALS"]
    sections = _section_map(SOURCE)

    if len(sections) != len(data):
        # Section tracking is best-effort; fall back to the documented layout
        # (labels are ordered 1, 2, 0 with the last 26 label-0 rows paraphrases).
        print(f"  note: parsed {len(sections)} section markers for {len(data)} rows "
              "- falling back to the documented layout")
        sections = ["benign entailment"] * 130 + (
            ["data exfiltration"] * 8 + ["bias injection"] * 8
            + ["privilege escalation"] * 6 + ["surveillance"] * 6
            + ["corruption / tampering"] * 6 + ["adversarial paraphrases"] * 26
        )

    rows = []
    for (goal, subtask, label), section in zip(data, sections):
        if label == 1:
            family, harm, stratum = "benign_entailment", "", "easy"
        elif label == 2:
            family, harm, stratum = "benign_neutral", "", "easy"
        else:
            harm, stratum = HARM_SECTIONS.get(section, ("mixed", "easy"))
            family = ("adversarial_paraphrase" if section.startswith("adversarial")
                      else "explicit_violation")
        rows.append({
            "goal": goal, "subtask": subtask, "label": label, "family": family,
            "harm_category": harm, "pair_id": "",
            "stratum": ("hard" if family == "adversarial_paraphrase" else stratum),
            "split": "holdout" if family == "adversarial_paraphrase" else "train",
            "source": "original_190", "notes": section if label == 0 else "",
        })

    # Drop exact duplicate (goal, subtask) rows.
    seen = set()
    deduped = []
    for row in rows:
        key = (row["goal"].lower(), row["subtask"].lower())
        if key in seen:
            continue
        seen.add(key)
        deduped.append(row)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for name, split in (("seed.csv", "train"), ("holdout_paraphrases.csv", "holdout")):
        subset = [r for r in deduped if r["split"] == split]
        for i, row in enumerate(subset, start=1):
            row["id"] = f"{'h' if split == 'holdout' else 's'}{i:04d}"
        with (OUT_DIR / name).open("w", encoding="utf-8", newline="") as fh:
            writer = csv.DictWriter(fh, fieldnames=FIELDS)
            writer.writeheader()
            writer.writerows(subset)
        print(f"  wrote {name}: {len(subset)} rows")

    # ── verification ──
    print(f"\nsource            : {SOURCE.name}  ({len(goals)} goals, {len(data)} rows, "
          f"{len(deduped)} after de-dup)")
    print(f"by label          : {dict(sorted(collections.Counter(r['label'] for r in deduped).items()))}")
    print(f"by family         : {dict(collections.Counter(r['family'] for r in deduped))}")
    print(f"by split          : {dict(collections.Counter(r['split'] for r in deduped))}")
    print(f"by harm_category  : {dict(collections.Counter(r['harm_category'] for r in deduped if r['harm_category']))}")
    print(f"goals             : {len({r['goal'] for r in deduped})}")

    def toks(s: str) -> set[str]:
        return set(re.findall(r"[a-z]+", s.lower()))

    def jac(a: str, b: str) -> float:
        ta, tb = toks(a), toks(b)
        return len(ta & tb) / max(1, len(ta | tb))

    by_goal: dict[str, dict[str, list[str]]] = collections.defaultdict(lambda: {"pos": [], "neg": []})
    for row in deduped:
        by_goal[row["goal"]]["neg" if row["label"] == 0 else "pos"].append(row["subtask"])
    cross = [jac(p, n) for g in by_goal.values() for p in g["pos"] for n in g["neg"]]
    within = [jac(a, b) for g in by_goal.values() for i, a in enumerate(g["pos"]) for b in g["pos"][i + 1:]]
    print(f"\nlexical overlap (token Jaccard):")
    print(f"  positive <-> negative : {sum(cross)/len(cross):.3f}   (dataset_v2: 0.365)")
    print(f"  positive <-> positive : {sum(within)/len(within):.3f}   (dataset_v2: 0.685)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
