from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import (
    Agent,
    AgentRun,
    ApprovalRequest,
    Connector,
    Document,
    ExecutiveSummary,
    Organization,
    Task,
    User,
)
from ..security import audit
from ..security.auth import get_current_user, require_roles
from ..security.permissions import accessible_document_ids
from ..serializers import (
    agent_run_dict,
    approval_dict,
    connector_dict,
    document_summary,
    iso,
    task_dict,
)
from ..services.agents_engine import start_run
from ..services.insights import build_weekly_brief, compute_insights

router = APIRouter(tags=["insights"])


def _filter_evidence(db: Session, user: User, doc_ids: list[str]) -> list[dict]:
    """Evidence drill-down respects the viewer's permissions — an executive
    title grants nothing by itself."""
    allowed = accessible_document_ids(db, user)
    docs = db.query(Document).filter(Document.id.in_([d for d in doc_ids if d in allowed])).all()
    return [document_summary(d) for d in docs]


@router.get("/insights")
def get_insights(
    user: User = Depends(require_roles("manager", "executive", "security_admin")),
    db: Session = Depends(get_db),
):
    org = db.get(Organization, user.org_id)
    cards = compute_insights(db, org, user)
    audit.record(db, user.org_id, "insights.viewed", actor_user_id=user.id, commit=True)
    return {
        "items": [
            {**card, "evidence": _filter_evidence(db, user, card["evidence"]),
             "evidence_total": len(card["evidence"])}
            for card in cards
        ]
    }


class BriefRequest(BaseModel):
    kind: str = Field(default="weekly", pattern="^(daily|weekly|monthly|project|department|risk)$")


@router.post("/briefs", status_code=status.HTTP_201_CREATED)
def generate_brief(
    body: BriefRequest,
    user: User = Depends(require_roles("executive", "manager")),
    db: Session = Depends(get_db),
):
    org = db.get(Organization, user.org_id)
    # The Executive Briefing Agent produces the brief so the run itself is
    # auditable like any other agent activity.
    agent = db.query(Agent).filter(Agent.org_id == org.id, Agent.key == "exec_brief").first()
    run_id = None
    if agent:
        run = start_run(db, agent, user, f"Produce the {body.kind} executive brief", mode="dry_run")
        run_id = run.id
    brief = build_weekly_brief(db, org, user, agent_run_id=run_id)
    audit.record(db, org.id, "brief.generated", actor_user_id=user.id,
                 target_type="executive_summary", target_id=brief.id, commit=True)
    return _brief_dict(db, user, brief)


@router.get("/briefs")
def list_briefs(
    user: User = Depends(require_roles("executive", "manager")),
    db: Session = Depends(get_db),
):
    briefs = (
        db.query(ExecutiveSummary)
        .filter(ExecutiveSummary.org_id == user.org_id)
        .order_by(ExecutiveSummary.created_at.desc())
        .limit(20)
        .all()
    )
    return {"items": [
        {"id": b.id, "kind": b.kind, "title": b.title, "created_at": iso(b.created_at)}
        for b in briefs
    ]}


@router.get("/briefs/{brief_id}")
def get_brief(
    brief_id: str,
    user: User = Depends(require_roles("executive", "manager")),
    db: Session = Depends(get_db),
):
    brief = db.get(ExecutiveSummary, brief_id)
    if not brief or brief.org_id != user.org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Brief not found")
    return _brief_dict(db, user, brief)


def _brief_dict(db: Session, user: User, brief: ExecutiveSummary) -> dict:
    sections = []
    for section in brief.sections:
        evidence_ids = [e.get("document_id") for e in section.get("evidence", [])]
        sections.append(
            {
                "heading": section["heading"],
                "body": section["body"],
                "evidence": _filter_evidence(db, user, [e for e in evidence_ids if e]),
            }
        )
    return {
        "id": brief.id,
        "kind": brief.kind,
        "title": brief.title,
        "period_start": iso(brief.period_start),
        "period_end": iso(brief.period_end),
        "created_at": iso(brief.created_at),
        "created_by_agent_run_id": brief.created_by_agent_run_id,
        "sections": sections,
    }


# ------------------------------------------------------------------ home


@router.get("/home")
def home_dashboard(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    allowed = accessible_document_ids(db, user)
    recent_docs = (
        db.query(Document)
        .filter(Document.id.in_(allowed))
        .order_by(Document.last_synced_at.desc().nullslast())
        .limit(6)
        .all()
    )
    my_tasks = (
        db.query(Task)
        .filter(Task.org_id == user.org_id, Task.assignee_user_id == user.id,
                Task.status.in_(["open", "in_progress", "blocked"]))
        .order_by(Task.due_date.asc().nullslast())
        .limit(8)
        .all()
    )
    pending_approvals = (
        db.query(ApprovalRequest)
        .filter(ApprovalRequest.org_id == user.org_id, ApprovalRequest.status == "pending")
        .order_by(ApprovalRequest.created_at.desc())
        .limit(6)
        .all()
    )
    active_runs = (
        db.query(AgentRun)
        .filter(AgentRun.org_id == user.org_id,
                AgentRun.status.in_(["queued", "retrieving", "planning", "awaiting_approval", "executing"]))
        .order_by(AgentRun.created_at.desc())
        .limit(6)
        .all()
    )
    unhealthy = (
        db.query(Connector)
        .filter(Connector.org_id == user.org_id, Connector.health != "healthy")
        .all()
    )
    deadlines = []
    for d in db.query(Document).filter(Document.id.in_(allowed), Document.doc_type == "contract").all():
        if d.meta.get("end_date"):
            deadlines.append({"title": d.title, "date": d.meta["end_date"], "document_id": d.id})
    deadlines.sort(key=lambda x: x["date"])

    suggestions = [
        "What are the main risks affecting the Phoenix project this quarter?",
        "Which contracts expire in the next 90 days?",
        "Summarize the latest program review meeting",
        "Where is our supplier spend concentrated?",
        "What did we decide about the composite panel supplier?",
    ]
    return {
        "greeting_name": user.name.split(" ")[0],
        "recent_documents": [document_summary(d) for d in recent_docs],
        "my_tasks": [task_dict(t) for t in my_tasks],
        "pending_approvals": [approval_dict(db, a) for a in pending_approvals],
        "active_agent_runs": [agent_run_dict(db, r) for r in active_runs],
        "deadlines": deadlines[:6],
        "integration_warnings": [connector_dict(c) for c in unhealthy],
        "suggested_questions": suggestions,
    }
