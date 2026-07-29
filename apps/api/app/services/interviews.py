"""Brain Interview session service: state machine, access resolution, turn
management, completion/extraction, failure recovery, deletion propagation.

All workflow rules live here — route handlers stay thin, and the frontend
never decides transition validity.
"""
from __future__ import annotations

import secrets

from fastapi import HTTPException
from fastapi import status as http_status
from sqlalchemy.orm import Session

from ..models import (
    AccessControlEntry,
    AudioAsset,
    Citation,
    Decision,
    Document,
    DocumentChunk,
    DocumentVersion,
    FeedbackSubmission,
    InterviewArtifact,
    InterviewSession,
    InterviewTurn,
    Meeting,
    Task,
    User,
    utcnow,
)
from ..security.audit import record
from ..security.permissions import can_read_document
from . import interviewer as interviewer_service
from .interview_extraction import extract_artifacts
from .transcription import TranscriptionError, get_transcription_provider

VOICE_MODES = {"voice", "quick_voice"}
QUICK_MODES = {"quick_voice", "quick_text"}

# The state machine. Publishing from anything but review_required is invalid —
# employee review is mandatory by construction.
TRANSITIONS: dict[str, set[str]] = {
    "draft": {"active", "consent_required", "discarded"},
    "consent_required": {"active", "discarded"},
    "active": {"paused", "processing", "failed", "discarded"},
    "paused": {"active", "processing", "discarded"},
    "processing": {"review_required", "failed"},
    "failed": {"active", "processing", "discarded"},
    "review_required": {"published", "discarded"},
    "published": set(),
    "discarded": set(),
}


class InvalidTransition(HTTPException):
    def __init__(self, current: str, target: str):
        super().__init__(
            http_status.HTTP_409_CONFLICT,
            f"Cannot move an interview from '{current}' to '{target}'.",
        )


def transition(session: InterviewSession, target: str) -> None:
    if target not in TRANSITIONS.get(session.status, set()):
        raise InvalidTransition(session.status, target)
    session.status = target


def _audit(db: Session, session: InterviewSession, action: str, meta: dict | None = None) -> None:
    """Interview audit events carry identifiers and counts — never turn text,
    and never an actor for anonymous sessions."""
    record(
        db,
        session.org_id,
        action,
        actor_user_id=session.user_id,  # None ⇔ anonymous, by construction
        target_type="interview_session",
        target_id=session.id,
        meta={"mode": session.mode, "purpose": session.purpose,
              "visibility": session.visibility, **(meta or {})},
    )


# ------------------------------------------------------------------- creation


def create_session(
    db: Session,
    user: User,
    *,
    mode: str,
    purpose: str,
    visibility: str,
    title: str = "",
    meeting_id: str | None = None,
    entity_id: str | None = None,
    decision_id: str | None = None,
    agent_run_id: str | None = None,
    assignment_id: str | None = None,
) -> InterviewSession:
    if mode in VOICE_MODES and visibility == "anonymous":
        # Reject before any row exists: a voice can identify its speaker even
        # with account metadata removed, so the promise would be false.
        raise HTTPException(
            http_status.HTTP_422_UNPROCESSABLE_CONTENT,
            "Voice interviews cannot be anonymous — a voice can identify its speaker. "
            "Choose confidential or named, or switch to a text interview.",
        )
    if assignment_id:
        from .interview_assignments import resolve_for_response

        assignment = resolve_for_response(db, user, assignment_id, visibility)
        purpose = assignment.purpose
        title = title or assignment.title
    if meeting_id:
        meeting = db.get(Meeting, meeting_id)
        if not meeting or meeting.org_id != user.org_id:
            raise HTTPException(http_status.HTTP_404_NOT_FOUND, "Meeting not found")

    is_anonymous = visibility == "anonymous"
    session = InterviewSession(
        org_id=user.org_id,
        user_id=None if is_anonymous else user.id,
        receipt_token=secrets.token_urlsafe(24),
        mode=mode,
        purpose=purpose,
        visibility=visibility,
        title=title[:300],
        meeting_id=meeting_id,
        entity_id=entity_id,
        decision_id=decision_id,
        agent_run_id=agent_run_id,
        assignment_id=assignment_id,
        provider_meta={"interviewer": "deterministic-local-1"},
    )
    if is_anonymous:
        coarse = utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
        session.created_at = coarse
        session.updated_at = coarse
    db.add(session)
    db.flush()
    _audit(db, session, "interview.created")
    db.commit()
    return session


# ------------------------------------------------------------------- access


