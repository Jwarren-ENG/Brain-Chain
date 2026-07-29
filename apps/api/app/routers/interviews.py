"""Brain Interview REST surface. Route handlers stay thin — every workflow
rule (state machine, access, anonymity, publishing) lives in the services."""
from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import InterviewSession, User
from ..security.auth import get_current_user, require_roles
from ..serializers import (
    interview_artifact_dict,
    interview_session_dict,
    interview_turn_dict,
)
from ..services import interviews as svc
from ..services.interview_publishing import publish_session

router = APIRouter(prefix="/interviews", tags=["interviews"])
assignments_router = APIRouter(prefix="/interview-assignments", tags=["interviews"])


# ---------------------------------------------------------------- assignments


class CreateAssignmentRequest(BaseModel):
    purpose: str = Field(
        pattern="^(process|meeting_prep|concern|decision|expert|outcome_review|open)$"
    )
    title: str = Field(min_length=3, max_length=300)
    note: str = Field(default="", max_length=2000)
    assignee_user_id: str | None = None
    department_id: str | None = None
    suggested_mode: str = Field(default="text", pattern="^(voice|text|quick_voice|quick_text)$")


@assignments_router.post("", status_code=status.HTTP_201_CREATED)
def create_assignment(
    body: CreateAssignmentRequest,
    user: User = Depends(require_roles("manager", "executive")),
    db: Session = Depends(get_db),
):
    from ..serializers import interview_assignment_dict
    from ..services import interview_assignments as svc_assign

    assignment = svc_assign.create_assignment(
        db,
        user,
        purpose=body.purpose,
        title=body.title,
        note=body.note,
        assignee_user_id=body.assignee_user_id,
        department_id=body.department_id,
        suggested_mode=body.suggested_mode,
    )
    return interview_assignment_dict(db, assignment, for_creator=True)


