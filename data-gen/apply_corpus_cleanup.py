#!/usr/bin/env python3
"""Apply per-row cleanup to corpus v3 (edits 1-4) -> corpus_clean.csv / holdout_clean.csv.

Reads the raw outputs (``seed.csv`` + ``generated.csv``, and
``holdout_paraphrases.csv`` + optional ``holdout_extra.csv``) and writes cleaned
copies. Originals are never modified.

Edits
-----
1. **Normalise surface form.** The generator punctuates its sentences (94.9% end
   with '.'); the human-authored seed never does (0.0%). Because generated rows
   skew malicious, ``ends with '.'`` separated label 0 from label 2 by ~26 points
   - a pure artifact of who wrote the row, not of what it means. Strip the
   trailing period corpus-wide, collapse internal whitespace.
2. ``word_count`` - malicious rows average +2.6 words, so length is a shortcut
   the model can exploit. Recording it lets evaluation stratify by length.
3. ``pair_style`` - ``swap`` (qualifier rewritten) vs ``append`` (violation is the
   benign sentence plus a clause). Appends are mechanically longer and drive the
   length gap above.
4. ``boundary`` - the claimed harm category, validated against HARM_CATEGORIES.
   Also splits the ``notes`` blob into ``cue`` / ``why`` and re-verifies the cue
   (``cue_check``): the cue must appear in the violation and NOT in its benign
   sibling. That check is decidable and re-run here independently of generation.

Usage
-----
    python apply_corpus_cleanup.py
"""

from __future__ import annotations

import collections
import csv
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = HERE / "data" / "corpus_v3"

sys.path.insert(0, str(HERE))
from make_corpus_v3 import HARM_CATEGORIES  # noqa: E402

RAW_TRAIN = [OUT / "seed.csv", OUT / "generated.csv", OUT / "generated_extra.csv",
             OUT / "matched_pairs_ds_validated.csv"]
# (matched_pairs_extra.csv = the 9B-gated set, kept as matched_pairs_extra_9b_gated.csv;
#  only 7/22 of it survived an independent audit, hence the DeepSeek-regenerated file)
RAW_HOLDOUT = [OUT / "holdout_paraphrases.csv", OUT / "holdout_extra.csv",
               OUT / "holdout_hard_extra.csv"]
TRAIN_OUT = OUT / "corpus_clean.csv"
HOLDOUT_OUT = OUT / "holdout_clean.csv"

NEW_COLUMNS = ["word_count", "pair_style", "boundary", "cue", "why", "cue_check"]

# `cue: '<cue>' | <why sentence>`   (the value is wrapped in a quote char chosen so
# it does not collide with any apostrophe inside the cue, so match greedily back
# from the '|' delimiter rather than stopping at the first quote.)
_CUE_WITH_WHY = re.compile(r"^(?P<q>['\"])(?P<cue>.*)(?P=q)\s*\|\s*(?P<why>.*)$", re.S)
_CUE_ONLY = re.compile(r"^(?P<q>['\"])(?P<cue>.*)(?P=q)$", re.S)


def _quoted(text: str) -> str | None:
    """Strip one matching layer of surrounding quotes, if present."""
    text = text.strip()
    m = _CUE_ONLY.match(text)
    return m.group("cue") if m else None


def split_notes(notes: str, label: str) -> tuple[str, str]:
    """Extract ``(cue, why)`` from the raw notes blob.

    Two deterministic shapes exist:
      * violation row (label 0): ``cue: '<cue>' | <why>``
      * benign sibling (label 1): ``paired with the violation; cue in sibling: '<cue>'``
    Singles carry an empty notes field.
    """
    notes = (notes or "").strip()
    if not notes:
        return "", ""
    if notes.startswith("cue:"):
        body = notes[4:].strip()
        m = _CUE_WITH_WHY.match(body)
        if m:
            return m.group("cue").strip(), m.group("why").strip()
        return (_quoted(body) or body), ""
    if "cue in sibling:" in notes:
        body = notes.split("cue in sibling:", 1)[1].strip()
        return (_quoted(body) or body), ""
    return "", ""


def normalise(text: str) -> str:
    """Edit 1: collapse whitespace, drop one trailing sentence period."""
    text = re.sub(r"\s+", " ", text).strip()
    if text.endswith(".") and not text.endswith(".."):
        text = text[:-1].rstrip()
    return text


