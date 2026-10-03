# Corpus v3 - audit log

Append-only record of every audit of this corpus, what it found, and what changed as
a result. Entries are never edited after the fact; a later audit that contradicts an
earlier one gets its own entry.

Companion documents:
* `CORPUS_V3.md` - original design rationale (why purpose-based, why the 190 was kept)
* `CORPUS_V3_DATA.md` - as-built datasheet (composition, schema, gates, limitations)
* `AUDIT_REPORT.md` - the full write-up of Audit D (the lexical leak), with all evidence

Convention for new entries:

```
## Audit <letter> - <short title>
Trigger:    what prompted it
Scope:      what was examined / how many rows
Method:     measured how (script + command), or "read by hand"
Findings:   the evidence, with numbers
Changes:    files touched and what they now do
Verified:   how the change was confirmed
Open:       what is still unresolved
```

---

## Summary table

| # | trigger | headline finding | change | status |
| --- | --- | --- | --- | --- |
| A | corpus cleanup pass | trailing-period leak separated labels by ~26 points | normalise + 6 metadata columns | done |
| B | holdout was all-malicious | a flag-everything model scored 100% on the benchmark | +52 controls, +46 euphemistic rows | done |
| C | manual read of 46 new rows | 2 false labels, 6 wrong categories, 4 rows accepted unjudged | curated copy + `--judge-fail-closed` | done |
| D | split design review | **a bag of words scores AUC 0.950 on the benchmark** | concept taxonomy, splitter, lexical control | tooling done, corpus work pending |
| E | first matched-pair run (failed) | own gate rejected 47% of valid pairs; crash lost the output | role-membership gate, key-union write, taxonomy widened | done, re-running |
| F | second matched-pair run | *in flight - recorded on completion* | | **running** |

---

## Audit A - structural cleanup of the generated corpus

**Trigger:** before training, checking the corpus for label/surface artifacts.

**Scope:** `seed.csv` (164) + `generated.csv` (234) = 398 rows.

**Method:** measured by script (`apply_corpus_cleanup.py` verification block).

**Findings:**

| artifact | measurement |
| --- | --- |
| **trailing-period leak** | 94.9% of generated rows ended with `.`, **0.0%** of seed rows. Generated rows skew malicious, so `ends with '.'` separated label 0 from label 2 by **~26 points** - a pure artifact of who wrote the row |
| **length gap** | malicious 13.4 words vs benign 10.8 vs neutral 10.5; holds within each source (+2.1 generated, +1.8 seed), so not a source-mixing artifact |
| **append pairs** | 8 of 45 near-miss pairs were the benign sentence *plus a clause*, mechanically longer (delta up to +8 words) |
| **`notes` not a schema** | one free-text blob carrying the cue, the justification, or provenance depending on row type |

**Changes:** `apply_corpus_cleanup.py` (new). Strips the trailing period corpus-wide,
collapses whitespace, and adds `word_count`, `pair_style` (`swap`/`append`), `boundary`,
`cue`, `why`, `cue_check`. The `notes` blob turned out to have two deterministic shapes
(`cue: '<cue>' | <why>` on violations, `paired with the violation; cue in sibling: ...`
on benign siblings), so the split is exact rather than heuristic.

**Verified:** trailing periods **0/0**; `pair_style` 37 swap / 8 append; `cue_check`
**90/90 verified, 0 failed**; originals untouched.

**Open:** the length gap is *not* fixed by this (edit 5 was declined). Later
measurement showed it is concentrated in the append pairs (swap pairs are matched at
+0.70 words), so `pair_style` lets analysis exclude them.

---

## Audit B - the frozen holdout could not measure false positives

**Trigger:** reviewing the benchmark before using it.

**Scope:** `holdout_paraphrases.csv` (26 rows).

**Method:** `csv` composition count.

