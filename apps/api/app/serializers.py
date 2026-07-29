"""JSON serializers. Anything that leaves the API goes through these, so
identity-scrubbing and permission-derived fields live in one place."""
from __future__ import annotations

from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from .models import (
    AgentRun,
    ApprovalRequest,
    Citation,
    Connector,
    Decision,
    Document,
    FeedbackSubmission,
    LLMMessage,
    Meeting,
    SyncJob,
    Task,
    User,
    utcnow,
)


def iso(dt: datetime | None) -> str | None:
    return dt.isoformat() + "Z" if dt else None


def freshness(doc: Document) -> str:
    ref = doc.source_updated_at or doc.last_synced_at
    if not ref:
        return "unknown"
    age = utcnow() - ref
    if age < timedelta(days=7):
        return "fresh"
    if age < timedelta(days=30):
        return "recent"
    return "stale"


def user_brief(user: User | None) -> dict | None:
    if not user:
        return None
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "title": user.title,
        "department": user.department.name if user.department else None,
    }


def user_full(user: User) -> dict:
    return {
        **user_brief(user),
        "roles": sorted(user.role_names()),
        "clearance_level": user.clearance_level,
        "department_id": user.department_id,
        "is_active": user.is_active,
    }


def classification_dict(c) -> dict:
    return {"id": c.id, "name": c.name, "level": c.level, "color": c.color}


def document_summary(doc: Document) -> dict:
    return {
        "id": doc.id,
        "title": doc.title,
        "doc_type": doc.doc_type,
        "summary": doc.summary,
        "classification": classification_dict(doc.classification),
        "department": doc.department.name if doc.department else None,
        "owner": user_brief(doc.owner),
        "source": {
            "id": doc.data_source.id,
            "name": doc.data_source.name,
            "kind": doc.data_source.kind,
        }
        if doc.data_source
        else None,
        "project": doc.meta.get("project"),
        "freshness": freshness(doc),
        "confidence": doc.confidence,
        "version": doc.current_version,
        "source_created_at": iso(doc.source_created_at),
        "source_updated_at": iso(doc.source_updated_at),
        "last_synced_at": iso(doc.last_synced_at),
        "meta": doc.meta,
    }


def document_detail(db: Session, doc: Document, why: list[dict]) -> dict:
    return {
        **document_summary(doc),
        "versions": [
            {"version": v.version, "note": v.note, "created_at": iso(v.created_at),
             "content": v.content}
            for v in doc.versions
        ],
        "chunks": [{"id": c.id, "ord": c.ord, "text": c.text} for c in doc.chunks],
        "lineage": {
            "source_item_id": doc.source_item_id,
            "data_source": doc.data_source.name if doc.data_source else "Manual upload",
            "retention": doc.retention_policy.name if doc.retention_policy else "Default",
            "ingest_path": "connector → parser → classifier → chunker → embedder → index"
            if doc.data_source
            else "manual upload → parser → chunker → embedder → index",
        },
        "access_reasons": why,
    }


def citation_dict(c: Citation) -> dict:
    doc = c.document
    meta = doc.meta or {}
    return {
        # Employee-contribution labeling: answers must say when a source is
        # employee-contributed and whether it is attributed.
        "origin": meta.get("origin"),
        "contributed": meta.get("contributed"),
        "ord": c.ord,
        "document_id": c.document_id,
        "chunk_id": c.chunk_id,
        "excerpt": c.excerpt,
        "relevance": c.relevance,
        "title": doc.title,
        "doc_type": doc.doc_type,
        "source_system": doc.data_source.kind if doc.data_source else "upload",
        "source_name": doc.data_source.name if doc.data_source else "Manual upload",
        "classification": classification_dict(doc.classification),
        "department": doc.department.name if doc.department else None,
        "owner": user_brief(doc.owner),
        "date": iso(doc.source_created_at or doc.created_at),
        "last_synced_at": iso(doc.last_synced_at),
    }


def message_dict(m: LLMMessage) -> dict:
    return {
        "id": m.id,
        "role": m.role,
        "content": m.content,
        "mode": m.mode,
        "provider": m.provider,
        "model": m.model,
        "segments": m.segments,
        "citations": [citation_dict(c) for c in m.citations],
        "tokens_in": m.tokens_in,
        "tokens_out": m.tokens_out,
        "cost_estimate": m.cost_estimate,
        "latency_ms": m.latency_ms,
        "created_at": iso(m.created_at),
    }


