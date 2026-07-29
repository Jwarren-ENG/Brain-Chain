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


from app.services.meeting_extraction import (
    AnthropicExtractionProvider,
    ExtractionError,
    MockExtractionProvider,
    extract_meeting,
)

MEETING_TURNS = [
    Turn(0, "Maria Santos", "We decided to switch the bracket to 7075 aluminum."),
    Turn(1, "David Kim", "The load analysis showed insufficient margin with 6061."),
    Turn(2, "Maria Santos", "Priya will update the structural report by Friday."),
    Turn(3, "Priya Patel", "I'm worried about a delay on supplier requalification."),
    Turn(4, "David Kim", "Should we requalify Supplier C as well?"),
]


def test_mock_extraction_is_deterministic_and_traceable():
    provider = MockExtractionProvider()
    a = provider.extract(MEETING_TURNS)
    b = provider.extract(MEETING_TURNS)
    assert a == b
    assert any("7075" in d.statement for d in a.decisions)
    assert all(d.turn_ids for d in a.decisions)
    assert any("requalification" in r.description or "delay" in r.description
               for r in a.risks)
    assert any(q.question.endswith("?") for q in a.questions)


def test_extract_meeting_uses_mock_when_keyless(monkeypatch):
    from app.config import get_settings
    monkeypatch.delenv("BRAINCHAIN_ANTHROPIC_API_KEY", raising=False)
    get_settings.cache_clear()
    extraction, dropped = extract_meeting(MEETING_TURNS)
    assert extraction.decisions and dropped == []


class _Obj:
    def __init__(self, **kw):
        self.__dict__.update(kw)


class FakeClient:
    def __init__(self, payloads):
        self._payloads = list(payloads)
        self.calls = []
        self.messages = self

    def create(self, **kwargs):
        self.calls.append(kwargs)
        block = _Obj(type="tool_use", name="emit_extraction",
                     input=self._payloads.pop(0))
        return _Obj(content=[block], usage=_Obj(input_tokens=1, output_tokens=1))


def test_anthropic_extraction_parses_and_validates():
    payload = {
        "summary": "Bracket material review",
        "decisions": [{"statement": "Switch bracket to 7075 aluminum",
                       "rationale": "insufficient margin with 6061",
                       "alternatives": ["stay on 6061"],
                       "decided_by": "Maria Santos", "turn_ids": [0, 1]}],
        "actions": [{"description": "Update structural report",
                     "owner_name": "Priya Patel", "due_hint": "Friday", "turn_ids": [2]}],
        "risks": [{"description": "Supplier requalification delay", "turn_ids": [3]}],
        "questions": [{"question": "Requalify Supplier C as well?",
                       "raised_by": "David Kim", "turn_ids": [4]}],
    }
    fake = FakeClient([payload])
    provider = AnthropicExtractionProvider("k", "claude-sonnet-5",
                                           client_factory=lambda: fake)
    extraction, dropped = extract_meeting(MEETING_TURNS, provider=provider)
    assert dropped == []
    assert extraction.decisions[0].alternatives == ["stay on 6061"]
    # turn text was sent with [T#] markers
    sent = str(fake.calls[0]["messages"])
    assert "[T0] Maria Santos:" in sent


def test_anthropic_extraction_drops_untraceable_artifacts():
    payload = {"decisions": [{"statement": "Invented decision", "turn_ids": [42]}]}
    fake = FakeClient([payload])
    provider = AnthropicExtractionProvider("k", "m", client_factory=lambda: fake)
    extraction, dropped = extract_meeting(MEETING_TURNS, provider=provider)
    assert extraction.decisions == [] and len(dropped) == 1


def test_anthropic_extraction_retries_then_raises():
    fake = FakeClient([{"decisions": "garbage"}, {"decisions": "garbage"}])
    provider = AnthropicExtractionProvider("k", "m", client_factory=lambda: fake)
    with pytest.raises(ExtractionError):
        extract_meeting(MEETING_TURNS, provider=provider)
    assert len(fake.calls) == 2


class _ExplodingClient:
    def __init__(self):
        self.messages = self

    def create(self, **kwargs):
        raise RuntimeError("connection reset")


def test_anthropic_extraction_transport_failure_raises_extraction_error():
    """A raw anthropic/network exception must never escape as-is — callers
    downstream (import, connector sync, retry endpoint) catch only
    ExtractionError, never a bare RuntimeError/anthropic exception."""
    provider = AnthropicExtractionProvider("k", "m", client_factory=_ExplodingClient)
    with pytest.raises(ExtractionError):
        extract_meeting(MEETING_TURNS, provider=provider)