def resolve_session(
    db: Session, user: User, session_id: str, receipt: str | None = None
) -> InterviewSession:
    """Owner-or-receipt access. Everyone else gets the same 404 a missing
    session would produce — there is no manager/executive/admin view of an
    individual interview, ever."""
    session = db.get(InterviewSession, session_id)
    if not session or session.org_id != user.org_id:
        raise HTTPException(http_status.HTTP_404_NOT_FOUND, "Interview not found")
    if session.visibility == "anonymous":
        if not receipt or receipt != session.receipt_token:
            raise HTTPException(http_status.HTTP_404_NOT_FOUND, "Interview not found")
    elif session.user_id != user.id:
        raise HTTPException(http_status.HTTP_404_NOT_FOUND, "Interview not found")
    return session


def authorized_context_documents(db: Session, user: User, session: InterviewSession) -> list:
    """Context documents pass the *caller's* ACL check before the interviewer
    ever sees them (invariant 7). Currently used for meeting context."""
    docs = []
    if session.meeting_id:
        meeting = db.get(Meeting, session.meeting_id)
        if meeting and meeting.transcript_document_id:
            doc = db.get(Document, meeting.transcript_document_id)
            if doc and can_read_document(db, user, doc):
                docs.append(doc)
    return docs


# ------------------------------------------------------------------ lifecycle


def start(db: Session, session: InterviewSession) -> None:
    if session.mode in VOICE_MODES:
        transition(session, "consent_required")
    else:
        transition(session, "active")
        session.started_at = utcnow()
        _append_interviewer_turn(db, session, interviewer_service.opening_envelope(session))
    _audit(db, session, "interview.started")
    db.commit()


def give_consent(db: Session, session: InterviewSession, audio_retention_policy: str) -> None:
    if session.mode not in VOICE_MODES:
        raise HTTPException(
            http_status.HTTP_409_CONFLICT, "Consent applies only to voice interviews."
        )
    transition(session, "active")
    session.consent_at = utcnow()
    session.started_at = session.started_at or utcnow()
    session.audio_retention_policy = audio_retention_policy
    _append_interviewer_turn(db, session, interviewer_service.opening_envelope(session))
    _audit(db, session, "interview.consented",
           {"audio_retention_policy": audio_retention_policy})
    db.commit()


def _require_active(session: InterviewSession) -> None:
    if session.status != "active":
        raise HTTPException(
            http_status.HTTP_409_CONFLICT,
            f"This interview is '{session.status}'"
            + (" — consent is required before the microphone or turns can be used."
               if session.status == "consent_required" else "."),
        )


def _append_interviewer_turn(
    db: Session, session: InterviewSession, envelope: interviewer_service.InterviewerEnvelope
) -> None:
    if not envelope.question and not envelope.message:
        return
    text = "\n\n".join(p for p in (envelope.message, envelope.question) if p).strip()
    seq = db.query(InterviewTurn).filter(InterviewTurn.session_id == session.id).count()
    db.add(
        InterviewTurn(
            session_id=session.id,
            seq=seq,
            role="interviewer",
            text=text,
            meta={"reason": envelope.reason},
        )
    )
    if envelope.question:
        session.asked_fields = [
            *list(session.asked_fields or []),
            interviewer_service.field_for_reason(envelope, session),
        ]
    db.flush()


def add_employee_turn(
    db: Session, session: InterviewSession, text: str, *, transcription_confidence: float | None = None
) -> interviewer_service.InterviewerEnvelope:
    _require_active(session)
    seq = db.query(InterviewTurn).filter(InterviewTurn.session_id == session.id).count()
    db.add(
        InterviewTurn(
            session_id=session.id,
            seq=seq,
            role="employee",
            text=text,
            transcription_confidence=transcription_confidence,
        )
    )
    db.flush()
    turns = db.query(InterviewTurn).filter(InterviewTurn.session_id == session.id).order_by(InterviewTurn.seq).all()
    envelope = interviewer_service.generate_reply(session, turns)
    _append_interviewer_turn(db, session, envelope)
    _audit(db, session, "interview.turn_added", {"turns": seq + 1})
    db.commit()
    return envelope


def edit_turn(db: Session, session: InterviewSession, turn_id: str, text: str) -> InterviewTurn:
    if session.status not in ("active", "paused", "failed"):
        raise HTTPException(
            http_status.HTTP_409_CONFLICT,
            "Turns can only be corrected before the interview is completed.",
        )
    turn = db.get(InterviewTurn, turn_id)
    if not turn or turn.session_id != session.id:
        raise HTTPException(http_status.HTTP_404_NOT_FOUND, "Turn not found")
    if turn.role != "employee":
        raise HTTPException(http_status.HTTP_409_CONFLICT, "Only your own answers can be edited.")
    turn.text = text
    turn.edited = True
    _audit(db, session, "interview.turn_edited", {"turn": turn.seq})
    db.commit()
    return turn


