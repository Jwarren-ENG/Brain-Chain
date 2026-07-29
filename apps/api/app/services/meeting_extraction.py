"""Meeting → knowledge objects.

Every knowledge object answers four questions: what happened (statement), why
(rationale), who approved it (set at review time, Task 14), and what evidence
supports it (turn_ids into the transcript). The turn-ref invariant is enforced
structurally: artifacts without resolvable evidence are dropped and reported,
never silently kept. The schema is source-agnostic on purpose — future sources
(tickets, documents, code reviews) emit the same shapes.
"""
from __future__ import annotations

import logging

from pydantic import BaseModel, Field

from .transcripts import Turn

logger = logging.getLogger("brainchain.extraction")


class ExtractedDecision(BaseModel):
    statement: str = Field(min_length=5, max_length=400)
    rationale: str = ""
    alternatives: list[str] = Field(default_factory=list)
    decided_by: str = ""
    turn_ids: list[int] = Field(min_length=1)


class ExtractedAction(BaseModel):
    description: str = Field(min_length=3, max_length=400)
    owner_name: str = ""
    due_hint: str = ""
    turn_ids: list[int] = Field(min_length=1)


class ExtractedRisk(BaseModel):
    description: str = Field(min_length=3, max_length=400)
    severity: str = ""
    turn_ids: list[int] = Field(min_length=1)


class ExtractedQuestion(BaseModel):
    question: str = Field(min_length=3, max_length=400)
    raised_by: str = ""
    turn_ids: list[int] = Field(min_length=1)


class MeetingExtraction(BaseModel):
    summary: str = ""
    decisions: list[ExtractedDecision] = Field(default_factory=list)
    actions: list[ExtractedAction] = Field(default_factory=list)
    risks: list[ExtractedRisk] = Field(default_factory=list)
    questions: list[ExtractedQuestion] = Field(default_factory=list)


def validate_against_turns(
    extraction: MeetingExtraction, turns: list[Turn]
) -> tuple[MeetingExtraction, list[str]]:
    """Drop any artifact whose turn refs don't resolve. Metadata-only logging."""
    valid = {t.idx for t in turns}
    dropped: list[str] = []

    def keep(items, label, text_of):
        kept = []
        for item in items:
            if set(item.turn_ids) <= valid:
                kept.append(item)
            else:
                dropped.append(f"{label} \"{text_of(item)[:80]}\": unresolvable turns "
                               f"{sorted(set(item.turn_ids) - valid)}")
        return kept

    clean = MeetingExtraction(
        summary=extraction.summary,
        decisions=keep(extraction.decisions, "decision", lambda d: d.statement),
        actions=keep(extraction.actions, "action", lambda a: a.description),
        risks=keep(extraction.risks, "risk", lambda r: r.description),
        questions=keep(extraction.questions, "question", lambda q: q.question),
    )
    if dropped:
        logger.warning("extraction dropped %d untraceable artifacts", len(dropped))
    return clean, dropped
