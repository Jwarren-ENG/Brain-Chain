"""The Extractor — AI job #2 of the Brain Interview engine.

Converts a completed conversation into reviewable candidate artifacts. Hard
rules enforced here:

  * every artifact cites the employee turn(s) it came from — an artifact
    without supporting_turn_ids is invalid and never created;
  * provenance (firsthand / hearsay / unknown) is classified per source turn;
  * nothing is presented as verified fact — artifacts are candidates until the
    employee reviews and publishes them, and inference-heavy kinds are marked
    lower-confidence.

The local extractor is deterministic (ordered sentence classifiers), which
makes the acceptance conversations reproducible and testable. The function
signature is what a model-gateway extractor would implement.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

from ..models import InterviewSession, InterviewTurn

_SENTENCE_RE = re.compile(r"(?<=[.!?])\s+")
_HEARSAY_RE = re.compile(
    r"\b(i heard|apparently|they say|someone said|supposedly|rumor|second-hand)\b", re.IGNORECASE
)
_FIRSTHAND_RE = re.compile(r"\b(i|we|my|our|me)\b", re.IGNORECASE)

MAX_ARTIFACTS = 14


@dataclass
class CandidateArtifact:
    kind: str
    summary: str
    details: dict
    confidence: float
    provenance: str
    supporting_turn_ids: list[str]
    excerpt: str
    uncertain: bool = False


# Ordered classifiers: (kind, regex, base confidence, purposes or None for all)
_CLASSIFIERS: list[tuple[str, re.Pattern, float, set[str] | None]] = [
    ("action_item",
     re.compile(r"\b(i will|i'll|we will|we'll|i plan to|i am going to)\b", re.IGNORECASE),
     0.8, None),
    ("decision",
     re.compile(r"\b(we decided|we've decided|decision is|decided to|we chose|going with)\b",
                re.IGNORECASE),
     0.85, {"decision", "outcome_review"}),
    ("decision_alternative",
     re.compile(r"\b(the alternative|other option|we considered|instead of)\b", re.IGNORECASE),
     0.75, {"decision"}),
    ("dissent",
     re.compile(r"\b(disagreed|dissent|objected|pushed back|preferred)\b", re.IGNORECASE),
     0.75, {"decision"}),
    ("assumption",
     re.compile(r"\b(we assume|assuming|assumption)\b", re.IGNORECASE),
     0.7, {"decision", "outcome_review"}),
    ("success_metric",
     re.compile(r"\b(success metric|measure of success|kpi|success:)\b", re.IGNORECASE),
     0.75, {"decision", "outcome_review"}),
    ("process_exception",
     re.compile(r"\b(exception|except when|unless|we skip|schedule-critical)\b", re.IGNORECASE),
     0.75, None),
    ("workaround",
     re.compile(r"\b(workaround|work around|instead|not documented|off the books|rely on)\b",
                re.IGNORECASE),
     0.7, None),
    ("expert_heuristic",
     re.compile(r"\b(rule of thumb|always|never|make sure|tip:|first thing i check)\b",
                re.IGNORECASE),
     0.75, {"expert", "process"}),
    ("lesson",
     re.compile(r"\b(lesson|we learned|in hindsight|next time|takeaway)\b", re.IGNORECASE),
     0.75, {"outcome_review", "expert", "decision"}),
    ("risk",
     re.compile(r"\b(risk|blocks|blocking|single point of failure|jeopard\w*|threat|slip)\b",
                re.IGNORECASE),
     0.75, None),
    ("friction",
     re.compile(r"\b(slow|slowest|bottleneck|waiting|painful|frustrat\w*|takes weeks|queue)\b",
                re.IGNORECASE),
     0.7, None),
    # Direct statements about strain are firsthand friction, not inference —
    # someone saying "it's wearing me down" said exactly that.
    ("friction",
     re.compile(r"\b(exhaust\w*|wearing (me|us|people) down|burn\w*out|overtime|weekends?|"
                r"stress\w*|overwhelm\w*|draining|morale)\b", re.IGNORECASE),
     0.7, {"concern", "open", "outcome_review"}),
    ("idea",
     re.compile(r"\b(we should|we could|idea:|suggest|proposal|would help)\b", re.IGNORECASE),
     0.65, None),
    ("open_question",
     re.compile(r"\?\s*$"),
     0.6, None),
]

_PROCESS_STEP_RE = re.compile(
    r"\b(first|then|next|after that|finally|step|begins with)\b", re.IGNORECASE
)


def _provenance(text: str) -> str:
    if _HEARSAY_RE.search(text):
        return "hearsay"
    if _FIRSTHAND_RE.search(text):
        return "firsthand"
    return "unknown"


def _classify(sentence: str, purpose: str) -> tuple[str, float, bool] | None:
    """Returns (kind, base_confidence, is_inference) for a sentence."""
    for kind, pattern, base, purposes in _CLASSIFIERS:
        if purposes is not None and purpose not in purposes:
            continue
        if pattern.search(sentence):
            return kind, base, False
    if purpose == "meeting_prep":
        return "meeting_topic", 0.7, False
    if purpose == "outcome_review":
        return "meeting_reflection", 0.6, False
    if purpose == "process" and _PROCESS_STEP_RE.search(sentence):
        return "process_step", 0.75, False
    if purpose == "process":
        return "process_step", 0.55, True  # inferred: unmarked sentence in a process story
    if purpose in ("expert", "decision"):
        return "claim", 0.5, True
    if purpose in ("concern", "open"):
        # Open conversations produce protected signals, never hard "facts" —
        # unmatched sentences become low-confidence friction candidates the
        # employee can simply leave unselected.
        return "friction", 0.55, True
    return None


def extract_artifacts(
    session: InterviewSession, turns: list[InterviewTurn]
) -> list[CandidateArtifact]:
    employee_turns = [t for t in turns if t.role == "employee"]
    candidates: list[CandidateArtifact] = []
    seen_summaries: set[str] = set()

    for turn in employee_turns:
        sentences = [s.strip() for s in _SENTENCE_RE.split(turn.text.replace("\n", " ")) if s.strip()]
        for sentence in sentences:
            if len(sentence) < 25:  # too short to stand alone as knowledge
                continue
            classified = _classify(sentence, session.purpose)
            if not classified:
                continue
            kind, base, is_inference = classified
            summary = sentence[:300]
            key = summary.lower()
            if key in seen_summaries:
                continue
            seen_summaries.add(key)

            provenance = _provenance(sentence)
            confidence = base
            if len(sentence) > 80:
                confidence += 0.1
            if provenance == "firsthand":
                confidence += 0.05
            if provenance == "hearsay":
                confidence -= 0.15
            confidence = round(min(max(confidence, 0.2), 0.95), 2)

            candidates.append(
                CandidateArtifact(
                    kind=kind,
                    summary=summary,
                    details={"inference": is_inference, "purpose": session.purpose},
                    confidence=confidence,
                    provenance=provenance,
                    supporting_turn_ids=[turn.id],
                    excerpt=turn.text[:400],
                    uncertain=is_inference or provenance == "hearsay",
                )
            )

    # Validation: an artifact without a source turn cannot exist.
    candidates = [c for c in candidates if c.supporting_turn_ids and c.excerpt]
    candidates.sort(key=lambda c: c.confidence, reverse=True)
    return candidates[:MAX_ARTIFACTS]