def pause(db: Session, session: InterviewSession) -> None:
    if session.mode not in VOICE_MODES:
        raise HTTPException(http_status.HTTP_409_CONFLICT, "Only voice interviews pause.")
    transition(session, "paused")
    _audit(db, session, "interview.paused")
    db.commit()


def resume(db: Session, session: InterviewSession) -> None:
    transition(session, "active")
    _audit(db, session, "interview.resumed")
    db.commit()


def switch_to_text(db: Session, session: InterviewSession) -> None:
    if session.mode not in VOICE_MODES:
        raise HTTPException(http_status.HTTP_409_CONFLICT, "Already a text interview.")
    if session.status == "paused":
        transition(session, "active")
    _require_active(session)
    session.mode = "text" if session.mode == "voice" else "quick_text"
    _mark_audio_deleted(db, session)  # no further capture; honor default retention
    _audit(db, session, "interview.switched_to_text")
    db.commit()


def transcribe_chunk(
    db: Session, session: InterviewSession, *, simulate_failure: bool = False
) -> interviewer_service.InterviewerEnvelope | None:
    if session.mode not in VOICE_MODES:
        raise HTTPException(http_status.HTTP_409_CONFLICT, "Not a voice interview.")
    _require_active(session)
    if not session.consent_at:
        raise HTTPException(http_status.HTTP_409_CONFLICT, "Consent required before capture.")

    asset = db.query(AudioAsset).filter(AudioAsset.session_id == session.id).first()
    if not asset:
        asset = AudioAsset(
            session_id=session.id,
            storage_key=f"mock://interviews/{session.id}/audio",
            retention_policy=session.audio_retention_policy,
        )
        db.add(asset)
        db.flush()

    provider = get_transcription_provider()
    try:
        if simulate_failure:
            raise TranscriptionError("transcription_provider_error")
        chunk_index = (
            db.query(InterviewTurn)
            .filter(InterviewTurn.session_id == session.id, InterviewTurn.role == "employee")
            .count()
        )
        chunk = provider.transcribe_next(session, chunk_index)
    except TranscriptionError as exc:
        transition(session, "failed")
        session.failure_code = exc.code
        _audit(db, session, "interview.failed", {"failure_code": exc.code})
        db.commit()
        return None

    if not chunk.final:
        return None  # script exhausted; nothing new to add
    return add_employee_turn(
        db, session, chunk.text, transcription_confidence=chunk.confidence
    )


def retry(db: Session, session: InterviewSession) -> None:
    """Recover from `failed`: transcription failures return to the live
    conversation (transcript preserved); extraction failures re-run
    processing."""
    if session.status != "failed":
        raise InvalidTransition(session.status, "processing")
    if session.failure_code.startswith("extraction"):
        session.failure_code = ""
        complete(db, session, _from_failed=True)
        return
    transition(session, "active")
    session.failure_code = ""
    _audit(db, session, "interview.recovered")
    db.commit()


def complete(db: Session, session: InterviewSession, *, _from_failed: bool = False) -> None:
    if _from_failed:
        transition(session, "processing")
    else:
        if session.status not in ("active", "paused"):
            raise InvalidTransition(session.status, "processing")
        transition(session, "processing")
    db.commit()

    turns = (
        db.query(InterviewTurn)
        .filter(InterviewTurn.session_id == session.id)
        .order_by(InterviewTurn.seq)
        .all()
    )
    try:
        candidates = extract_artifacts(session, turns)
    except Exception:  # noqa: BLE001 — the session must record its own failure
        transition(session, "failed")
        session.failure_code = "extraction_error"
        _audit(db, session, "interview.failed", {"failure_code": "extraction_error"})
        db.commit()
        return

    for candidate in candidates:
        db.add(
            InterviewArtifact(
                session_id=session.id,
                kind=candidate.kind,
                summary=candidate.summary,
                details=candidate.details,
                confidence=candidate.confidence,
                provenance=candidate.provenance,
                selected=candidate.confidence >= 0.5 and not candidate.uncertain,
                uncertain=candidate.uncertain,
                supporting_turn_ids=candidate.supporting_turn_ids,
                excerpt=candidate.excerpt,
            )
        )
    transition(session, "review_required")
    session.completed_at = utcnow()
    _mark_audio_deleted(db, session)
    _audit(db, session, "interview.completed", {"artifacts": len(candidates)})
    db.commit()


