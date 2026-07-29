"""Documents, search, entities/graph, meetings, decisions — all permission-filtered."""
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import (
    Decision,
    Department,
    Document,
    Entity,
    EntityRelationship,
    Meeting,
    User,
)
from ..security import audit
from ..security.auth import get_current_user, require_roles
from ..security.permissions import access_explanation, accessible_document_ids, can_read_document
from ..serializers import decision_dict, document_detail, document_summary, meeting_dict
from ..services.retrieval import retrieve

router = APIRouter(tags=["knowledge"])


@router.get("/documents")
def list_documents(
    q: str | None = None,
    doc_type: str | None = None,
    department_id: str | None = None,
    data_source_id: str | None = None,
    classification_level: int | None = None,
    project: str | None = None,
    limit: int = Query(default=25, le=100),
    offset: int = 0,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    allowed = accessible_document_ids(db, user)
    query = db.query(Document).filter(Document.id.in_(allowed))
    if doc_type:
        query = query.filter(Document.doc_type == doc_type)
    if department_id:
        query = query.filter(Document.department_id == department_id)
    if data_source_id:
        query = query.filter(Document.data_source_id == data_source_id)
    if q:
        query = query.filter(Document.title.ilike(f"%{q}%") | Document.summary.ilike(f"%{q}%"))
    docs = query.order_by(Document.source_updated_at.desc().nullslast()).all()
    if classification_level is not None:
        docs = [d for d in docs if d.classification.level == classification_level]
    if project:
        docs = [d for d in docs if project.lower() in (d.meta.get("project", "") or "").lower()]
    total = len(docs)
    page = docs[offset : offset + limit]
    return {"total": total, "items": [document_summary(d) for d in page],
            "limit": limit, "offset": offset}


@router.get("/documents/{doc_id}")
def get_document(doc_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    doc = db.get(Document, doc_id)
    if not doc or not can_read_document(db, user, doc):
        # Same response whether missing or unauthorized: no existence oracle.
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Document not found")
    audit.record(db, user.org_id, "document.viewed", actor_user_id=user.id,
                 target_type="document", target_id=doc.id, commit=True)
    return document_detail(db, doc, access_explanation(db, user, doc))


@router.get("/search")
def search(
    q: str,
    mode: str = Query(default="hybrid", pattern="^(hybrid|keyword|semantic)$"),
    doc_type: str | None = None,
    department_id: str | None = None,
    data_source_id: str | None = None,
    project: str | None = None,
    limit: int = Query(default=12, le=50),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    results = retrieve(
        db, user, q, limit=limit,
        doc_types=[doc_type] if doc_type else None,
        department_ids=[department_id] if department_id else None,
        data_source_ids=[data_source_id] if data_source_id else None,
        project=project,
        min_score=0.02 if mode == "semantic" else 0.06,
    )
    audit.record(db, user.org_id, "knowledge.search", actor_user_id=user.id,
                 meta={"results": len(results)}, commit=True)
    return {
        "query": q,
        "results": [
            {
                "document": document_summary(r.document),
                "excerpt": r.chunk.text[:400],
                "score": round(r.score, 3),
                "keyword_hits": r.keyword_hits,
                "access_reasons": access_explanation(db, user, r.document),
            }
            for r in results
        ],
    }


@router.get("/entities")
def list_entities(
    kind: str | None = None,
    q: str | None = None,
    limit: int = Query(default=50, le=200),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(Entity).filter(Entity.org_id == user.org_id)
    if kind:
        query = query.filter(Entity.kind == kind)
    if q:
        query = query.filter(Entity.name.ilike(f"%{q}%"))
    entities = query.limit(limit).all()
    return {"items": [{"id": e.id, "kind": e.kind, "name": e.name, "meta": e.meta} for e in entities]}


@router.get("/entities/{entity_id}/graph")
def entity_graph(entity_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    root = db.get(Entity, entity_id)
    if not root or root.org_id != user.org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Entity not found")
    rels = (
        db.query(EntityRelationship)
        .filter(
            (EntityRelationship.from_entity_id == entity_id)
            | (EntityRelationship.to_entity_id == entity_id)
        )
        .all()
    )
    node_ids = {entity_id}
    for r in rels:
        node_ids.update((r.from_entity_id, r.to_entity_id))
    nodes = db.query(Entity).filter(Entity.id.in_(node_ids)).all()
    return {
        "root": entity_id,
        "nodes": [{"id": e.id, "kind": e.kind, "name": e.name} for e in nodes],
        "edges": [
            {"id": r.id, "from": r.from_entity_id, "to": r.to_entity_id, "rel": r.rel_type}
            for r in rels
        ],
    }


@router.get("/meetings")
def list_meetings(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    allowed = accessible_document_ids(db, user)
    meetings = (
        db.query(Meeting)
        .filter(Meeting.org_id == user.org_id)
        .order_by(Meeting.held_at.desc())
        .all()
    )
    visible = [
        m for m in meetings
        if m.transcript_document_id is None or m.transcript_document_id in allowed
    ]
    return {"items": [meeting_dict(m) for m in visible]}


@router.get("/meetings/{meeting_id}/topics")
def meeting_topics(
    meeting_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    """Published meeting-preparation topics contributed through Brain
    Interviews. Attribution exists only for named sessions; anonymous and
    confidential contributions are structurally unattributed."""
    from ..models import InterviewArtifact, InterviewSession

    meeting = db.get(Meeting, meeting_id)
    if not meeting or meeting.org_id != user.org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Meeting not found")
    rows = (
        db.query(InterviewArtifact, InterviewSession)
        .join(InterviewSession, InterviewArtifact.session_id == InterviewSession.id)
        .filter(
            InterviewSession.meeting_id == meeting_id,
            InterviewSession.status == "published",
            InterviewArtifact.published_target_type == "meeting",
        )
        .all()
    )
    items = []
    for artifact, session in rows:
        author = None
        if session.visibility == "named" and session.user_id:
            author_row = db.get(User, session.user_id)
            author = author_row.name if author_row else None
        items.append(
            {
                "id": artifact.id,
                "kind": artifact.kind,
                "summary": artifact.summary,
                "author": author,  # None for anonymous AND confidential
                "provenance": artifact.provenance,
            }
        )
    return {"items": items}


@router.post("/decisions/{decision_id}/confirm")
def confirm_decision(
    decision_id: str,
    user: User = Depends(require_roles("manager", "executive")),
    db: Session = Depends(get_db),
):
    """Interview-documented decisions stay proposals until a person with the
    appropriate authority confirms the record."""
    decision = db.get(Decision, decision_id)
    if not decision or decision.org_id != user.org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Decision not found")
    if decision.status != "proposed":
        raise HTTPException(status.HTTP_409_CONFLICT, f"Decision is already {decision.status}")
    decision.status = "active"
    if user.name not in decision.owners:
        decision.owners = [*decision.owners, user.name]
    audit.record(
        db, user.org_id, "decision.confirmed", actor_user_id=user.id,
        target_type="decision", target_id=decision.id, commit=True,
    )
    return decision_dict(decision)


@router.get("/decisions")
def list_decisions(
    project: str | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    allowed = accessible_document_ids(db, user)
    query = db.query(Decision).filter(Decision.org_id == user.org_id)
    if project:
        query = query.filter(Decision.project.ilike(f"%{project}%"))
    decisions = query.order_by(Decision.decided_at.desc().nullslast()).all()
    visible = [d for d in decisions if d.document_id is None or d.document_id in allowed]
    return {"items": [decision_dict(d) for d in visible]}


@router.get("/filters")
def filter_options(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Options for search/explorer filter dropdowns, scoped to what exists."""
    allowed = accessible_document_ids(db, user)
    docs = db.query(Document).filter(Document.id.in_(allowed)).all()
    departments = db.query(Department).filter(Department.org_id == user.org_id).all()
    sources = sorted(
        {(d.data_source.id, d.data_source.name, d.data_source.kind) for d in docs if d.data_source}
    )
    return {
        "doc_types": sorted({d.doc_type for d in docs}),
        "projects": sorted({d.meta.get("project") for d in docs if d.meta.get("project")}),
        "departments": [{"id": d.id, "name": d.name} for d in departments],
        "sources": [{"id": s[0], "name": s[1], "kind": s[2]} for s in sources],
        "classifications": [
            {"level": lvl, "name": name}
            for lvl, name in sorted({(d.classification.level, d.classification.name) for d in docs})
        ],
    }