def classify_pairs(rows: list[dict]) -> tuple[dict[str, str], dict[str, tuple[str, str]]]:
    """Return {pair_id: style} and {pair_id: (benign_subtask, violation_subtask)}."""
    by_pair: dict[str, dict[str, str]] = collections.defaultdict(dict)
    for r in rows:
        pid = str(r.get("pair_id", "")).strip()
        if pid:
            by_pair[pid][str(r["label"])] = r["subtask"]

    styles: dict[str, str] = {}
    for pid, sides in by_pair.items():
        benign, violation = sides.get("1"), sides.get("0")
        if benign is None or violation is None:
            continue
        bt = set(re.findall(r"[a-z]+", benign.lower()))
        vt = set(re.findall(r"[a-z]+", violation.lower()))
        # One side a subset of the other == pure addition, nothing rewritten.
        styles[pid] = "append" if (bt <= vt or vt <= bt) else "swap"
    return styles, {p: (s.get("1", ""), s.get("0", "")) for p, s in by_pair.items()}


def clean(rows: list[dict], styles: dict[str, str],
          sides: dict[str, tuple[str, str]]) -> list[dict]:
    out = []
    for r in rows:
        r = dict(r)
        r["subtask"] = normalise(str(r.get("subtask", "")))
        cue, why = split_notes(str(r.get("notes", "")), str(r.get("label", "")))
        pid = str(r.get("pair_id", "")).strip()
        harm = str(r.get("harm_category", "")).strip()

        r["word_count"] = len(r["subtask"].split())
        r["pair_style"] = styles.get(pid, "") if pid else ""
        r["boundary"] = harm if harm in HARM_CATEGORIES else ""
        r["cue"] = cue
        r["why"] = why
        if pid and cue and pid in sides:
            benign, violation = sides[pid]
            hit = cue.lower() in violation.lower() and cue.lower() not in benign.lower()
            r["cue_check"] = "verified" if hit else "failed"
        else:
            r["cue_check"] = ""
        out.append(r)
    return out


def write(path: Path, rows: list[dict]) -> None:
    # union of every row's keys, not rows[0]'s: the matched-pair source carries an
    # extra `cue_concept` column, and a header taken from a seed row would drop it
    # (and crash DictWriter) as soon as that row was written.
    fields: list[str] = []
    for r in rows:
        for k in r:
            if k not in fields:
                fields.append(k)
    with path.open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=fields)
        w.writeheader()
        w.writerows(rows)
    print(f"  wrote {path.relative_to(HERE)}  ({len(rows)} rows, {len(fields)} cols)")


def load(paths: list[Path]) -> list[dict]:
    rows: list[dict] = []
    for p in paths:
        if not p.exists():
            print(f"  (skip, absent) {p.name}")
            continue
        with p.open(encoding="utf-8") as fh:
            part = list(csv.DictReader(fh))
        print(f"  read {p.name}: {len(part)} rows")
        rows.extend(part)
    return rows


def main() -> int:
    print("corpus v3 cleanup (edits 1-4)\n\ntrain sources:")
    train = load(RAW_TRAIN)
    print("holdout sources:")
    holdout = load(RAW_HOLDOUT)
    if not train:
        print("no train rows found", file=sys.stderr)
        return 1

    styles, sides = classify_pairs(train + holdout)
    # `clean` copies each row and appends the new columns in order, so the written
    # header is the original 11 columns followed by the 6 new ones.
    train_clean = clean(train, styles, sides)
    holdout_clean = clean(holdout, styles, sides)

    print("\nwrote:")
    write(TRAIN_OUT, train_clean)
    write(HOLDOUT_OUT, holdout_clean)

    # ---- before/after evidence -------------------------------------------------
    all_rows = train_clean + holdout_clean
    print("\n--- verification ---")
    for label in ("0", "1", "2"):
        grp = [r for r in all_rows if r["label"] == label]
        per = sum(1 for r in grp if r["subtask"].endswith("."))
        wc = [r["word_count"] for r in grp]
        print(f"  label {label}: n={len(grp):>3}  ends-with-'.'={per:>2}  "
              f"mean words={sum(wc)/len(wc):5.1f}")
    gen = [r for r in all_rows if r["source"] == "generated"]
    seed = [r for r in all_rows if r["source"] != "generated"]
    print(f"  trailing period remaining: generated={sum(1 for r in gen if r['subtask'].endswith('.'))}"
          f"  seed={sum(1 for r in seed if r['subtask'].endswith('.'))}  (was 94.9% / 0.0%)")
    st = collections.Counter(r["pair_style"] for r in all_rows if r["pair_style"])
    ck = collections.Counter(r["cue_check"] for r in all_rows if r["cue_check"])
    print(f"  pair_style: {dict(st)}")
    print(f"  cue_check : {dict(ck)}")
    print(f"  boundary set on: {sum(1 for r in all_rows if r['boundary'])} rows")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