def _mark_audio_deleted(db: Session, session: InterviewSession) -> None:
    """Default retention: raw audio does not outlive transcription."""
    if session.audio_retention_policy != "delete_after_transcription":
        return
    for asset in db.query(AudioAsset).filter(AudioAsset.session_id == session.id).all():
        if asset.status != "deleted":
            asset.status = "deleted"
            asset.deleted_at = utcnow()


def update_artifact(
    db: Session,
    session: InterviewSession,
    artifact_id: str,
    *,
    selected: bool | None = None,
    summary: str | None = None,
    uncertain: bool | None = None,
    details: dict | None = None,
) -> InterviewArtifact:
    if session.status != "review_required":
        raise HTTPException(
            http_status.HTTP_409_CONFLICT, "Artifacts are editable during review only."
        )
    artifact = db.get(InterviewArtifact, artifact_id)
    if not artifact or artifact.session_id != session.id:
        raise HTTPException(http_status.HTTP_404_NOT_FOUND, "Artifact not found")
    if selected is not None:
        artifact.selected = selected
    if summary is not None and summary.strip():
        artifact.summary = summary.strip()[:600]
        artifact.employee_edited = True
    if uncertain is not None:
        artifact.uncertain = uncertain
    if details:
        artifact.details = {**artifact.details, **details}
        artifact.employee_edited = True
    _audit(db, session, "interview.artifact_reviewed", {"kind": artifact.kind})
    db.commit()
    return artifact


def discard(db: Session, session: InterviewSession) -> None:
    transition(session, "discarded")
    _audit(db, session, "interview.discarded")
    db.commit()


# ------------------------------------------------------------------- deletion


def delete_session(db: Session, session: InterviewSession) -> dict:
    """Full propagation: turns, artifacts, audio, embeddings (chunks), derived
    unpublished objects, and published objects per documented retention
    semantics (confirmed decisions survive with linkage scrubbed)."""
    counts = {"turns": 0, "artifacts": 0, "documents": 0, "feedback": 0,
              "decisions": 0, "tasks": 0, "audio_assets": 0}

    artifacts = db.query(InterviewArtifact).filter(
        InterviewArtifact.session_id == session.id
    ).all()
    for artifact in artifacts:
        target_type, target_id = artifact.published_target_type, artifact.published_target_id
        if target_type == "document" and target_id:
            db.query(AccessControlEntry).filter(
                AccessControlEntry.document_id == target_id
            ).delete()
            db.query(Citation).filter(Citation.document_id == target_id).delete()
            db.query(DocumentChunk).filter(DocumentChunk.document_id == target_id).delete()
            db.query(DocumentVersion).filter(DocumentVersion.document_id == target_id).delete()
            doc = db.get(Document, target_id)
            if doc:
                db.delete(doc)
                counts["documents"] += 1
        elif target_type == "feedback" and target_id:
            row = db.get(FeedbackSubmission, target_id)
            if row:
                db.delete(row)
                counts["feedback"] += 1
        elif target_type == "decision" and target_id:
            decision = db.get(Decision, target_id)
            if decision:
                if decision.status == "proposed":
                    db.delete(decision)
                    counts["decisions"] += 1
                else:
                    # Confirmed decisions became organizational records via a
                    # human decision — keep them, scrub the interview linkage.
                    decision.sources = []
                    decision.details = {
                        k: v for k, v in (decision.details or {}).items()
                        if k not in ("interview_session_id",)
                    }
        elif target_type == "task" and target_id:
            task = db.get(Task, target_id)
            if task and task.status == "open":
                db.delete(task)
                counts["tasks"] += 1

    counts["artifacts"] = len(artifacts)
    counts["turns"] = db.query(InterviewTurn).filter(
        InterviewTurn.session_id == session.id
    ).count()
    counts["audio_assets"] = db.query(AudioAsset).filter(
        AudioAsset.session_id == session.id
    ).delete()

    org_id, visibility, mode, actor = (
        session.org_id, session.visibility, session.mode, session.user_id
    )
    db.delete(session)  # turns/artifacts cascade via the ORM relationship
    record(
        db,
        org_id,
        "interview.deleted",
        actor_user_id=actor,
        target_type="interview_session",
        target_id="",  # the row no longer exists; no content retained
        meta={"mode": mode, "visibility": visibility, **counts},
    )
    db.commit()
    return counts
