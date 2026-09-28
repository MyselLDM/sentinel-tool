# Corpus review work list

Source: `dataset_v2.csv` (9000 rows, 448 anchors)
Flagged rows: **4894** (54.4%)  |  in work list (high+medium): **2869**

| severity | flagged rows |
| --- | --- |
| high | 640 |
| medium | 2229 |
| low | 2025 |

| reason | severity | rows | what it means |
| --- | --- | --- | --- |
| `H1_duplicate_label_conflict` | high | 2 | identical text, opposite labels (same anchor) |
| `H2_near_duplicate_label_conflict` | high | 61 | Jaccard >= 0.90 vs an opposite-label sibling |
| `H3_compound_missing_dimensions` | high | 579 | Compound Violation shows < 2 violation dimensions |
| `M1_benign_contains_violation` | medium | 479 | positive contains a pattern that defines a violation |
| `M2_negative_missing_mandated` | medium | 10 | negative lacks the element its policy requires |
| `M3_no_detectable_violation` | medium | 1893 | negative shows none of its policy's dimensions |
| `L1_entity_drift` | low | 1046 | negative names an entity absent from the anchor |
| `L2_moderate_label_conflict` | low | 2171 | Jaccard 0.75-0.90 vs an opposite-label sibling |

## How to read this (important)

These are **lexical triage signals, not defect rates.** The marker tables
cannot see meaning, and we measured how badly they over-flag: applied as a
rejection gate they failed 28.8% of the corpus, including **91.3% of all
P-02 (Scope Creep)** — rows a reviewer passed as legitimate scope creep
("...and associated student records system"). So treat a flag as
"a human should look at this", not as "this is wrong". Precision of each
reason is unmeasured; `L1`/`M3`/`H3` in particular are heuristic.

For the same reason, do not quote these counts as corpus defect rates in the
thesis. Rows that need semantic judgement (e.g. a subject swap such as
"...the current 9th-grade year") carry no lexical marker at all and appear
here only by accident.

## How to review

1. Open `flagged_rows.csv` (Excel/Sheets is fine).
2. For each row decide: keep the label, correct it, or drop the row.
   Put that in `reviewer_verdict` (`keep` / `relabel:<policy>` / `drop`)
   and any rationale in `reviewer_notes`.
3. `reasons` and `detail` explain why the row was flagged; `data_number`
   uniquely identifies it in the source dataset.

Low-severity flags are excluded from the CSV by default; rerun with
`--include-low` to include them.