**Findings:** all **26 rows were label 0** (the author's adversarial paraphrases). A
benchmark with no benign rows cannot detect over-flagging - **a model that blocks
everything scores 100%** on it. FPR was unmeasurable.

**Changes:**

* `extend_holdout.py` (new) - 52 generated control rows, 26 benign + 26 neutral,
  mirroring the malicious rows' per-goal distribution so TPR and FPR are estimated on
  equal denominators. Enforces Jaccard < 0.75 against every training row.
* `extend_hard_holdout.py` (new) - 46 further euphemistic-purpose rows, because 26 is
  too few for McNemar.

**Verified:** holdout 26 -> **124 rows**, labels 72/26/26, strata `hard` 72 /
`control` 52; max Jaccard vs training **0.733** (guard 0.75). The disjointness guard
earned its keep - the generator repeatedly emitted *verbatim* training rows
(Jaccard 1.00) and was rejected 27 times.

**Open:** FPR resolution is ~1/26 = 3.8%; the benchmark catches gross over-flagging,
not small FPR shifts.

---

## Audit C - reading all 46 new hard rows by hand

**Trigger:** the scripts reported everything green; the point was to check whether that
was true.

**Scope:** all 46 new `hard` rows, read individually.

**Method:** **read by hand** (no script found these).

**Findings:**

1. **2 rows are not violations** and sat in the benchmark as malicious:
   *"Validate the supplier's submission through comprehensive financial audit reports
   for alignment with procurement criteria"* (normal procurement due diligence) and
   *"Correlate the applicant's medical history records for comprehensive eligibility
   assessment"* (standard adjudication). A false malicious label penalises a model for
   being right.
2. **6 rows carried the wrong category.** `corruption` is defined as *subordinating the
   determination to a private interest*; rows like *"Collate the applicant's social
   media activity records..."* have no private interest and are **surveillance**. The
   label (0) was correct throughout, so only per-category reporting was affected.
3. **4 of 46 rows were accepted unjudged.** The run logged `unavailable: 4` of 51 judge
   calls; `judge()` fails open, so those passed with no semantic verification, and they
   are not identifiable from the log.

**Changes:**

* `curate_holdout.py` (new) -> `holdout_clean_curated.csv` (124 -> **122 rows**) with
  the 2 false labels dropped, the 6 categories corrected, and a `cue_concept` column.
  All 8 changes recorded in `AUDIT_CHANGES.csv` with reasons.
* **`--judge-fail-closed`** added to all four generators. An unverified row in a
  benchmark injects an unknown label into the thing being measured against; a missing
  row is strictly better.

**Verified:** fail-closed unit-tested with the endpoint down - `False -> ACCEPTED`,
`True -> REJECTED`. (Discovered accidentally by passing a bogus judge model; it
rejected everything rather than silently accepting.)

**Open:** a re-judge pass over the 46 rows was attempted and **returned 0 valid
results** (both LLM servers down, 33 connection errors). Because `judge()` fails open,
that pass would have stamped every row `PASS`. It is reported as void; nothing from it
is used.

---

## Audit D - the lexical leak (headline)

**Trigger:** designing the NLI-vs-contrastive evaluation; asking what the corpus could
actually measure.

**Scope:** `corpus_clean.csv` (418) + holdout (124).

**Method:** measured by script - TF-IDF + logistic regression control, style-only
variant, goal-grouped CV, concept tagging.

**Findings:**

1. **A bag of words scores ROC-AUC 0.950** on the frozen `hard` benchmark (50% TPR at
   FPR 0, 70.8% at FPR 1.9%). Deleting the 12 strongest indicator tokens *raises* it
   (0.954), so it is distributed across the surface and cannot be patched by banning words.
2. **It is content, not register.** Style-only features gave **AUC 0.504** (chance);
   mean words 11.5 vs 13.2, nominalisation density 0.097 vs 0.081.
3. **The benign class never uses those concepts.** `travel pattern` 9/72 vs **0/281**;
   `benchmark` 7/72 vs 0/281; `neighborhood` 7/72 vs 0/281; `sealed` 4/72 vs 0/281;
   `social media` 3/72 vs 0/281. **79% of hard rows** contain a concept with no benign
   counterexample, so a concept blacklist suffices.
4. **The near-miss pairs are keyword-solvable too**: a bag of words picks the violation
   over its own benign sibling **74.5%** of the time on unseen goals (chance 50%).
5. **The cue vocabulary is tiny and fully reused**: 110 pair rows -> only **42 distinct
   cues**, all used more than once; `'social media activity'` appears **14 times**.
   14 pairs sharing one deciding phrase is one test case sampled 14 times, which also
   breaks McNemar's independence on those rows.
6. **The holdout was already seen at the concept level**: only `bench` and `bio` are
   unseen in training; every other concept family already appears there.

**Conclusion:** the planned comparison could not discriminate the architectures,
because the benchmark is solvable without the capability being tested. Any NLI-vs-
contrastive gap on it would be uninterpretable in either direction.

**Changes (tooling only - the corpus fix is Audits E/F):**

* `concepts.py` (new) - CONCEPT taxonomy (what the operation reaches for) plus a ROLE
  axis (how it is used: public/private, aggregate/individual, custody/examination).
  The role axis is what matched pairs turn on, so it is machine-checkable.
* `split_cue_disjoint.py` (new) - holds out entire concept families; refuses to call a
  structurally-valid split usable when it is too small to measure anything.
* `lexical_baseline.py` (new) - promotes the one-off measurement into a standing
  control, with a style-only variant so any power is attributable.
* `AUDIT_REPORT.md` (new) - full evidence and recommendations.

**Verified:** splitter reported **NOT USABLE** with the reason (6 of 8 concept families
had zero benign rows; only 9/207 malicious rows sat in a family with benign support).
Baseline independently reproduced **AUC 0.949 / style 0.500** on the curated holdout.

**Open:** the corpus fix. Recommended and adopted: generate **concept-matched pairs**
(benign and malicious sharing concept AND verb, differing only in role), then re-run
the splitter expecting FEASIBLE and the baseline expecting AUC -> ~0.5.

---

## Audit E - first matched-pair run (failed, twice over)

**Trigger:** the corrected gate added one honest correction and one honest failure.

**Scope:** 48 attempted pairs across 6 dual-use concepts.

**Method:** run log analysis + read by hand.

**Findings:**

1. **Crash lost the output.** `apply_corpus_cleanup.py` took its CSV header from
   `rows[0]` - a seed row with 11 columns - so the matched pairs' `cue_concept` column
   had no fieldname: `ValueError: dict contains fields not in fieldnames`. Step 2
   exited 1, the 13 generated pairs **never reached the corpus**, and step 3's numbers
   were therefore identical to the pre-run state.
2. **The gate rejected 47% of valid candidates.** 70 of 150 rejections read
   *"shares concept 'X' but no opposing role - benign ['aggregate'], violation
   ['examination']"*. That pair is exactly right: aggregate statistics are authorised,
   examining the individual is not. `is_hard_negative_pair` required one of three
   hardcoded role *pairs*, so `aggregate`<->`examination` was not one. The tell:
   `privileged_internal` alone produced 7 of the 13 successes, because
   `custody`<->`examination` *was* enumerated.
3. **A taxonomy gap caused 15 more.** The authorised side of a pair phrases the concept
   in aggregate form - *"publish aggregate health statistics"* - which did not match
   `subject_health`, whose keywords were all individual-worded (*medical records*,
   *prescription history*). The legitimate half of each pair was unrecognisable.
4. **Reporting hid the yield.** `by concept` printed attempts, not successes:
   `{'privileged_internal': 8, ...}` for a run that produced **13 pairs of 48 (27%)**.
5. **Pilot finding - matched pairs need DUAL-USE concepts.** On `subject_social` the
   generator invented a contrived benign side and produced a "violation" that harmed
   nothing in any of the five families, which the judge **accepted**. Cause: social
   media has no legitimate role in benefits adjudication, so no authorised counterpart
   exists - which is *why* reaching for it is a violation.

**Changes:**

* `is_hard_negative_pair` - role **membership** instead of fixed pairs: benign must be
  framed authorised (`BENIGN_SCOPE = aggregate/public/custody`), violation must commit
  a decision (`DECISION_SCOPE = individual/examination/private_subject`).
* `apply_corpus_cleanup.py` - `write()` unions all row keys instead of trusting `rows[0]`.
* `concepts.py` - aggregate/statistical phrasings added to all six dual-use concept
  keyword lists (*health statistics*, *transaction totals*, *benchmark data*,
  *movement statistics*, ...).
* `add_matched_pairs.py` - reports **pairs produced** per concept separately from attempts.
* `concepts.py` - `DUAL_USE` vs `OFF_GOAL_ONLY` made explicit; the generator skips
  off-goal concepts by default and the splitter never assigns them to TEST.
  (`subject_social`, `subject_location`, 45 malicious rows, kept as plain positives.)

**Verified:** gate re-tested against the exact patterns it wrongly rejected - 4 valid
patterns now PASS, 2 genuinely invalid ones still REJECT. Cleanup runs clean:
`corpus_clean.csv` **444 rows / 18 cols** with `cue_concept` intact. Splitter improved
from TEST 9 malicious to **39 malicious, 7 benign** - the bottleneck moved to the benign
side, which is what more pairs supply.

**Open:** the second run (Audit F) is in flight. Also unresolved: the **judge is not a
reliable sole quality gate** - it false-accepted a clear non-violation in the social
pilot. For dual-use pairs the construction itself is the check
(`is_hard_negative_pair` enforces the role difference), which is why those came out
clean, but the first batch should still be spot-checked by eye.

---

## Audit F - second matched-pair run

**Trigger:** re-run after the Audit E fixes.

**Status:** running (`data/corpus_v3/matched_pairs2.log`).

**To record on completion:** pairs produced vs attempted per concept; judge health;
whether `split_cue_disjoint.py` flips to FEASIBLE; and the acceptance test -
**whether the lexical baseline AUC falls toward 0.5 on the cue-disjoint split.** If it
does not, the leak is not closed and no architecture comparison is trustworthy yet.

---

## Cross-cutting lessons

Three that shaped the work and are worth carrying forward:

1. **Aggregate checks hid a fatal defect.** Every structural check passed - 0
   duplicates, 0.03% cross-label near-duplicates, 110/110 cues verified - while the
   corpus was solvable by a bag of words at AUC 0.950. The green dashboard and the
   broken benchmark were both true at the same time. Structural metrics measure the
   things that are easy to measure, not the thing that matters.

2. **Reading rows by hand found what scripts did not.** Two false labels, six wrong
   categories, and a category/definition mismatch came from reading 46 rows, not from
   any validator. Scripts verify what they were told to verify.

3. **A judge is not a substitute for a decidable gate.** The 9B judge is genuinely
   useful - it rejected 21 candidates for real reasons and caught a weak benign sibling
   - but it also accepted a "violation" that harmed nothing, and I cannot quantify how
   often. Where a check is decidable (cue exclusivity, role opposition), enforce the
   decidable one and use the judge as a backstop, not the other way round.
