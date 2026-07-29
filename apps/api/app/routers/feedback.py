from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import FeedbackSubmission, Organization, Survey, User
from ..security.auth import get_current_user, require_roles
from ..serializers import iso, my_feedback_dict
from ..services.feedback import aggregate_for_managers, min_cohort, submit_feedback

router = APIRouter(tags=["feedback"])


class FeedbackRequest(BaseModel):
    body: str = Field(min_length=3, max_length=8000)
    visibility: str = Field(default="named", pattern="^(named|confidential|anonymous)$")
    category: str = Field(default="thought", max_length=40)
    survey_id: str | None = None
    answers: dict = Field(default_factory=dict)
    department_tag: str | None = None
    project_tag: str | None = None
    allow_followup: bool = False
    draft: bool = False


@router.post("/feedback", status_code=status.HTTP_201_CREATED)
def create_feedback(
    body: FeedbackRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    submission = submit_feedback(
        db, user,
        body=body.body,
        visibility=body.visibility,
        category=body.category,
        survey_id=body.survey_id,
        answers=body.answers,
        department_tag=body.department_tag,
        project_tag=body.project_tag,
        allow_followup=body.allow_followup,
        status="draft" if body.draft else "submitted",
    )
    response: dict = {
        "status": submission.status,
        "visibility": submission.visibility,
        "receipt_token": submission.receipt_token,
    }
    if submission.visibility == "anonymous":
        response["privacy_note"] = (
            "Submitted anonymously: your identity was not stored with this feedback. "
            "Keep the receipt token if you want to check its status later — it is the "
            "only link, and it exists only in your hands. Timestamps are coarsened and "
            "results are only shown to managers once at least "
            f"{min_cohort(db.get(Organization, user.org_id))} submissions exist."
        )
    else:
        response["id"] = submission.id
    return response


@router.get("/feedback/mine")
def my_feedback(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Named + confidential items the author submitted. Anonymous items are
    intentionally NOT listable by account — use the receipt token."""
    items = (
        db.query(FeedbackSubmission)
        .filter(FeedbackSubmission.user_id == user.id)
        .order_by(FeedbackSubmission.created_at.desc())
        .all()
    )
    return {"items": [my_feedback_dict(f) for f in items]}


@router.get("/feedback/receipt/{token}")
def feedback_receipt(token: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    submission = (
        db.query(FeedbackSubmission).filter(FeedbackSubmission.receipt_token == token).first()
    )
    if not submission or submission.org_id != user.org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No submission for this receipt")
    return {
        "status": submission.status,
        "category": submission.category,
        "visibility": submission.visibility,
        "submitted_on": iso(submission.created_at),
    }


@router.get("/surveys")
def list_surveys(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    surveys = (
        db.query(Survey)
        .filter(Survey.org_id == user.org_id, Survey.status == "open")
        .order_by(Survey.created_at.desc())
        .all()
    )
    return {
        "items": [
            {
                "id": s.id,
                "title": s.title,
                "kind": s.kind,
                "description": s.description,
                "closes_at": iso(s.closes_at),
                "questions": [
                    {"id": q.id, "ord": q.ord, "text": q.text, "qtype": q.qtype, "options": q.options}
                    for q in s.questions
                ],
            }
            for s in surveys
        ]
    }


@router.get("/feedback/aggregate")
def feedback_aggregate(
    category: str | None = None,
    department_tag: str | None = None,
    project_tag: str | None = None,
    survey_id: str | None = None,
    user: User = Depends(require_roles("manager", "executive", "security_admin")),
    db: Session = Depends(get_db),
):
    """Manager-facing view. Returns ONLY cohort-protected aggregates — there is
    no endpoint anywhere that returns individual anonymous submissions."""
    org = db.get(Organization, user.org_id)
    return aggregate_for_managers(
        db, user, org,
        filters={
            "category": category,
            "department_tag": department_tag,
            "project_tag": project_tag,
            "survey_id": survey_id,
        },
    )
