"""Interview assignments: a manager asks for an interview; the employee stays
in control.

Rules enforced here (not in the UI):
  * only managers/executives create assignments; targets are one employee OR
    one department, inside the same org;
  * the employee can decline (with an optional reason) — an assignment is a
    request, not an order;
  * individual assignments can never be answered anonymously: a cohort of one
    is not anonymous, and pretending otherwise would be a false promise;
  * department assignments accept any visibility; the creator sees only an
    aggregate response count — never who responded, never per-person status;
  * the creator never gains access to the interview session itself (the
    owner-or-receipt rule is unchanged);
  * for confidential completions the creator sees "completed" only — published
    outputs stay unattributed and are never listed on the assignment.
"""
from __future__ import annotations

from fastapi import HTTPException
from fastapi import status as http_status
from sqlalchemy.orm import Session

from ..models import (
    Department,
    InterviewAssignment,
    InterviewSession,
    User,
    utcnow,
)
from ..security.audit import record

ASSIGNABLE_PURPOSES = {
    "process", "meeting_prep", "concern", "decision", "expert", "outcome_review", "open",
}


def create_assignment(
    db: Session,
    creator: User,
    *,
    purpose: str,
    title: str,
    note: str = "",
    assignee_user_id: str | None = None,
    department_id: str | None = None,
    suggested_mode: str = "text",
    due_at=None,
) -> InterviewAssignment:
    if bool(assignee_user_id) == bool(department_id):
        raise HTTPException(
            http_status.HTTP_422_UNPROCESSABLE_CONTENT,
            "Assign to exactly one person or one department.",
        )
    if purpose not in ASSIGNABLE_PURPOSES:
        raise HTTPException(http_status.HTTP_422_UNPROCESSABLE_CONTENT, "Unknown purpose.")
    if assignee_user_id:
        assignee = db.get(User, assignee_user_id)
        if not assignee or assignee.org_id != creator.org_id or not assignee.is_active:
            raise HTTPException(http_status.HTTP_404_NOT_FOUND, "Assignee not found")
    if department_id:
        department = db.get(Department, department_id)
        if not department or department.org_id != creator.org_id:
            raise HTTPException(http_status.HTTP_404_NOT_FOUND, "Department not found")

    assignment = InterviewAssignment(
        org_id=creator.org_id,
        created_by_user_id=creator.id,
        assignee_user_id=assignee_user_id,
        department_id=department_id,
        purpose=purpose,
        suggested_mode=suggested_mode,
        title=title[:300],
        note=note[:2000],
        due_at=due_at,
    )
    db.add(assignment)
    db.flush()
    record(
        db, creator.org_id, "interview.assignment_created", actor_user_id=creator.id,
        target_type="interview_assignment", target_id=assignment.id,
        meta={"purpose": purpose, "scope": "individual" if assignee_user_id else "department"},
    )
    db.commit()
    return assignment


def assignments_for_employee(db: Session, user: User) -> list[InterviewAssignment]:
    """Open requests addressed to this person or their department."""
    query = db.query(InterviewAssignment).filter(
        InterviewAssignment.org_id == user.org_id,
        InterviewAssignment.status == "open",
    )
    rows = query.all()
    return [
        a for a in rows
        if a.assignee_user_id == user.id
        or (a.department_id and a.department_id == user.department_id)
    ]


def assignments_created_by(db: Session, user: User) -> list[InterviewAssignment]:
    return (
        db.query(InterviewAssignment)
        .filter(
            InterviewAssignment.org_id == user.org_id,
            InterviewAssignment.created_by_user_id == user.id,
        )
        .order_by(InterviewAssignment.created_at.desc())
        .all()
    )


def department_response_count(db: Session, assignment: InterviewAssignment) -> int:
    """Aggregate-only signal for department assignments: how many published
    sessions link to it. Never who."""
    return (
        db.query(InterviewSession)
        .filter(
            InterviewSession.assignment_id == assignment.id,
            InterviewSession.status == "published",
        )
        .count()
    )


def resolve_for_response(
    db: Session, user: User, assignment_id: str, visibility: str
) -> InterviewAssignment:
    """Validate that this user may answer this assignment with this visibility.
    Called from session creation."""
    assignment = db.get(InterviewAssignment, assignment_id)
    if not assignment or assignment.org_id != user.org_id or assignment.status != "open":
        raise HTTPException(http_status.HTTP_404_NOT_FOUND, "Assignment not found")
    addressed = assignment.assignee_user_id == user.id or (
        assignment.department_id and assignment.department_id == user.department_id
    )
    if not addressed:
        raise HTTPException(http_status.HTTP_404_NOT_FOUND, "Assignment not found")
    if assignment.assignee_user_id and visibility == "anonymous":
        raise HTTPException(
            http_status.HTTP_422_UNPROCESSABLE_CONTENT,
            "This request was addressed to you personally, so an anonymous response "
            "would not actually be anonymous. Respond named or confidential — or "
            "decline the request.",
        )
    return assignment


def mark_response_published(db: Session, session: InterviewSession) -> None:
    """Called inside the publish transaction. Individual assignments complete;
    department assignments stay open and are counted in aggregate."""
    if not session.assignment_id:
        return
    assignment = db.get(InterviewAssignment, session.assignment_id)
    if not assignment or assignment.status != "open":
        return
    if assignment.assignee_user_id:
        assignment.status = "completed"
        record(
            db, assignment.org_id, "interview.assignment_completed",
            actor_user_id=session.user_id,
            target_type="interview_assignment", target_id=assignment.id,
            meta={"visibility": session.visibility},
        )


def decline_assignment(
    db: Session, user: User, assignment_id: str, reason: str = ""
) -> InterviewAssignment:
    assignment = db.get(InterviewAssignment, assignment_id)
    addressed = assignment and assignment.org_id == user.org_id and (
        assignment.assignee_user_id == user.id
        or (assignment.department_id and assignment.department_id == user.department_id)
    )
    if not addressed:
        raise HTTPException(http_status.HTTP_404_NOT_FOUND, "Assignment not found")
    if assignment.department_id:
        # A department request isn't declinable on behalf of everyone; the
        # employee simply doesn't respond.
        raise HTTPException(
            http_status.HTTP_409_CONFLICT,
            "Team requests can't be declined for the whole team — you can simply "
            "choose not to respond.",
        )
    if assignment.status != "open":
        raise HTTPException(http_status.HTTP_409_CONFLICT, f"Already {assignment.status}")
    assignment.status = "declined"
    assignment.decline_reason = reason[:1000]
    record(
        db, assignment.org_id, "interview.assignment_declined", actor_user_id=user.id,
        target_type="interview_assignment", target_id=assignment.id, meta={},
    )
    db.commit()
    return assignment


def cancel_assignment(db: Session, user: User, assignment_id: str) -> InterviewAssignment:
    assignment = db.get(InterviewAssignment, assignment_id)
    if (
        not assignment
        or assignment.org_id != user.org_id
        or assignment.created_by_user_id != user.id
    ):
        raise HTTPException(http_status.HTTP_404_NOT_FOUND, "Assignment not found")
    if assignment.status not in ("open",):
        raise HTTPException(http_status.HTTP_409_CONFLICT, f"Already {assignment.status}")
    assignment.status = "cancelled"
    assignment.updated_at = utcnow()
    record(
        db, assignment.org_id, "interview.assignment_cancelled", actor_user_id=user.id,
        target_type="interview_assignment", target_id=assignment.id, meta={},
    )
    db.commit()
    return assignment