def connector_dict(c: Connector) -> dict:
    ds = c.data_source
    return {
        "id": c.id,
        "provider": c.provider,
        "display_name": c.display_name,
        "status": c.status,
        "health": c.health,
        "sync_frequency": c.sync_frequency,
        "last_sync_at": iso(c.last_sync_at),
        "items_synced": c.items_synced,
        "items_skipped": c.items_skipped,
        "permission_errors": c.permission_errors,
        "is_mock": c.is_mock,
        "pending_items": len(c.config.get("pending_items", [])),
        "data_source": {
            "id": ds.id,
            "name": ds.name,
            "kind": ds.kind,
            "owner": user_brief(ds.owner),
            "department": ds.department.name if ds.department else None,
            "classification": classification_dict(ds.classification) if ds.classification else None,
            "retention": ds.retention_policy.name if ds.retention_policy else None,
        },
    }


def sync_job_dict(j: SyncJob) -> dict:
    return {
        "id": j.id,
        "status": j.status,
        "trigger": j.trigger,
        "started_at": iso(j.started_at),
        "finished_at": iso(j.finished_at),
        "items_processed": j.items_processed,
        "items_skipped": j.items_skipped,
        "log": j.log,
    }


def task_dict(t: Task) -> dict:
    return {
        "id": t.id,
        "title": t.title,
        "description": t.description,
        "status": t.status,
        "priority": t.priority,
        "assignee": user_brief(t.assignee),
        "due_date": iso(t.due_date),
        "project": t.project,
        "source": t.source,
        "external_ref": t.external_ref,
        "agent_run_id": t.agent_run_id,
        "created_at": iso(t.created_at),
    }


def approval_dict(db: Session, a: ApprovalRequest) -> dict:
    requester = db.get(User, a.requested_by_user_id) if a.requested_by_user_id else None
    approver = db.get(User, a.approver_user_id) if a.approver_user_id else None
    run = db.get(AgentRun, a.agent_run_id) if a.agent_run_id else None
    return {
        "id": a.id,
        "action_type": a.action_type,
        "title": a.title,
        "payload": a.payload,
        "status": a.status,
        "requested_by": user_brief(requester),
        "approver": user_brief(approver),
        "decided_at": iso(a.decided_at),
        "decision_reason": a.decision_reason,
        "agent_run": {
            "id": run.id,
            "goal": run.goal,
            "agent_name": run.agent.name,
            "mode": run.mode,
        }
        if run
        else None,
        "created_at": iso(a.created_at),
    }


def agent_run_dict(db: Session, run: AgentRun, *, include_steps: bool = False) -> dict:
    user = db.get(User, run.user_id)
    data = {
        "id": run.id,
        "agent": {"id": run.agent.id, "key": run.agent.key, "name": run.agent.name,
                  "category": run.agent.category},
        "user": user_brief(user),
        "goal": run.goal,
        "status": run.status,
        "mode": run.mode,
        "current_step": run.current_step,
        "assumptions": run.assumptions,
        "proposed_actions": run.proposed_actions,
        "result_summary": run.result_summary,
        "error": run.error,
        "retries": run.retries,
        "tokens_used": run.tokens_used,
        "cost_estimate": run.cost_estimate,
        "started_at": iso(run.started_at),
        "finished_at": iso(run.finished_at),
        "source_document_count": len(run.source_document_ids),
    }
    if include_steps:
        data["plan"] = run.plan
        data["steps"] = [
            {"ord": s.ord, "kind": s.kind, "title": s.title, "status": s.status,
             "detail": s.detail, "started_at": iso(s.started_at), "finished_at": iso(s.finished_at)}
            for s in run.steps
        ]
        approvals = (
            db.query(ApprovalRequest).filter(ApprovalRequest.agent_run_id == run.id).all()
        )
        data["approvals"] = [approval_dict(db, a) for a in approvals]
    return data


def meeting_dict(m: Meeting) -> dict:
    return {
        "id": m.id,
        "title": m.title,
        "held_at": iso(m.held_at),
        "source": m.source,
        "attendees": m.attendees,
        "extraction": m.extraction,
        "transcript_document_id": m.transcript_document_id,
    }


