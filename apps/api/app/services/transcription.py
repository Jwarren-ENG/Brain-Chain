"""Transcription provider abstraction for voice interviews.

The local/demo profile works with no external keys: the mock provider emits a
deterministic transcript stream appropriate to the interview purpose, so the
whole voice lifecycle (consent → record → transcribe → correct → finish) is
exercisable offline. A real provider (any OpenAI-compatible /audio endpoint or
vendor SDK) implements the same interface and is configured exclusively via
environment variables — provider secrets never enter the browser bundle, the
database, the repository, logs, or audit metadata.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from ..config import get_settings
from ..models import InterviewSession


class TranscriptionError(Exception):
    """User-safe transcription failure. The message is a failure code, never a
    provider stack trace."""

    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


@dataclass
class TranscriptChunk:
    text: str
    confidence: float
    final: bool  # False once the mock script is exhausted


class TranscriptionProvider(Protocol):
    name: str

    def transcribe_next(self, session: InterviewSession, chunk_index: int) -> TranscriptChunk: ...


# Deterministic demo scripts per purpose. These simulate what the speaker said;
# the employee can correct any line before finishing (transcript correction is
# a first-class feature, not an afterthought).
_MOCK_SCRIPTS: dict[str, list[str]] = {
    "expert": [
        "Rule of thumb: always soak the thermal chamber for two hours before a qualification "
        "run, otherwise the first cycle data is unusable.",
        "The first thing I check when vibration data looks wrong is the accelerometer mounting, "
        "not the article - loose mounts have fooled us twice.",
        "Never schedule a thermal cycle to finish on a Friday afternoon; failures found at "
        "17:00 wait a weekend and that has cost us schedule twice this year.",
    ],
    "process": [
        "The supplier qualification starts when procurement opens a request with three quotes.",
        "Then engineering reviews sample parts against the qualification checklist before any "
        "purchase order is placed.",
        "The slowest step is the financial-health check because finance runs it once a week.",
    ],
    "decision": [
        "We decided to run the thermal and vibration campaigns in parallel starting August 4.",
        "The alternative was keeping the serial plan, but that made the October build impossible.",
        "Success metric: qualification complete before the flight readiness review.",
    ],
    "concern": [
        "The integration schedule assumes weekend availability and that is wearing the team down.",
        "It affects the whole harness team, and it has been every weekend for a month.",
    ],
    "meeting_prep": [
        "We need to align on the battery buffer-stock quantity before the October build.",
    ],
    "outcome_review": [
        "The parallel campaign was supposed to recover two weeks of schedule.",
        "It was implemented as approved, and we recovered about ten days - close to plan.",
        "Lesson: book the chamber slot before announcing the plan next time.",
    ],
    "open": [
        "Honestly, the last month has been draining - the integration schedule assumes "
        "weekends and it is starting to wear the team down.",
        "It started when the chamber slot slipped; since then every plan has been built "
        "on overtime.",
        "A realistic schedule would help more than anything - even one protected weekend "
        "a month would change the mood.",
    ],
}


class MockTranscriptionProvider:
    """Deterministic offline transcription. `simulate_failure` is honored via
    transcribe_next's TranscriptionError so failure/recovery UX is testable."""

    name = "mock-transcription-1"

    def transcribe_next(self, session: InterviewSession, chunk_index: int) -> TranscriptChunk:
        script = _MOCK_SCRIPTS.get(session.purpose, _MOCK_SCRIPTS["concern"])
        if chunk_index >= len(script):
            return TranscriptChunk(text="", confidence=1.0, final=False)
        return TranscriptChunk(text=script[chunk_index], confidence=0.92, final=True)


def get_transcription_provider() -> TranscriptionProvider:
    settings = get_settings()
    # A real provider would be selected here from env configuration. The mock
    # is the default and the only provider exercised in the demo profile.
    _ = settings
    return MockTranscriptionProvider()
