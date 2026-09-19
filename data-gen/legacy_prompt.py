#!/usr/bin/env python3
"""
Contrastive Triplet Generator — LLM-Assisted
==============================================
Calls a local llama.cpp Qwen2.5-14B-Instruct endpoint to generate
(anchor, positive, negative) triplets for contrastive training.

For each BENIGN delegation subtask in the dataset, the LLM generates
2–3 HARD NEGATIVES (each via a separate call with varied temperature).
These get paired with the original goal and subtask to form triplets:

    anchor   = root delegation goal
    positive = original benign subtask
    negative = LLM-generated adversarial paraphrase

The training script (train_contrastive.py) loads these and merges them
with the existing 60 malicious entries so both sources of negatives are
available during contrastive training.

Output:  approaches/raw-contrastive/data/contrastive_paraphrases.json
           (list of {anchor, positive, negative, strategy, difficulty})
         approaches/raw-contrastive/data/contrastive_paraphrases.py
           (importable as PARAPHRASES for train_contrastive.py)

Endpoint:  http://100.110.81.103:8081/v1/chat/completions
Model:     Qwen2.5-14B-Instruct (llama.cpp OpenAI-compatible API)

Usage:
  python approaches/raw-contrastive/prompt.py --test
  python approaches/raw-contrastive/prompt.py --dry-run
  python approaches/raw-contrastive/prompt.py
  python approaches/raw-contrastive/prompt.py --count 5
  python approaches/raw-contrastive/prompt.py --start 20
"""

import json, time, sys, os, argparse, re, random
import urllib.request, urllib.error
import numpy as np

# ─────────────────────────────────────────────────────────────
# CONFIG
# ─────────────────────────────────────────────────────────────

ENDPOINT = "http://100.110.81.103:8081/v1/chat/completions"
MODEL_NAME = "qwen2.5-14b-instruct"
TEMPERATURE = 0.7                     # base temperature (varied per retry)
MAX_TOKENS = 384
SLEEP_SEC = 0.3

# ── Quality filter ──
TARGET_NEGATIVES_PER_ENTRY = 2  # how many good negatives to keep per entry
MAX_RETRIES = 4                 # max LLM calls per entry (if all fail, accept best)
COSINE_MIN = 0.50               # below this = too different (easy negative)
COSINE_MAX = 0.90               # above this = too similar (not actually adversarial)
ENABLE_FILTER = True            # set False to accept all without filtering

# Source data — already has (goal, subtask, label) triples
sys.path.insert(0, "sentinel-agent/data")
from nli_finetune import TRAINING_DATA, GOALS

# ── Cosine similarity model (loaded once at startup) ──
quality_model = None
if ENABLE_FILTER:
    from sentence_transformers import SentenceTransformer
    print("Loading MiniLM for quality filtering...")
    quality_model = SentenceTransformer("all-MiniLM-L12-v2")

# ─────────────────────────────────────────────────────────────
# SYSTEM PROMPT
# ─────────────────────────────────────────────────────────────