def test_get_extraction_provider_respects_external_model_governance_gate(monkeypatch):
    """Government deployments force external_models_allowed False even with an
    API key configured — extraction must fall back to the mock provider."""
    from app.config import Settings, get_settings
    from app.services.meeting_extraction import MockExtractionProvider, get_extraction_provider

    monkeypatch.setenv("BRAINCHAIN_ANTHROPIC_API_KEY", "k")
    monkeypatch.setenv("BRAINCHAIN_DEPLOYMENT_PROFILE", "government")
    get_settings.cache_clear()
    try:
        assert isinstance(get_extraction_provider(), MockExtractionProvider)
    finally:
        monkeypatch.delenv("BRAINCHAIN_ANTHROPIC_API_KEY", raising=False)
        monkeypatch.delenv("BRAINCHAIN_DEPLOYMENT_PROFILE", raising=False)
        get_settings.cache_clear()


def test_get_extraction_provider_uses_anthropic_when_allowed(monkeypatch):
    """Both governance gates must be open: deployment-level (env/profile) AND
    the org-level external_models_enabled admin toggle."""
    from app.config import get_settings
    from app.services.meeting_extraction import AnthropicExtractionProvider, get_extraction_provider

    monkeypatch.setenv("BRAINCHAIN_ANTHROPIC_API_KEY", "k")
    monkeypatch.setenv("BRAINCHAIN_ALLOW_EXTERNAL_MODEL_CALLS", "true")
    monkeypatch.setenv("BRAINCHAIN_DEPLOYMENT_PROFILE", "commercial")
    get_settings.cache_clear()
    try:
        assert isinstance(
            get_extraction_provider(org_settings={"external_models_enabled": True}),
            AnthropicExtractionProvider,
        )
    finally:
        monkeypatch.delenv("BRAINCHAIN_ANTHROPIC_API_KEY", raising=False)
        monkeypatch.delenv("BRAINCHAIN_ALLOW_EXTERNAL_MODEL_CALLS", raising=False)
        monkeypatch.delenv("BRAINCHAIN_DEPLOYMENT_PROFILE", raising=False)
        get_settings.cache_clear()


def test_get_extraction_provider_requires_org_gate_even_when_env_allows(monkeypatch):
    """Env/profile fully allow external calls and an API key is set, but the
    org admin setting external_models_enabled is False (or org is omitted) —
    extraction must still fall back to the mock provider."""
    from app.config import get_settings
    from app.services.meeting_extraction import MockExtractionProvider, get_extraction_provider

    monkeypatch.setenv("BRAINCHAIN_ANTHROPIC_API_KEY", "k")
    monkeypatch.setenv("BRAINCHAIN_ALLOW_EXTERNAL_MODEL_CALLS", "true")
    monkeypatch.setenv("BRAINCHAIN_DEPLOYMENT_PROFILE", "commercial")
    get_settings.cache_clear()
    try:
        # org omitted entirely
        assert isinstance(get_extraction_provider(), MockExtractionProvider)
        # org explicitly disables external models
        assert isinstance(
            get_extraction_provider(org_settings={"external_models_enabled": False}),
            MockExtractionProvider,
        )
    finally:
        monkeypatch.delenv("BRAINCHAIN_ANTHROPIC_API_KEY", raising=False)
        monkeypatch.delenv("BRAINCHAIN_ALLOW_EXTERNAL_MODEL_CALLS", raising=False)
        monkeypatch.delenv("BRAINCHAIN_DEPLOYMENT_PROFILE", raising=False)
        get_settings.cache_clear()


def test_persist_extraction_lands_proposed_artifacts():
    from app.db import SessionLocal
    from app.models import Decision, Document, Meeting, Task
    from app.services.ingestion import ingest_document
    from app.services.meeting_extraction import persist_extraction
    from app.services.transcripts import turns_to_document_text, turns_to_meta

    db = SessionLocal()
    try:
        org_id = db.query(Meeting).first().org_id
        classification_id = db.query(Document).first().classification_id
        doc = ingest_document(db, org_id=org_id, title="Transcript — test",
                              content=turns_to_document_text(MEETING_TURNS),
                              doc_type="transcript", classification_id=classification_id,
                              acl=[("org", "*")])
        meeting = Meeting(org_id=org_id, title="test import", source="upload",
                          transcript_document_id=doc.id,
                          attendees=["Maria Santos"],
                          extraction={"turns": turns_to_meta(MEETING_TURNS)})
        db.add(meeting)
        db.flush()
        extraction, dropped = extract_meeting(MEETING_TURNS)  # mock provider
        counts = persist_extraction(db, meeting, doc, extraction, dropped)
        assert counts["decisions"] >= 1 and counts["risks"] >= 1
        d = db.query(Decision).filter(Decision.meeting_id == meeting.id).first()
        assert d.status == "proposed"
        assert d.details["turn_ids"]
        assert d.sources == [doc.id]
        t = db.query(Task).filter(Task.meeting_id == meeting.id).first()
        assert t.status == "proposed"
        assert meeting.extraction["risks"][0]["status"] == "proposed"
        assert meeting.extraction["risks"][0]["rid"] == "r0"
    finally:
        db.rollback()
        db.close()
