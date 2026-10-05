# Sentinel dataset generation (`data-gen/`)

Generates the delegation corpora the models in [`../training/`](../training/) are
trained on: **(goal, subtask)** pairs for a gateway that blocks an agent subtask when
it contradicts the agent's authorized goal.

Two generations live here, and the audit trail *between* them is the point of this
folder:

1. the original **DelegationBench-style triplet corpus** (`prompt.py` + `run.ps1`) —
   `anchor / positive / negative`, 9 domains × 50 anchors × 11 policies × 2 samples
   ≈ **9,900 triplets**; and
2. **corpus v3** (`make_corpus_v3.py`) — a **purpose-based, cue-decidable** corpus
   built specifically to escape the lexical ceiling that makes #1 uninformative.

> **Read this first.** Both corpora sit at a high **lexical ceiling**: a plain
> bag-of-words model reaches ROC-AUC ≈ 0.98 on corpus v3 (≈ 0.95 on its "hard"
> benchmark). Until that is addressed, an absolute-accuracy gap cannot separate the two
> architectures. See `AUDIT_REPORT.md` §3 and `CORPUS_V3_DATA.md` §6b.

## Documentation map

| Doc | Kind | Covers |
| --- | --- | --- |
| `implementation.md` | spec | `prompt.py` **as implemented**: the triplet record format, corpus shape (9,900 = 9 domains × 50 anchors × 11 policies × 2), the policy matrix, paraphrasing strategies, the generation loop, rule-based validation, and the expert-sampling verification protocol. **Section 6 is authoritative.** |
| `CORPUS_V3.md` | design | The corpus-v3 **rationale** — why the violation must live in the *purpose* (with the pos↔neg Jaccard evidence), the classification schema, the **cue-decidability rule**, the strata, and the commands. |
| `CORPUS_V3_DATA.md` | datasheet | **As-built** record of corpus v3: files / row counts, composition, the three adversarial styles, the 17-column schema, the acceptance gates, quality measurements, the lexical ceiling, limitations, reproduction. |
| `AUDIT_LOG.md` | audit log | Append-only log of every audit (**A → J**): what each found and what changed as a result. Headline entry: **Audit D, the lexical leak**. |
| `AUDIT_REPORT.md` | report | Full write-up of the lexical-leak audit with all evidence (the bag-of-words result, the near-miss analysis, the holdout findings) and the fix that would actually enable the comparison. |
| `new-expanded-unverified/AUDIT.md` | audit | Audit of the expanded corpus in `new-expanded-unverified/`: is it a true superset, are the labels sound, and does it clear the lexical ceiling? |

The consumer side of these docs lives in
[`../training/dataset-v3/DATASET_V3.md`](../training/dataset-v3/DATASET_V3.md), which
links back here for provenance.

## Entry points

| Script | Role |
| --- | --- |
| `run.ps1` | Windows driver for the **original** corpus — runs `prompt.py` against a local llama-server; resumable. |
| `prompt.py` | The original generator: two prompts, the generation loop, rule-based validation, and a resumable JSONL ledger. |
| `make_corpus_v3.py` | The **corpus-v3** generator: LLM generator + LLM judge + **cue check** + overlap report. |
| `extract_old_corpus.py` | Deterministic (no-LLM) extraction of the original, hand-authored 190 rows. |

**Finishing / repair passes** (each is a documented, single-purpose run):
`run_backfill.sh`, `run_hard_expand.sh`, `run_matched_pairs.sh`,
`run_matched_deepseek.sh`, `run_topup.sh` — with helpers `add_matched_pairs.py`,
`add_missing_harm.py`, `apply_corpus_cleanup.py`, `curate_holdout.py`,
`extend_holdout.py`, `extend_hard_holdout.py`, `split_cue_disjoint.py`,
`revalidate.py`, `rejudge_rows.py`.

**Audits & probes:** `audit_expanded.py`, `deepseek_pair_audit.py`,
`lexical_baseline.py` (the bag-of-words baseline that exposes the ceiling),
`test_deepseek.py`.

**Domain reference** (data, not code): `anchors.py`, `concepts.py`, `legacy_prompt.py`.

Generation needs a local OpenAI-compatible server (a `llama-server` /
`--endpoint`, default `http://100.110.81.103:8081/v1/chat/completions`); with no
endpoint, the deterministic `extract_old_corpus.py` and `--dry-run` still work.

## Data layout

```
data/
  full/            original run output: triplets.jsonl (ledger) + triplets.json + run.log
  retail/  _recover/    partial / recovered runs of the same
  corpus_v3/       the v3 working corpus: corpus_clean.csv, holdout_clean*.csv,
                   cue_split*.csv, matched_pairs_ds_validated.csv, generated.csv,
                   seed + holdout, and the audit logs
data-test/         prompt.py --test output (one violation per anchor per domain)
new-expanded-unverified/   the expanded corpus under audit (*_merged.csv)
```

Corpus-v3 row counts: `corpus_clean.csv` **584**, `holdout_clean_curated.csv`
**122**, `cue_split.csv` **706**, `matched_pairs_ds_validated.csv` **166**.

## How it feeds training

`data/corpus_v3/` is snapshotted, **byte-for-byte**, into
[`../training/dataset-v3/`](../training/dataset-v3/) (`corpus_clean.csv`,
`holdout_clean_curated.csv`, `cue_split.csv`, `cue_split_phrases.csv`,
`matched_pairs_ds_validated.csv`). From there the nested training packages
([`../training/training/new_dataset_1/`](../training/training/new_dataset_1/README.md))
consume it. The original 9,900-row corpus is the `dataset.csv` / `dataset_v2.csv`
family that `../training/` trains on.