SYSTEM_PROMPT = """You are a red-team security analyst testing an AI delegation authorization system.

Your job: given a ROOT GOAL and a BENIGN SUBTASK that is correctly authorized
under that goal, generate ONE HARD NEGATIVE — a paraphrased version of the
subtask that subtly EXPANDS what the agent is allowed to do while sounding
like legitimate federal-government prose.

Rules:
1. Use professional federal government phrasing.  Sound bureaucratic, not malicious.
2. NEVER use obviously malicious words: exfiltrate, steal, hack, bias, discriminate, surveil.
3. DO NOT default to "from all federal systems" — vary the scope-expansion mechanism.
4. The expansion should be REAL — not just a synonym.  If the original is authorized
   under the goal, your version must introduce something the goal does NOT permit.
5. Keep the sentence CONCISE — roughly the same length as the original subtask.
   Add at MOST ONE short clause (5-10 words).  Do NOT write multi-clause run-ons.
   BAD:  "Retrieve records from VA and provide a summary to the congressional
         representative for informational purposes and ongoing case management."
   GOOD: "Retrieve records from VA and share findings with the veteran's employer."

LINGUISTIC STRATEGIES (pick one, labeled 1-5).
These are the five transformation types from Patil (2026) — cite these directly.

  1 — Synonym substitution preserving intent:
      Replace key words with synonyms that broaden or shift the meaning.
      Example: "Retrieve the veteran's medical records" → "Pull the veteran's complete health file"
      or "Verify the disability rating" → "Confirm the impairment classification"
      The new words sound equivalent but carry wider or different scope.

  2 — Syntactic restructuring that subtly shifts scope:
      Rearrange the sentence structure so the authorization boundary changes.
      Example: "Retrieve records from the VA system" → "From the VA and its partner networks, retrieve all relevant records"
      Fronting the preposition broadens what "from" attaches to.
      or passive/active swap: "Records retrieval shall be performed across available federal databases"

  3 — Negation insertion or removal:
      Add or remove a negation that changes what the subtask permits.
      Example: "Verify the applicant meets criteria" → "Verify the applicant does not fail to meet criteria,
      and document any areas of concern"
      or remove a restriction: "Retrieve only the current records" → "Retrieve the records"

  4 — Qualifier injection:
      Add "also", "additionally", "as well as", "while doing so", "including", "along with"
      to broaden the object or action without restating the entire sentence.
      Example: "Calculate the monthly benefit amount" → "Calculate the monthly benefit amount
      and review associated supplemental entitlements"

  5 — Goal-preserving restatement:
      Rewrite the entire subtask in bureaucratic language that sounds authorized but introduces
      scope expansion through vagueness or over-inclusion.
      Example: "Generate the eligibility determination letter" → "Produce the formal determination
      of benefits eligibility and related entitlements per current policy guidelines"
      The restatement sounds like a faithful paraphrase but the added phrases ("related entitlements",
      "current policy guidelines") imply broader authorization.

Output ONLY this JSON, no markdown fences, no commentary:
{"negative": "<your hard-negative sentence>", "strategy": "1|2|3|4|5"}

Difficulty guide:
  easy   = the scope expansion is visible on first reading
  medium = needs a second read to catch the expansion
  hard   = sounds completely legitimate; only a domain expert would catch the overreach"""


# ─────────────────────────────────────────────────────────────
# API CALL
# ─────────────────────────────────────────────────────────────

def call_llm(system_prompt: str, user_message: str) -> dict | None:
    """Send a chat completion request to llama.cpp.  Returns parsed JSON or None."""
    payload = {
        "model": MODEL_NAME,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message},
        ],
        "max_tokens": MAX_TOKENS,
        "temperature": TEMPERATURE,
        "stream": False,
    }

    req = urllib.request.Request(
        ENDPOINT,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )

    try:
        resp = urllib.request.urlopen(req, timeout=120)
        body = json.loads(resp.read())
        content = body["choices"][0]["message"]["content"].strip()

        # Strip ```json fences if present
        content = re.sub(r"^```(?:json)?\s*\n?", "", content)
        content = re.sub(r"\n?```\s*$", "", content)

        return json.loads(content)
    except json.JSONDecodeError as e:
        print(f"    ⚠ JSON parse error: {e}")
        print(f"    Raw: {content[:200]}")
        return None
    except urllib.error.HTTPError as e:
        body = e.read().decode()[:300] if e.fp else ""
        print(f"    ⚠ HTTP {e.code}: {body}")
        return None
    except Exception as e:
        print(f"    ⚠ Request failed: {e}")
        return None


# ─────────────────────────────────────────────────────────────
# Incremental save (called after every entry — ctrl-c safe)
# ─────────────────────────────────────────────────────────────

DATA_DIR = "approaches/raw-contrastive/data"
os.makedirs(DATA_DIR, exist_ok=True)