def decision_dict(d: Decision) -> dict:
    return {
        "id": d.id,
        "title": d.title,
        "decided_at": iso(d.decided_at),
        "rationale": d.rationale,
        "status": d.status,
        "supersedes_id": d.supersedes_id,
        "meeting_id": d.meeting_id,
        "document_id": d.document_id,
        "project": d.project,
        "owners": d.owners,
        "sources": d.sources,
        "details": {k: v for k, v in (d.details or {}).items() if k != "interview_session_id"},
    }


# ---------------------------------------------------------------- interviews


def interview_assignment_dict(
    db: Session, a, *, for_creator: bool = False, response_count: int | None = None
) -> dict:
    """Creator view includes status + (department) aggregate counts only.
    Employee view includes who is asking and why."""
    creator = db.get(User, a.created_by_user_id)
    assignee = db.get(User, a.assignee_user_id) if a.assignee_user_id else None
    from .models import Department

    department = db.get(Department, a.department_id) if a.department_id else None
    data = {
        "id": a.id,
        "purpose": a.purpose,
        "suggested_mode": a.suggested_mode,
        "title": a.title,
        "note": a.note,
        "due_at": iso(a.due_at),
        "status": a.status,
        "scope": "individual" if a.assignee_user_id else "department",
        "department": department.name if department else None,
        "created_by": user_brief(creator),
        "created_at": iso(a.created_at),
    }
    if for_creator:
        data["assignee"] = user_brief(assignee)
        data["decline_reason"] = a.decline_reason
        if a.department_id:
            # Aggregate only — never who responded.
            data["response_count"] = response_count or 0
    return data


def interview_turn_dict(t) -> dict:
    return {
        "id": t.id,
        "seq": t.seq,
        "role": t.role,
        "text": t.text,
        "edited": t.edited,
        "transcription_confidence": t.transcription_confidence,
        "reason": (t.meta or {}).get("reason"),
        "created_at": iso(t.created_at),
    }


def interview_artifact_dict(a) -> dict:
    return {
        "id": a.id,
        "kind": a.kind,
        "summary": a.summary,
        "details": a.details,
        "confidence": a.confidence,
        "provenance": a.provenance,
        "selected": a.selected,
        "employee_edited": a.employee_edited,
        "uncertain": a.uncertain,
        "supporting_turn_ids": a.supporting_turn_ids,
        "excerpt": a.excerpt,
        "published_target_type": a.published_target_type,
        "published_target_id": a.published_target_id,
    }


def interview_session_dict(
    s, *, include_turns: bool = False, include_artifacts: bool = False,
    include_receipt: bool = False,
) -> dict:
    data = {
        "id": s.id,
        "status": s.status,
        "mode": s.mode,
        "purpose": s.purpose,
        "visibility": s.visibility,
        "title": s.title,
        "meeting_id": s.meeting_id,
        "entity_id": s.entity_id,
        "decision_id": s.decision_id,
        "consent_at": iso(s.consent_at),
        "audio_retention_policy": s.audio_retention_policy,
        "transcript_retention_policy": s.transcript_retention_policy,
        "started_at": iso(s.started_at),
        "completed_at": iso(s.completed_at),
        "published_at": iso(s.published_at),
        "created_at": iso(s.created_at),
        "failure_code": s.failure_code,
    }
    if include_receipt:
        # The receipt is the *only* handle for anonymous sessions; it is
        # returned to the holder, never listed, never stored client-agnostically.
        data["receipt_token"] = s.receipt_token
    if include_turns:
        data["turns"] = [interview_turn_dict(t) for t in s.turns]
    if include_artifacts:
        data["artifacts"] = [interview_artifact_dict(a) for a in s.artifacts]
    return data


def my_feedback_dict(f: FeedbackSubmission) -> dict:
    """The author's own view of a named/confidential submission."""
    return {
        "id": f.id,
        "visibility": f.visibility,
        "category": f.category,
        "body": f.body,
        "status": f.status,
        "department_tag": f.department_tag,
        "project_tag": f.project_tag,
        "allow_followup": f.allow_followup,
        "created_at": iso(f.created_at),
    }
