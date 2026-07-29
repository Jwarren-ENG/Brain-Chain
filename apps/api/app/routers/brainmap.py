"""Brain Map data: the sketch's architecture as nodes/edges with live stats."""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import (
    AgentRun,
    Connector,
    Conversation,
    Decision,
    Document,
    FeedbackSubmission,
    Meeting,
    Organization,
    User,
)
from ..security.auth import get_current_user
from ..security.permissions import accessible_document_ids

router = APIRouter(tags=["brain-map"])


@router.get("/brain-map")
def brain_map(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    org = db.get(Organization, user.org_id)
    allowed = accessible_document_ids(db, user)
    docs = db.query(Document).filter(Document.id.in_(allowed)).all()
    company_info_docs = [
        d for d in docs
        if d.doc_type in ("contract", "ticket", "plan", "policy", "financial",
                          "risk_register", "roadmap", "procedure", "supplier", "spend")
    ]
    tribal_docs = [
        d for d in docs if d.doc_type in ("transcript", "message", "note", "decision_log")
    ]
    connectors = db.query(Connector).filter(Connector.org_id == org.id).all()
    healthy = sum(1 for c in connectors if c.health == "healthy")
    feedback_count = (
        db.query(FeedbackSubmission)
        .filter(FeedbackSubmission.org_id == org.id, FeedbackSubmission.status == "submitted")
        .count()
    )
    conversations = db.query(Conversation).filter(Conversation.org_id == org.id).count()
    meetings = db.query(Meeting).filter(Meeting.org_id == org.id).count()
    decisions = db.query(Decision).filter(Decision.org_id == org.id).count()
    active_runs = (
        db.query(AgentRun)
        .filter(AgentRun.org_id == org.id,
                AgentRun.status.in_(["retrieving", "planning", "awaiting_approval", "executing"]))
        .count()
    )
    total_runs = db.query(AgentRun).filter(AgentRun.org_id == org.id).count()

    return {
        "deployment_profile": org.deployment_profile,
        "nodes": {
            "knowledge_db": {
                "label": "BrainChain Knowledge Database",
                "sub": "Permission-aware unified knowledge layer",
                "stats": {"documents": len(docs), "your_access": f"{len(allowed)} documents"},
            },
            "profiles": [
                {"key": "government", "label": "Government",
                 "active": org.deployment_profile == "government",
                 "sub": "Isolated · external models off"},
                {"key": "commercial", "label": "Commercial",
                 "active": org.deployment_profile == "commercial",
                 "sub": "Managed enterprise cloud"},
                {"key": "private", "label": "Private",
                 "active": org.deployment_profile == "private",
                 "sub": "Customer VPC · CMK"},
            ],
            "brain": {
                "label": "Company Brain",
                "sub": org.name,
                "stats": {"sources": len(connectors), "healthy_connectors": healthy},
            },
            "company_info": {
                "label": "Company Information",
                "route": "/company",
                "stats": {"documents": len(company_info_docs)},
            },
            "tribal": {
                "label": "Tribal Knowledge",
                "route": "/tribal",
                "stats": {"meetings": meetings, "decisions": decisions,
                          "documents": len(tribal_docs)},
            },
            "feedback": {
                "label": "Employee Surveys & Feedback",
                "route": "/feedback",
                "stats": {"submissions": feedback_count},
            },
            "llm_usage": {
                "label": "Company LLM Usage",
                "route": "/ask",
                "stats": {"conversations": conversations},
            },
            "agents": {
                "label": "AI Agents",
                "route": "/agents",
                "stats": {"active_runs": active_runs, "total_runs": total_runs},
            },
            "zero_trust": {
                "label": "Zero Trust",
                "sub": "Permissions enforced before retrieval · full audit trail",
            },
            "cycle": [
                {"key": "plan", "label": "Define intelligence & data plan"},
                {"key": "track", "label": "Connect & track data initiatives"},
                {"key": "understand", "label": "Permission-aware company understanding"},
                {"key": "execute", "label": "Agents plan, organize & execute"},
                {"key": "insights", "label": "Anonymized, evidence-backed insights"},
            ],
        },
    }
