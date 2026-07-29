"""The Interviewer — AI job #1 of the Brain Interview engine.

Chooses the next helpful question. It is strictly separated from extraction
(job #2) and can never publish knowledge. The local provider is deterministic:
it tracks which purpose-framework fields the employee has already covered
(keyword heuristics) and asks about the first uncovered one, with three
adaptive behaviors layered on top:

  * vague answers trigger one request for a concrete example;
  * hearsay markers trigger one firsthand/hearsay clarification;
  * sensitive-topic markers produce a gentle redirect and a warning flag —
    the interviewer never digs into protected, medical, personal or unrelated
    territory, and never promises anonymity in a voice session.

The provider interface (generate_reply) matches what a model-gateway-backed
interviewer would implement, so swapping providers changes configuration, not
call sites.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

from ..models import InterviewSession, InterviewTurn

MAX_QUESTIONS = {"voice": 12, "text": 12, "quick_voice": 3, "quick_text": 3}


@dataclass
class InterviewerEnvelope:
    """Validated structured output. No hidden reasoning is exposed — `reason`
    is a short user-facing category such as "exception" or "provenance"."""

    message: str
    question: str | None
    reason: str
    can_complete: bool
    unresolved_fields: list[str] = field(default_factory=list)
    sensitive_warning: str | None = None

    def as_dict(self) -> dict:
        return {
            "message": self.message,
            "question": self.question,
            "reason": self.reason,
            "can_complete": self.can_complete,
            "unresolved_fields": self.unresolved_fields,
            "sensitive_warning": self.sensitive_warning,
        }


# ---------------------------------------------------------- purpose frameworks

# field key → (coverage keywords, question, reason category)
FRAMEWORKS: dict[str, list[tuple[str, set[str], str]]] = {
    "process": [
        ("steps", {"first", "then", "next", "step", "steps", "process", "after", "finally"},
         "Walk me through the process from the beginning — what happens first, and what follows?"),
        ("participants", {"team", "engineering", "procurement", "finance", "owner", "owns",
                          "responsible", "who", "role"},
         "Who is involved at each stage, and who owns the handoffs between teams?"),
        ("systems", {"system", "systems", "jira", "erp", "spreadsheet", "tool", "email", "form"},
         "Which systems or tools does this run through — and where does it leave them?"),
        ("exceptions", {"except", "exception", "unless", "skip", "sometimes", "workaround",
                        "instead", "special"},
         "When does the documented path not apply? Any exceptions or workarounds people use?"),
        ("bottleneck", {"slow", "slowest", "bottleneck", "waiting", "blocks", "delay", "queue"},
         "Where does this slow down or get stuck most often?"),
        ("improvement", {"improve", "better", "should", "wish", "idea", "change"},
         "If you could change one thing about how this works, what would it be?"),
    ],
    "meeting_prep": [
        ("topics", {"discuss", "topic", "agenda", "talk", "cover", "decide", "need"},
         "What should the group discuss or decide in this meeting?"),
        ("evidence", {"because", "data", "evidence", "seen", "numbers", "example"},
         "What evidence or examples should the group see to take this seriously?"),
        ("risks", {"risk", "concern", "worried", "objection", "blocker"},
         "Are there risks or objections you expect to come up?"),
        ("outcome", {"outcome", "decision", "agree", "resolve", "owner"},
         "What would a good outcome of the meeting look like to you?"),
    ],
    "concern": [
        ("issue", {"problem", "issue", "concern", "slow", "friction", "risk", "broken", "workload"},
         "What is the issue, in your own words?"),
        ("impact", {"affects", "affected", "impact", "team", "everyone", "blocks", "delays"},
         "Who or what does this affect, and how much?"),
        ("frequency", {"every", "daily", "weekly", "always", "often", "sometimes", "quarter"},
         "How often does this happen — is it constant or occasional?"),
        ("suggestion", {"should", "could", "suggest", "fix", "change", "idea"},
         "What change do you think would help?"),
    ],
    "decision": [
        ("decision", {"decided", "decision", "chose", "going", "will"},
         "What exactly was decided, in one or two sentences?"),
        ("alternatives", {"alternative", "option", "considered", "instead"},
         "What alternatives were considered, and why were they set aside?"),
        ("rationale", {"because", "rationale", "reason", "why", "evidence"},
         "What was the main reasoning behind choosing this path?"),
        ("dissent", {"disagreed", "dissent", "objected", "pushed", "preferred", "concern"},
         "Did anyone disagree or prefer a different option? Unresolved dissent is worth recording."),
        ("assumptions", {"assume", "assuming", "assumption", "depends"},
         "What assumptions does this decision depend on?"),
        ("metrics", {"metric", "success", "measure", "kpi", "target"},
         "How will the company know whether this decision worked?"),
    ],
    "expert": [
        ("heuristics", {"rule", "thumb", "always", "never", "check", "make", "sure", "tip"},
         "What rules of thumb do you rely on that aren't written down anywhere?"),
        ("diagnostics", {"first", "look", "ask", "symptom", "diagnose", "cause"},
         "When something goes wrong in your area, what do you check first?"),
        ("failures", {"fail", "failure", "mistake", "wrong", "trap", "gotcha"},
         "What failure patterns have you seen more than once?"),
        ("edge_cases", {"edge", "rare", "unusual", "except", "corner"},
         "Any edge cases a newcomer would never guess?"),
        ("advice", {"advice", "tell", "newcomer", "successor", "learn"},
         "If a new colleague took over tomorrow, what would you tell them on day one?"),
    ],
    "outcome_review": [
        ("intent", {"intended", "goal", "plan", "supposed", "expected"},
         "What was the plan or intervention supposed to achieve?"),
        ("implementation", {"implemented", "rolled", "done", "executed", "partial"},
         "Was it implemented the way it was approved, or did reality differ?"),
        ("results", {"result", "results", "worked", "improved", "worse", "outcome", "number"},
         "What actually happened? Better, worse, mixed?"),
        ("side_effects", {"unintended", "side", "surprise", "unexpected", "consequence"},
         "Were there unintended consequences — good or bad?"),
        ("lessons", {"lesson", "learned", "next", "differently", "keep"},
         "What should the company remember from this for next time?"),
    ],
    # "Just talk" — a natural conversation, not a checklist. The fields are
    # gentle openers the interviewer can reach for, in a listening order.
    "open": [
        ("whats_up", {"week", "lately", "going", "feel", "feeling", "honestly", "tired",
                      "great", "good", "bad", "stressed"},
         "How have things been going for you lately — honestly?"),
        ("driver", {"because", "since", "driver", "cause", "reason", "started"},
         "What do you think is driving that the most?"),
        ("duration", {"weeks", "months", "always", "recently", "started", "since"},
         "Has this been building for a while, or is it recent?"),
        ("support", {"help", "support", "manager", "team", "change", "better", "fix"},
         "What would actually make this better — even a small thing?"),
        ("bright_spot", {"enjoy", "proud", "best", "works", "love", "win"},
         "And on the other side — what's been working well, or kept you going?"),
    ],
}

OPENING_QUESTIONS: dict[str, str] = {
    "process": "Let's capture how this really works. Walk me through the process from the "
               "beginning — what happens first?",
    "meeting_prep": "What should this meeting discuss, decide, or understand? Share it in your "
                    "own words.",
    "concern": "What's on your mind? Describe the issue or idea in your own words — you can "
               "finish and review at any point.",
    "decision": "Let's document this decision so the company remembers it. What was decided?",
    "expert": "Let's capture what only you know. What do you rely on in your work that isn't "
              "written down anywhere?",
    "outcome_review": "Let's look at how this actually went. What was the plan supposed to "
                      "achieve?",
    "open": "This is your space — no agenda, no form. How have things been going for you "
            "lately? Say it however it comes out.",
}

_HEARSAY_RE = re.compile(
    r"\b(i heard|apparently|they say|someone said|supposedly|rumor|second-hand)\b", re.IGNORECASE
)
_SENSITIVE_RE = re.compile(
    r"\b(medical|diagnos\w*|disability|pregnan\w*|religio\w*|union organiz\w*|therapy|"
    r"mental health|medication|salary of|divorce|immigration status)\b",
    re.IGNORECASE,
)

_ACK_BY_REASON = {
    "framework": "Understood.",
    "example": "That helps.",
    "provenance": "Noted.",
    "wrap_up": "Thank you — that's genuinely useful.",
}

# Natural-conversation acknowledgments. Deterministic (indexed by turn count)
# so the demo and tests stay reproducible; chosen by tone, never judgmental,
# never scoring the person — this reflects what was said, nothing more.
_NEGATIVE_TONE = re.compile(
    r"\b(stress\w*|exhaust\w*|frustrat\w*|burn\w*|overwhelm\w*|tired|worn (out|down)|"
    r"wearing (me|us|people) down|worried|anxious|drain\w*|slow|blocked|unfair|ignored|"
    r"weekends?|overtime|too much|struggling)\b",
    re.IGNORECASE,
)
_POSITIVE_TONE = re.compile(
    r"\b(great|good|proud|enjoy\w*|love|win|improv\w*|better|excited|happy)\b", re.IGNORECASE
)
_ACKS_NEGATIVE = [
    "That sounds genuinely hard.",
    "Thanks for being straight about that.",
    "That would wear anyone down.",
]
_ACKS_POSITIVE = [
    "Good to hear.",
    "That's worth holding onto.",
]
_ACKS_NEUTRAL = [
    "Okay.",
    "Got it.",
    "Thanks — keep going, or finish whenever you like.",
]


def _conversational_ack(last_text: str, turn_index: int) -> str:
    if _NEGATIVE_TONE.search(last_text):
        return _ACKS_NEGATIVE[turn_index % len(_ACKS_NEGATIVE)]
    if _POSITIVE_TONE.search(last_text):
        return _ACKS_POSITIVE[turn_index % len(_ACKS_POSITIVE)]
    return _ACKS_NEUTRAL[turn_index % len(_ACKS_NEUTRAL)]


def opening_envelope(session: InterviewSession) -> InterviewerEnvelope:
    question = OPENING_QUESTIONS.get(session.purpose, OPENING_QUESTIONS["concern"])
    message = ""
    if session.mode in ("voice", "quick_voice"):
        # Never promise anonymity in a voice session.
        message = "Recording is on and visible. This session is attributed to you — voice can't be anonymous."
    return InterviewerEnvelope(
        message=message,
        question=question,
        reason="framework",
        can_complete=False,
        unresolved_fields=[f for f, _, _ in FRAMEWORKS.get(session.purpose, [])],
    )


def generate_reply(session: InterviewSession, turns: list[InterviewTurn]) -> InterviewerEnvelope:
    """Deterministic local interviewer. Pure function of session + turns."""
    framework = FRAMEWORKS.get(session.purpose, FRAMEWORKS["concern"])
    employee_turns = [t for t in turns if t.role == "employee"]
    asked: list[str] = list(session.asked_fields or [])
    last = employee_turns[-1] if employee_turns else None
    last_text = (last.text if last else "").strip()

    corpus = " ".join(t.text.lower() for t in employee_turns)
    words = set(re.findall(r"[a-z']+", corpus))

    covered = {key for key, keywords, _ in framework if words & keywords}
    unresolved = [key for key, _, _ in framework if key not in covered]

    questions_asked = len(asked)
    limit = MAX_QUESTIONS.get(session.mode, 12)

    sensitive = None
    if last_text and _SENSITIVE_RE.search(last_text):
        sensitive = (
            "That touches on personal or protected territory, which this interview "
            "deliberately doesn't collect. Let's keep the focus on the work itself."
        )

    def envelope(question: str | None, reason: str, *, can_complete: bool) -> InterviewerEnvelope:
        if session.purpose == "open":
            # Natural conversation: reflective acknowledgment, no checklist tone.
            message = _conversational_ack(last_text, len(employee_turns))
        else:
            message = _ACK_BY_REASON.get(reason, "Understood.")
        return InterviewerEnvelope(
            message=message,
            question=question,
            reason=reason,
            can_complete=can_complete,
            unresolved_fields=unresolved,
            sensitive_warning=sensitive,
        )

    # Hard stop: question budget spent → offer completion.
    if questions_asked >= limit:
        return InterviewerEnvelope(
            message="I have what I need — thank you.",
            question=None,
            reason="wrap_up",
            can_complete=True,
            unresolved_fields=unresolved,
            sensitive_warning=sensitive,
        )

    # Sensitive content: redirect to the next framework question, never probe.
    if sensitive:
        next_field = next((f for f in unresolved if f not in asked), None)
        if next_field:
            question = next(q for key, _, q in framework if key == next_field)
            return envelope(question, "framework", can_complete=len(covered) >= 1)
        return envelope(None, "wrap_up", can_complete=True)

    # Adaptive behavior 1: hearsay clarification, once per session.
    if last_text and _HEARSAY_RE.search(last_text) and "provenance" not in asked:
        return envelope(
            "Did you see this yourself, or did you hear it from someone else? "
            "Both are useful — the brain just records them differently.",
            "provenance",
            can_complete=len(covered) >= 1,
        )

    # Adaptive behavior 2: vague short answers get one example request.
    # (Skipped for open conversations — someone sharing how they feel should
    # never be pressed for "a concrete example".)
    if (
        session.purpose != "open"
        and last_text
        and len(last_text) < 60
        and not last_text.endswith("?")
        and "example" not in asked
        and questions_asked >= 1
    ):
        return envelope(
            "Could you give one concrete example of that?",
            "example",
            can_complete=len(covered) >= 1,
        )

    # Core behavior: first uncovered, un-asked framework field.
    next_field = next((f for f in unresolved if f not in asked), None)
    if next_field:
        question = next(q for key, _, q in framework if key == next_field)
        return envelope(question, "framework", can_complete=len(covered) >= 1)

    # Everything asked or covered → wrap up.
    if session.purpose == "open":
        return InterviewerEnvelope(
            message=_conversational_ack(last_text, len(employee_turns)),
            question="Is there anything else you want to get off your chest? "
            "Finish whenever you're ready — you'll see exactly what would be shared.",
            reason="wrap_up",
            can_complete=True,
            unresolved_fields=unresolved,
            sensitive_warning=sensitive,
        )
    return InterviewerEnvelope(
        message="Thank you — that covers what I hoped to understand.",
        question="Anything else the company should understand about this? "
        "You can finish and review whenever you're ready.",
        reason="wrap_up",
        can_complete=True,
        unresolved_fields=unresolved,
        sensitive_warning=sensitive,
    )


def field_for_reason(envelope: InterviewerEnvelope, session: InterviewSession) -> str:
    """The memory key recorded in asked_fields for this envelope."""
    if envelope.reason == "framework":
        framework = FRAMEWORKS.get(session.purpose, FRAMEWORKS["concern"])
        for key, _, question in framework:
            if question == envelope.question:
                return key
    return envelope.reason
