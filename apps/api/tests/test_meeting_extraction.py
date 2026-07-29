"""Knowledge-object schema: the turn-ref invariant is enforced here."""
import pytest
from pydantic import ValidationError

from app.services.meeting_extraction import (
    ExtractedDecision,
    MeetingExtraction,
    validate_against_turns,
)
from app.services.transcripts import Turn

TURNS = [Turn(0, "Maria", "We decided to switch to 7075."),
         Turn(1, "David", "Margin was insufficient with 6061.")]


def test_decision_requires_nonempty_turn_ids():
    with pytest.raises(ValidationError):
        ExtractedDecision(statement="Switch to 7075", turn_ids=[])


def test_validate_drops_artifacts_with_unresolvable_turns():
    extraction = MeetingExtraction(
        decisions=[
            ExtractedDecision(statement="Switch to 7075", rationale="margin",
                              turn_ids=[0, 1]),
            ExtractedDecision(statement="Hallucinated decision", turn_ids=[99]),
        ]
    )
    clean, dropped = validate_against_turns(extraction, TURNS)
    assert len(clean.decisions) == 1
    assert clean.decisions[0].statement == "Switch to 7075"
    assert len(dropped) == 1 and "Hallucinated decision" in dropped[0]


def test_validate_keeps_valid_everything():
    extraction = MeetingExtraction(
        decisions=[ExtractedDecision(statement="Switch to 7075", turn_ids=[0])])
    clean, dropped = validate_against_turns(extraction, TURNS)
    assert dropped == [] and len(clean.decisions) == 1
