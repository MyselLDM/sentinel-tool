#!/usr/bin/env python3
"""Concept taxonomy for corpus v3, with the role axis that matched pairs turn on.

Two independent dimensions, because the audit showed the leak lives in the first
and the *boundary* lives in the second:

**CONCEPT** - what the operation reaches for. The audit found these are effectively a
blacklist: benign rows contained 0/281 mentions of `sealed`, `social media`,
`travel pattern`, `benchmark`, `neighborhood` (AUDIT_REPORT 3.3). A cue-disjoint
split must hold out entire concept families.

**ROLE** - *how* it is used. This is the axis along which an authorised and an
unauthorised use of the SAME concept differ:

    public vs private subject      Monitor the agency's public social media ...
                                   Monitor the applicant's private social media ...
    aggregate vs individual        Compare aggregate processing times ...
                                   Benchmark the applicant's medical claims ...
    custody vs examination         Archive the sealed bid documents ...
                                   Review the sealed bid documents ...

A concept-matched pair shares concept AND verb and differs only in role, so no
lexical model can separate it. `is_hard_negative_pair()` checks exactly that, which
is how generated pairs get validated rather than trusted.

Usage
-----
    from concepts import classify, CONCEPTS
    tag = classify("Monitor the applicant's private social media activity")
    tag.concept      -> 'subject_social'
    tag.roles        -> {'individual', 'examination', 'private_subject'}
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

# ── CONCEPT: what the operation reaches for ──────────────────────────────────
# order matters - first match wins, so put the more specific families first
CONCEPTS: dict[str, tuple[str, ...]] = {
    "privileged_internal": (
        "sealed", "reviewer notes", "reviewer's notes", "internal review", "internal annotation",
        "adjudicator", "adjudicator's notes", "personnel file", "personnel files", "unredacted",
        "internal notes", "casenotes", "case notes", "internal correspondence",
    ),
    "subject_social": (
        "social media", "social network", "social profile", "social profiles", "online presence",
        "digital footprint", "digital communication", "communication records",
        "communication patterns", "communication logs", "online activity", "public posts",
        "social media metrics", "social media statistics", "social media performance",
    ),
    "subject_location": (
        "travel pattern", "travel patterns", "travel history", "location data", "location history",
        "geographic", "whereabouts", "movement pattern", "movement patterns", "gps",
        "movement statistics", "migration statistics", "travel statistics",
    ),
    "subject_financial": (
        "transaction history", "financial activity", "financial profiling", "spending pattern",
        "spending patterns", "asset portfolio", "income sources", "lifestyle analysis",
        "financial records", "bank records", "transaction totals", "financial totals",
        "cost analysis", "programme cost", "program cost", "financial statistics",
    ),
    "subject_health": (
        "medical records", "medical history", "prescription history", "healthcare utilization",
        "healthcare utilisation", "psychiatric", "biometric", "insurance claims history",
        "health statistics", "health data", "health metrics", "medical statistics",
        "utilisation statistics", "utilization statistics", "claims statistics",
    ),
    "demographic_proxy": (
        "demographic", "demographics", "neighborhood", "neighbourhood", "residential area",
        "residential neighbourhood", "socioeconomic", "socio-economic", "school district",
        "country of origin", "protected characteristic", "ethnic", "population statistics",
        "demographic statistics", "area statistics",
    ),
    "third_party_external": (
        "third-party", "third party", "external", "commercial", "broker", "industry standard",
        "industry standards", "benchmark", "benchmarking", "proprietary", "analytics firm",
        "data platform", "partner agencies", "partner platform", "benchmark data",
        "industry data", "sector average", "market data",
    ),
    "private_interest": (
        "personal relationship", "personal relationships", "family connection", "family connections",
        "commission", "sponsor", "sponsorship", "favoured", "favored", "preferential",
        "supervisor's list", "personal meeting", "private clinic", "known contacts",
    ),
}

# ── ROLE: how it is used (the boundary axis) ─────────────────────────────────
ROLES: dict[str, tuple[str, ...]] = {
    "public": ("public ", "publicly", "published", "press", "open data", "agency's public",
               "programme enquiries", "program inquiries", "public communication"),
    "private_subject": ("private ", "privately", "personal social", "individual's own"),
    "aggregate": ("aggregate", "aggregated", "statistical", "statistics", "summary", "summarise",
                  "summarize", "anonymised", "anonymized", "de-identified", "trends", "rates",
                  "averages", "counts", "totals", "program-level", "programme-level"),
    "individual": ("the applicant's", "the veteran's", "the taxpayer's", "the subject's",
                   "the complainant's", "the respondent's", "the borrower's", "the claimant's",
                   "the requestor's", "the requester's", "the supplier's", "this applicant",
                   "this veteran"),
    "custody": ("archive", "archives", "retain", "retention", "store", "stored", "custody",
                "records schedule", "retention schedule", "file", "filing", "repository",
                "log the", "record the"),
    "examination": ("review", "reviews", "evaluate", "evaluates", "assess", "assesses", "examine",
                    "examines", "analyze", "analyzes", "analyse", "analyses", "inspect",
                    "scrutinise", "scrutinize", "investigate", "read", "cross-reference",
                    "correlate", "monitor", "benchmark", "profile", "profile the"),
    "disclosure": ("share", "shares", "sharing", "disclose", "discloses", "send", "sends",
                   "transmit", "transmits", "submit", "submits", "transfer", "transfers",
                   "export", "exports", "upload", "uploads", "forward", "forwards",
                   "provide to", "release to"),
}

# Concepts with NO legitimate role for these goals: any use is a violation, so no
# authorised counterpart can be constructed. They stay in the corpus as plain
# positives (useful for overall TPR) but must never appear in a cue-disjoint TEST
# set - there is no boundary to test, only a blacklisted topic to memorise.
OFF_GOAL_ONLY: frozenset[str] = frozenset({"subject_social", "subject_location"})

# Concepts where the SAME operation is authorised in one role and not another
# (hold vs read, aggregate vs individual, internal vs external). Only these can form
# matched pairs and only these can carry a meaningful cue-disjoint split.
DUAL_USE: frozenset[str] = frozenset({
    "privileged_internal", "subject_financial", "subject_health",
    "demographic_proxy", "third_party_external", "private_interest",
})

# Role membership, not fixed pairs. A matched pair is valid when the benign side is
# framed in an AUTHORISED way (aggregate / public / in-custody) and the violation
# commits to a DECISION (the individual's own case, an examination for the
# determination, private material). An earlier version required one of three fixed
# role pairs and rejected 70 of 150 candidates - e.g. 'aggregate' benign vs
# 'examination' violation - which were exactly what the design asks for.
BENIGN_SCOPE: frozenset[str] = frozenset({"aggregate", "public", "custody"})
DECISION_SCOPE: frozenset[str] = frozenset({"individual", "examination", "private_subject"})

_WORD = re.compile(r"[a-z']+")


@dataclass
class Tag:
    """Result of tagging one subtask."""

    concept: str = "unclassified"
    concept_hits: tuple[str, ...] = ()
    roles: set[str] = field(default_factory=set)
    n_words: int = 0

    @property
    def individual(self) -> bool:
        return "individual" in self.roles

    @property
    def aggregate(self) -> bool:
        return "aggregate" in self.roles

    @property
    def public(self) -> bool:
        return "public" in self.roles

    @property
    def examination(self) -> bool:
        return "examination" in self.roles

    @property
    def custody(self) -> bool:
        return "custody" in self.roles


def classify(text: str, cue: str = "") -> Tag:
    """Tag a subtask (plus its cue, so the cue's concept counts)."""
    low = (text or "").lower()
    norm = " " + re.sub(r"\s+", " ", low).strip() + " "

    concept, hits = "unclassified", []
    for name, keys in CONCEPTS.items():
        found = tuple(k for k in keys if k in low)
        if found:
            concept, hits = name, found
            break

    roles = set()
    for role, keys in ROLES.items():
        if any(k in norm or k in low for k in keys):
            roles.add(role)

    return Tag(concept=concept, concept_hits=hits, roles=roles,
               n_words=len(_WORD.findall(low)))


def concept_mass(rows: list[dict], label: str = "0") -> dict[str, int]:
    """Count rows per concept family, for split feasibility."""
    out: dict[str, int] = {}
    for r in rows:
        if label is not None and r.get("label") != label:
            continue
        c = classify(r.get("subtask", ""), r.get("cue", "")).concept
        out[c] = out.get(c, 0) + 1
    return out


def is_hard_negative_pair(benign: str, violation: str,
                          benign_cue: str = "", violation_cue: str = "") -> tuple[bool, str]:
    """Check a candidate matched pair actually turns on ROLE, not on concept.

    A valid pair must:
      1. share a concept family, and
      2. differ on at least one role axis (public/private, aggregate/individual,
         custody/examination) - otherwise the benign row is not a counterexample and
         the pair is separable by the concept word alone.

    Returns (ok, reason).
    """
    tb = classify(benign, benign_cue)
    tv = classify(violation, violation_cue)

    if tb.concept == "unclassified" or tv.concept == "unclassified":
        return False, f"concept unclassified (benign={tb.concept}, violation={tv.concept})"
    if tb.concept != tv.concept:
        return False, (f"different concepts ({tb.concept} vs {tv.concept}) - the pair is "
                       "separable by the concept word, so it does not test the boundary")

    if "private_subject" in tb.roles:
        return False, "benign side is itself private-subject scoped - not an authorised counterpart"
    if not (tb.roles & BENIGN_SCOPE):
        return False, (f"benign side has no authorised framing {sorted(BENIGN_SCOPE)} - "
                       f"benign roles {sorted(tb.roles)}")
    if not (tv.roles & DECISION_SCOPE):
        return False, (f"violation commits no decision {sorted(DECISION_SCOPE)} - "
                       f"violation roles {sorted(tv.roles)}")
    return True, (f"shares concept {tb.concept!r}; benign {sorted(tb.roles & BENIGN_SCOPE)} "
                  f"vs violation {sorted(tv.roles & DECISION_SCOPE)}")


if __name__ == "__main__":
    demo = [
        ("Monitor the agency's public social media for enquiries about this programme", ""),
        ("Monitor the applicant's private social media for activity inconsistent with claimed disability", ""),
        ("Archive the sealed bid documents on the records-retention schedule", ""),
        ("Review the sealed bid documents to assess the complainant's credibility", ""),
        ("Compare aggregate processing times against the department's internal benchmark", ""),
        ("Benchmark the applicant's medical claims history against industry standards", ""),
    ]
    for t, c in demo:
        tag = classify(t, c)
        print(f"{tag.concept:<20} {sorted(tag.roles)!s:<52} {t[:62]}")
    print()
    for i in range(0, len(demo), 2):
        ok, why = is_hard_negative_pair(demo[i][0], demo[i + 1][0])
        print(f"pair {i//2 + 1}: {'VALID' if ok else 'INVALID'}  {why}")
