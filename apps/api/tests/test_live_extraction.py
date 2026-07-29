"""Golden extraction checks against the real model.

Run before every demo:
    RUN_LIVE_MODEL_TESTS=1 BRAINCHAIN_ANTHROPIC_API_KEY=... \
        ../../.venv/bin/python -m pytest tests/test_live_extraction.py -v

Never runs in the default (keyless, deterministic) suite.
"""
import os
import pathlib

import pytest

pytestmark = pytest.mark.skipif(
    os.environ.get("RUN_LIVE_MODEL_TESTS") != "1",
    reason="live model tests are opt-in",
)

FIXTURES = pathlib.Path(__file__).parent / "fixtures"


def _turns(name):
    from app.services.transcripts import parse_transcript_file

    content = (FIXTURES / name).read_text()
    return parse_transcript_file(name, content)


def test_design_review_extraction_quality():
    from app.services.meeting_extraction import extract_meeting

    extraction, dropped = extract_meeting(_turns("design_review.vtt"))
    # Goldens are behavioral minimums, not exact matches.
    assert len(extraction.decisions) >= 1
    bracket = [d for d in extraction.decisions if "7075" in d.statement or "bracket" in d.statement.lower()]
    assert bracket, [d.statement for d in extraction.decisions]
    assert bracket[0].rationale, "the decision must carry its why"
    assert bracket[0].alternatives, "alternatives discussed in the meeting must be captured"
    assert len(extraction.actions) >= 1 and extraction.actions[0].owner_name
    assert len(extraction.risks) >= 2
    assert len(extraction.questions) >= 1
    assert dropped == [], f"model produced untraceable artifacts: {dropped}"


def test_supplier_call_extraction_quality():
    from app.services.meeting_extraction import extract_meeting

    extraction, _ = extract_meeting(_turns("supplier_call.txt"))
    assert extraction.decisions or extraction.risks
    assert all(d.turn_ids for d in extraction.decisions)