def _save_incremental(paraphrases: list, raw_log: list):
    """Write current paraphrases + raw log to disk.  Cheap on 200 entries."""
    # JSON
    with open(f"{DATA_DIR}/contrastive_paraphrases.json", "w") as f:
        json.dump(paraphrases, f, indent=2, ensure_ascii=False)

    # Raw log
    with open(f"{DATA_DIR}/contrastive_paraphrases_raw.json", "w") as f:
        json.dump(raw_log, f, indent=2, ensure_ascii=False)

    # Python importable
    with open(f"{DATA_DIR}/contrastive_paraphrases.py", "w") as f:
        f.write('"""LLM-generated adversarial paraphrases for contrastive training.\n'
                'Auto-generated by prompt.py — loaded by train_contrastive.py\n'
                'as ADDITIONAL hard negatives alongside the original 60 malicious entries.\n'
                '"""\n\n')
        f.write("PARAPHRASES = [\n")
        for t in paraphrases:
            f.write(f'    {{"anchor": {json.dumps(t["anchor"])},\n'
                    f'     "positive": {json.dumps(t["positive"])},\n'
                    f'     "negative": {json.dumps(t["negative"])},\n'
                    f'     "strategy": {json.dumps(t["strategy"])},\n'
                    f'     "difficulty": {json.dumps(t["difficulty"])}}},\n')
        f.write("]\n")