@assignments_router.get("")
def list_assignments(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Employees see open requests addressed to them; managers additionally
    see the requests they created (with status / aggregate counts only)."""
    from ..serializers import interview_assignment_dict
    from ..services import interview_assignments as svc_assign

    mine = [
        interview_assignment_dict(db, a)
        for a in svc_assign.assignments_for_employee(db, user)
    ]
    created = []
    if {"manager", "executive"} & user.role_names():
        created = [
            interview_assignment_dict(
                db, a, for_creator=True,
                response_count=svc_assign.department_response_count(db, a)
                if a.department_id else None,
            )
            for a in svc_assign.assignments_created_by(db, user)
        ]
    return {"assigned_to_me": mine, "created_by_me": created}


@assignments_router.get("/targets")
def assignment_targets(
    user: User = Depends(require_roles("manager", "executive")),
    db: Session = Depends(get_db),
):
    """People and departments a manager can address a request to."""
    from ..models import Department

    people = (
        db.query(User)
        .filter(User.org_id == user.org_id, User.is_active.is_(True), User.id != user.id)
        .order_by(User.name)
        .all()
    )
    departments = (
        db.query(Department).filter(Department.org_id == user.org_id).order_by(Department.name).all()
    )
    return {
        "people": [
            {"id": p.id, "name": p.name, "department": p.department.name if p.department else None}
            for p in people
        ],
        "departments": [{"id": d.id, "name": d.name} for d in departments],
    }


class DeclineRequest(BaseModel):
    reason: str = Field(default="", max_length=1000)


@assignments_router.post("/{assignment_id}/decline")
def decline_assignment(
    assignment_id: str,
    body: DeclineRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    from ..serializers import interview_assignment_dict
    from ..services import interview_assignments as svc_assign

    assignment = svc_assign.decline_assignment(db, user, assignment_id, body.reason)
    return interview_assignment_dict(db, assignment)


@assignments_router.post("/{assignment_id}/cancel")
def cancel_assignment(
    assignment_id: str,
    user: User = Depends(require_roles("manager", "executive")),
    db: Session = Depends(get_db),
):
    from ..serializers import interview_assignment_dict
    from ..services import interview_assignments as svc_assign

    assignment = svc_assign.cancel_assignment(db, user, assignment_id)
    return interview_assignment_dict(db, assignment, for_creator=True)


class CreateInterviewRequest(BaseModel):
    mode: str = Field(pattern="^(voice|text|quick_voice|quick_text)$")
    purpose: str = Field(
        pattern="^(process|meeting_prep|concern|decision|expert|outcome_review|open)$"
    )
    visibility: str = Field(default="named", pattern="^(named|confidential|anonymous)$")
    title: str = Field(default="", max_length=300)
    meeting_id: str | None = None
    entity_id: str | None = None
    decision_id: str | None = None
    agent_run_id: str | None = None
    assignment_id: str | None = None


@router.post("", status_code=status.HTTP_201_CREATED)
def create_interview(
    body: CreateInterviewRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    session = svc.create_session(
        db,
        user,
        mode=body.mode,
        purpose=body.purpose,
        visibility=body.visibility,
        title=body.title,
        meeting_id=body.meeting_id,
        entity_id=body.entity_id,
        decision_id=body.decision_id,
        agent_run_id=body.agent_run_id,
        assignment_id=body.assignment_id,
    )
    # The receipt token is issued exactly once, to the creator. For anonymous
    # sessions it is the only handle that will ever exist.
    return interview_session_dict(session, include_receipt=True)


@router.get("")
def list_interviews(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Account-linked history: named and confidential sessions only. Anonymous
    sessions have no account linkage and are structurally absent."""
    sessions = (
        db.query(InterviewSession)
        .filter(InterviewSession.user_id == user.id)
        .order_by(InterviewSession.updated_at.desc())
        .limit(100)
        .all()
    )
    return {"items": [interview_session_dict(s) for s in sessions]}


def _session(
    session_id: str,
    receipt: str | None = Query(default=None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> InterviewSession:
    return svc.resolve_session(db, user, session_id, receipt)


@router.get("/{session_id}")
def get_interview(
    session: InterviewSession = Depends(_session), db: Session = Depends(get_db)
):
    data = interview_session_dict(session, include_turns=True, include_artifacts=True)
    if session.assignment_id:
        from ..models import InterviewAssignment
        from ..serializers import interview_assignment_dict

        assignment = db.get(InterviewAssignment, session.assignment_id)
        if assignment:
            data["assignment"] = interview_assignment_dict(db, assignment)
    return data


@router.delete("/{session_id}")
def delete_interview(
    session: InterviewSession = Depends(_session), db: Session = Depends(get_db)
):
    counts = svc.delete_session(db, session)
    return {"ok": True, "removed": counts}


@router.post("/{session_id}/start")
def start_interview(
    session: InterviewSession = Depends(_session), db: Session = Depends(get_db)
):
    svc.start(db, session)
    return interview_session_dict(session, include_turns=True)


class ConsentRequest(BaseModel):
    audio_retention_policy: str = Field(
        default="delete_after_transcription",
        pattern="^(delete_after_transcription|retain_with_consent)$",
    )


@router.post("/{session_id}/consent")
def give_consent(
    body: ConsentRequest,
    session: InterviewSession = Depends(_session),
    db: Session = Depends(get_db),
):
    svc.give_consent(db, session, body.audio_retention_policy)
    return interview_session_dict(session, include_turns=True)


class TurnRequest(BaseModel):
    text: str = Field(min_length=1, max_length=8000)


@router.post("/{session_id}/turns")
def add_turn(
    body: TurnRequest,
    session: InterviewSession = Depends(_session),
    db: Session = Depends(get_db),
):
    envelope = svc.add_employee_turn(db, session, body.text)
    data = interview_session_dict(session, include_turns=True)
    data["interviewer"] = envelope.as_dict()
    return data


class TurnEditRequest(BaseModel):
    text: str = Field(min_length=1, max_length=8000)


@router.patch("/{session_id}/turns/{turn_id}")
def edit_turn(
    turn_id: str,
    body: TurnEditRequest,
    session: InterviewSession = Depends(_session),
    db: Session = Depends(get_db),
):
    turn = svc.edit_turn(db, session, turn_id, body.text)
    return interview_turn_dict(turn)


class VoiceChunkRequest(BaseModel):
    # The mock provider accepts an explicit failure trigger so recovery UX is
    # demonstrable and testable. A real adapter receives audio references here.
    simulate_failure: bool = False


@router.post("/{session_id}/voice-chunk")
def voice_chunk(
    body: VoiceChunkRequest,
    session: InterviewSession = Depends(_session),
    db: Session = Depends(get_db),
):
    envelope = svc.transcribe_chunk(db, session, simulate_failure=body.simulate_failure)
    data = interview_session_dict(session, include_turns=True)
    if envelope:
        data["interviewer"] = envelope.as_dict()
    return data


@router.post("/{session_id}/pause")
def pause_interview(
    session: InterviewSession = Depends(_session), db: Session = Depends(get_db)
):
    svc.pause(db, session)
    return interview_session_dict(session)


@router.post("/{session_id}/resume")
def resume_interview(
    session: InterviewSession = Depends(_session), db: Session = Depends(get_db)
):
    svc.resume(db, session)
    return interview_session_dict(session)


@router.post("/{session_id}/switch-to-text")
def switch_to_text(
    session: InterviewSession = Depends(_session), db: Session = Depends(get_db)
):
    svc.switch_to_text(db, session)
    return interview_session_dict(session, include_turns=True)


@router.post("/{session_id}/complete")
def complete_interview(
    session: InterviewSession = Depends(_session), db: Session = Depends(get_db)
):
    svc.complete(db, session)
    return interview_session_dict(session, include_turns=True, include_artifacts=True)


@router.post("/{session_id}/retry")
def retry_interview(
    session: InterviewSession = Depends(_session), db: Session = Depends(get_db)
):
    svc.retry(db, session)
    return interview_session_dict(session, include_turns=True, include_artifacts=True)


@router.post("/{session_id}/discard")
def discard_interview(
    session: InterviewSession = Depends(_session), db: Session = Depends(get_db)
):
    svc.discard(db, session)
    return interview_session_dict(session)


@router.get("/{session_id}/artifacts")
def list_artifacts(session: InterviewSession = Depends(_session)):
    return {"items": [interview_artifact_dict(a) for a in session.artifacts]}


class ArtifactUpdateRequest(BaseModel):
    selected: bool | None = None
    summary: str | None = Field(default=None, max_length=600)
    uncertain: bool | None = None
    details: dict | None = None


@router.patch("/{session_id}/artifacts/{artifact_id}")
def update_artifact(
    artifact_id: str,
    body: ArtifactUpdateRequest,
    session: InterviewSession = Depends(_session),
    db: Session = Depends(get_db),
):
    artifact = svc.update_artifact(
        db,
        session,
        artifact_id,
        selected=body.selected,
        summary=body.summary,
        uncertain=body.uncertain,
        details=body.details,
    )
    return interview_artifact_dict(artifact)


@router.post("/{session_id}/publish")
def publish_interview(
    session: InterviewSession = Depends(_session),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    destinations = publish_session(db, user, session)
    data = interview_session_dict(session, include_artifacts=True)
    data["destinations"] = destinations
    return data