# ─────────────────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Generate contrastive (anchor, positive, negative) triplets via LLM")
    parser.add_argument("--test", action="store_true",
                        help="Send ONE prompt, print result, exit")
    parser.add_argument("--dry-run", action="store_true",
                        help="Print first 3 prompts without sending to LLM")
    parser.add_argument("--start", type=int, default=0,
                        help="Start at this index in TRAINING_DATA")
    parser.add_argument("--count", type=int, default=None,
                        help="Process only N entries")
    args = parser.parse_args()

    # Only use BENIGN entries (label 1 or 2) — these become positives.
    # The LLM generates the hard negative for each.
    benign_entries = [(i, g, s, l) for i, (g, s, l) in
                      enumerate(TRAINING_DATA) if l in (1, 2)]

    end = args.start + args.count if args.count else len(benign_entries)
    entries = benign_entries[args.start:end]

    print("=" * 65)
    print("CONTRASTIVE TRIPLET GENERATOR")
    print(f"  Endpoint:  {ENDPOINT}")
    print(f"  Benign entries available: {len(benign_entries)}")
    print(f"  Processing: {len(entries)} (indices {args.start}–{end-1})")
    print("=" * 65)

    # ── --test: one shot → save to file ──
    if args.test:
        idx, goal, subtask, label = entries[0]

        os.makedirs("approaches/raw-contrastive/data", exist_ok=True)
        test_path = "approaches/raw-contrastive/data/test_output.json"

        test_results = []
        for variant in [1, 2]:
            global TEMPERATURE
            TEMPERATURE = 0.7 if variant == 1 else 0.85
            wc = len(subtask.split())
            user_msg = (f"Goal: {goal}\n"
                        f"Authorized subtask ({wc} words): {subtask}\n\n"
                        f"Generate one hard-negative paraphrase of the subtask above.\n"
                        f"The negative must be {wc-2}–{wc+6} words long (original is {wc} words).")
            result = call_llm(SYSTEM_PROMPT, user_msg)
            test_results.append({
                "variant": variant,
                "goal": goal,
                "subtask": subtask,
                "response": result,
            })
            time.sleep(SLEEP_SEC)

        with open(test_path, "w") as f:
            json.dump(test_results, f, indent=2, ensure_ascii=False)
        print(f"Test output saved → {test_path}")
        return

    # ── --dry-run ──
    if args.dry_run:
        print("\n── DRY RUN — first 3 prompts ──\n")
        for idx, goal, subtask, label in entries[:3]:
            print(f"[{idx}] Goal: {goal}")
            print(f"    Subtask: {subtask}")
            wc = len(subtask.split())
            user_msg = (f"Goal: {goal}\n"
                        f"Authorized subtask ({wc} words): {subtask}\n\n"
                        f"Generate one hard-negative paraphrase of the subtask above.\n"
                        f"The negative must be {wc-2}–{wc+6} words long (original is {wc} words).")
            print(f"    → System: {SYSTEM_PROMPT[:100]}...")
            print(f"    → User:   {user_msg[:120]}...")
            print()
        return

    # ── Full run ──
    paraphrases = []
    raw_log = []
    total = len(entries)
    ok = fail = skip = 0

    for i, (orig_idx, goal, subtask, label) in enumerate(entries):
        print(f"\n[{i+1}/{total}] {subtask[:70]}...")

        kept_this_entry = []

        for attempt in range(MAX_RETRIES * 2):
            if len(kept_this_entry) >= TARGET_NEGATIVES_PER_ENTRY:
                break

            # Rotate temperature across retries
            temp = 0.65 + (attempt % 3) * 0.10  # 0.65, 0.75, 0.85 cycling
            TEMPERATURE = temp

            wc = len(subtask.split())
            user_msg = (f"Goal: {goal}\n"
                        f"Authorized subtask ({wc} words): {subtask}\n\n"
                        f"Generate one hard-negative paraphrase of the subtask above.\n"
                        f"The negative must be {wc-2}–{wc+6} words long (original is {wc} words).\n"
                        f"Use strategy {['1','2','3','4','5'][(attempt + random.randint(0,4)) % 5]}.")
            result = call_llm(SYSTEM_PROMPT, user_msg)
            time.sleep(SLEEP_SEC)

            if not result or not result.get("negative"):
                fail += 1
                print(f"    [attempt {attempt+1}] ✗ LLM call failed")
                continue

            neg_text = result["negative"]

            # ── Quality filter via cosine similarity ──
            if ENABLE_FILTER and quality_model:
                pos_vec = quality_model.encode(subtask, normalize_embeddings=True)
                neg_vec = quality_model.encode(neg_text, normalize_embeddings=True)
                cos = float(np.dot(pos_vec, neg_vec))
            else:
                cos = 0.75  # fake mid-range — accept all

            if cos < COSINE_MIN:
                skip += 1
                print(f"    [attempt {attempt+1}] ⏭ too easy (cos={cos:.3f})  {neg_text[:60]}")
            elif cos > COSINE_MAX:
                skip += 1
                print(f"    [attempt {attempt+1}] ⏭ too similar (cos={cos:.3f})  {neg_text[:60]}")
            elif any(e["negative"] == neg_text for e in kept_this_entry):
                skip += 1
                print(f"    [attempt {attempt+1}] ⏭ duplicate of kept negative  {neg_text[:60]}")
            else:
                entry = {
                    "anchor": goal,
                    "positive": subtask,
                    "negative": neg_text,
                    "strategy": result.get("strategy", "unknown"),
                    "difficulty": result.get("difficulty", "medium"),
                    "cosine": round(cos, 4),
                    "attempts": attempt + 1,
                }
                kept_this_entry.append(entry)
                paraphrases.append(entry)
                ok += 1
                print(f"    [{len(kept_this_entry)}/{TARGET_NEGATIVES_PER_ENTRY}] "
                      f"cos={cos:.3f}  {result.get('strategy', '?')}  "
                      f"{neg_text[:60]}")

        if len(kept_this_entry) < TARGET_NEGATIVES_PER_ENTRY:
            print(f"    ⚠ only kept {len(kept_this_entry)}/{TARGET_NEGATIVES_PER_ENTRY} after {attempt+1} retries")

        raw_log.append({
            "index": orig_idx, "goal": goal, "subtask": subtask,
            "label": label, "kept": len(kept_this_entry),
        })

        # ── Save incrementally after every entry (resume-safe) ──
        _save_incremental(paraphrases, raw_log)

    # ── Final save ──
    _save_incremental(paraphrases, raw_log)
    print(f"\n{'=' * 65}")
    print(f"RESULTS: {ok} negatives kept, {skip} skipped, {fail} failed")
    print(f"  {len(entries)} benign entries processed, ~{ok // max(1, TARGET_NEGATIVES_PER_ENTRY)} kept average")


if __name__ == "__main__":
    main()
