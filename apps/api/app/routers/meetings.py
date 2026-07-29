"""Meeting capture: transcript import (the platform's first real write path)."""
from datetime import datetime

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import (
    AccessControlEntry,
    DataSource,
    Decision,
    Department,
    Document,
    Meeting,
    SecurityClassification,
    Task,
    User,
    utcnow,
)
from ..security import audit
from ..security.auth import get_current_user, require_roles
from ..security.permissions import can_read_document
from ..serializers import meeting_dict
from ..services.ingestion import ingest_document
from ..services.transcripts import (
    TranscriptParseError,
    Turn,
    parse_transcript_file,
    turns_to_document_text,
    turns_to_meta,
)

router = APIRouter(tags=["meetings"])

_IMPORT_ROLES = ("manager", "data_steward", "system_admin")
MAX_TRANSCRIPT_CHARS = 400_000  # ~2h meeting; larger needs chunked extraction (deferred)


def _upload_source(db: Session, org_id: str) -> DataSource:
    source = (
        db.query(DataSource)
        .filter(DataSource.org_id == org_id, DataSource.kind == "upload")
        .first()
    )
    if not source:
        source = DataSource(org_id=org_id, name="Manual uploads", kind="upload",
                            description="Transcripts and files imported by hand.")
        db.add(source)
        db.flush()
    return source


@router.post("/meetings/import")
def import_meeting(
    file: UploadFile = File(...),
    title: str = Form(..., min_length=3, max_length=300),
    classification_id: str = Form(...),
    held_at: str | None = Form(None),
    project: str = Form(""),
    department_id: str | None = Form(None),
    user: User = Depends(require_roles(*_IMPORT_ROLES)),
    db: Session = Depends(get_db),
):
    classification = db.get(SecurityClassification, classification_id)
    if not classification or classification.org_id != user.org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Classification not found")
    if classification.level > user.clearance_level:
        # An importer cannot create material they could not themselves read.
        raise HTTPException(status.HTTP_403_FORBIDDEN,
                            "You cannot import at a classification above your clearance")
    if department_id:
        department = db.get(Department, department_id)
        if not department or department.org_id != user.org_id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Department not found")

    # Read a worst-case byte budget (UTF-8 is up to 4 bytes/char) before
    # decoding, so a multi-byte-heavy transcript (CJK, Cyrillic, ...) that is
    # oversized in characters isn't silently truncated mid-sentence by a
    # byte-count read cap and returned as a 200.
    raw = file.file.read(MAX_TRANSCRIPT_CHARS * 4 + 1)
    try:
        content = raw.decode("utf-8")
    except UnicodeDecodeError:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT,
                            "File must be UTF-8 text (.vtt or .txt)") from None
    if len(content) > MAX_TRANSCRIPT_CHARS:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT,
                            "Transcript too large for single-pass processing")

    try:
        turns = parse_transcript_file(file.filename or "transcript.txt", content)
    except TranscriptParseError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc)) from None

    when = None
    if held_at:
        try:
            when = datetime.fromisoformat(held_at)
        except ValueError:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT,
                                "held_at must be ISO 8601") from None

    source = _upload_source(db, user.org_id)
    acl = [("department", department_id)] if department_id else [("org", "*")]
    doc = ingest_document(
        db,
        org_id=user.org_id,
        title=f"Transcript — {title}",
        content=turns_to_document_text(turns),
        doc_type="transcript",
        classification_id=classification.id,
        data_source_id=source.id,
        department_id=department_id,
        owner_user_id=user.id,
        meta={"project": project} if project else {},
        acl=acl,
        source_created_at=when,
    )
    meeting = Meeting(
        org_id=user.org_id,
        title=title,
        held_at=when or utcnow(),
        source="upload",
        transcript_document_id=doc.id,
        department_id=department_id,
        attendees=sorted({t.speaker for t in turns}),
        extraction={"turns": turns_to_meta(turns), "summary": "",
                    "decisions": [], "actions": [], "risks": [], "questions": []},
    )
    db.add(meeting)
    db.flush()

    from ..services.meeting_extraction import ExtractionError, extract_meeting, persist_extraction

    try:
        extraction, dropped = extract_meeting(turns)
        counts = persist_extraction(db, meeting, doc, extraction, dropped)
        extraction_status = "completed"
    except ExtractionError as exc:
        counts = None
        extraction_status = "failed"
        meeting.extraction = {**meeting.extraction, "error": str(exc)[:500]}

    audit.record(db, user.org_id, "meeting.imported", actor_user_id=user.id,
                 target_type="meeting", target_id=meeting.id,
                 meta={"turns": len(turns), "document_id": doc.id,
                       "extraction_failed": extraction_status == "failed"}, commit=True)
    return {
        "meeting": meeting_dict(meeting),
        "document_id": doc.id,
        "turn_count": len(turns),
        "extraction_status": extraction_status,
        "counts": counts,
    }


def _reviewable_meeting(meeting_id: str, user: User, db: Session) -> Meeting:
    """404 unless the meeting exists in the caller's org AND `can_read_document`
    passes on its transcript document — same no-existence-oracle shape as
    `get_document`. Shared by the retry-extraction and review endpoints."""
    meeting = db.get(Meeting, meeting_id)
    if not meeting or meeting.org_id != user.org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Meeting not found")
    doc = db.get(Document, meeting.transcript_document_id) if meeting.transcript_document_id else None
    if not doc or not can_read_document(db, user, doc):
        # Same response as missing: no existence oracle.
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Meeting not found")
    return meeting


def _turns_by_idx(meeting: Meeting) -> dict[int, dict]:
    return {t["idx"]: t for t in (meeting.extraction or {}).get("turns", [])}


def _resolve_turns(turn_ids, turns_map: dict[int, dict]) -> list[dict]:
    return [{"idx": i, "speaker": turns_map[i]["speaker"], "text": turns_map[i]["text"]}
            for i in turn_ids if i in turns_map]


@router.post("/meetings/{meeting_id}/extract")
def retry_extraction(
    meeting_id: str,
    user: User = Depends(require_roles(*_IMPORT_ROLES)),
    db: Session = Depends(get_db),
):
    """Re-run extraction after a failure. Refuses if artifacts already exist,
    so a retry can never duplicate proposed knowledge."""
    from ..services.meeting_extraction import ExtractionError, extract_meeting, persist_extraction

    meeting = _reviewable_meeting(meeting_id, user, db)
    doc = db.get(Document, meeting.transcript_document_id)

    ext = meeting.extraction or {}
    if ext.get("decisions") or ext.get("actions") or ext.get("risks") or ext.get("questions"):
        raise HTTPException(status.HTTP_409_CONFLICT, "Extraction already completed")
    turns = [Turn(t["idx"], t["speaker"], t["text"], t.get("start"))
             for t in ext.get("turns", [])]
    if not turns:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "No stored turns to extract from")
    try:
        extraction, dropped = extract_meeting(turns)
        counts = persist_extraction(db, meeting, doc, extraction, dropped)
    except ExtractionError as exc:
        meeting.extraction = {**ext, "error": str(exc)[:500]}
        db.commit()
        raise HTTPException(status.HTTP_502_BAD_GATEWAY,
                            "Extraction failed again; transcript kept") from None
    audit.record(db, user.org_id, "meeting.extraction.retried", actor_user_id=user.id,
                 target_type="meeting", target_id=meeting.id, meta=counts, commit=True)
    return {"extraction_status": "completed", "counts": counts}


@router.get("/meetings/{meeting_id}/review")
def meeting_review(meeting_id: str, user: User = Depends(get_current_user),
                   db: Session = Depends(get_db)):
    meeting = _reviewable_meeting(meeting_id, user, db)
    ext = meeting.extraction or {}
    turns_map = _turns_by_idx(meeting)

    decisions = []
    for ref in ext.get("decisions", []):
        row = db.get(Decision, ref["id"])
        if not row:
            continue
        decisions.append({
            "id": row.id, "title": row.title, "rationale": row.rationale,
            "alternatives": (row.details or {}).get("alternatives", []),
            "decided_by": (row.details or {}).get("decided_by", ""),
            "status": row.status,
            "turns": _resolve_turns(ref.get("turn_ids", []), turns_map),
        })
    actions = []
    for ref in ext.get("actions", []):
        row = db.get(Task, ref["task_id"])
        if not row:
            continue
        actions.append({
            "task_id": row.id, "title": row.title,
            "owner_name": ref.get("owner_name", ""), "due_hint": ref.get("due_hint", ""),
            "status": row.status,
            "turns": _resolve_turns(ref.get("turn_ids", []), turns_map),
        })
    return {
        "meeting": meeting_dict(meeting),
        "summary": ext.get("summary", ""),
        "decisions": decisions,
        "actions": actions,
        "risks": [{**r, "turns": _resolve_turns(r.get("turn_ids", []), turns_map)}
                  for r in ext.get("risks", [])],
        "questions": [{**q, "turns": _resolve_turns(q.get("turn_ids", []), turns_map)}
                      for q in ext.get("questions", [])],
        "dropped": ext.get("dropped", []),
    }


class ResolveRequest(BaseModel):
    kind: str = Field(pattern="^(decision|action|risk|question)$")
    artifact_id: str
    action: str = Field(pattern="^(approve|reject)$")
    edits: dict = Field(default_factory=dict)


def _copy_acl(db: Session, from_doc_id: str) -> list[tuple[str, str]]:
    aces = (db.query(AccessControlEntry)
            .filter(AccessControlEntry.document_id == from_doc_id).all())
    return [(a.principal_type, a.principal_id) for a in aces]


def _publish_decision_record(db: Session, user: User, meeting: Meeting,
                             transcript_doc: Document, decision: Decision) -> str:
    """The only place a decision-record document is created — approval is the
    sole path from proposed knowledge to a retrievable memory."""
    turn_ids = (decision.details or {}).get("turn_ids", [])
    alternatives = (decision.details or {}).get("alternatives", [])
    held = meeting.held_at.strftime("%Y-%m-%d") if meeting.held_at else "unknown date"
    content = (
        f"Decision: {decision.title}\n\n"
        f"What happened: {decision.title}\n\n"
        f"Why: {decision.rationale or 'No rationale recorded.'}\n\n"
        f"Alternatives considered: {', '.join(alternatives) or 'None recorded'}\n\n"
        f"Approved by: {user.name} ({user.title or 'reviewer'}) on "
        f"{utcnow().strftime('%Y-%m-%d')}\n\n"
        f"Evidence: meeting “{meeting.title}” ({held}), transcript turns "
        f"{', '.join(f'T{i}' for i in turn_ids) or 'n/a'}"
    )
    record_doc = ingest_document(
        db,
        org_id=meeting.org_id,
        title=f"Decision record — {decision.title[:120]}",
        content=content,
        doc_type="decision_log",
        classification_id=transcript_doc.classification_id,
        data_source_id=transcript_doc.data_source_id,
        department_id=transcript_doc.department_id,
        owner_user_id=user.id,
        meta={"project": decision.project, "decision_id": decision.id,
              "meeting_id": meeting.id},
        acl=_copy_acl(db, transcript_doc.id),
        confidence=0.95,
    )
    return record_doc.id


@router.post("/meetings/{meeting_id}/review/resolve")
def resolve_artifact(
    meeting_id: str,
    body: ResolveRequest,
    user: User = Depends(require_roles("manager", "executive")),
    db: Session = Depends(get_db),
):
    """Human approval is the ONLY path from proposed knowledge to retrievable
    memory: approving a decision publishes an ACL-inherited decision-record
    document; rejection publishes nothing. Every resolution is audited."""
    meeting = _reviewable_meeting(meeting_id, user, db)
    transcript_doc = db.get(Document, meeting.transcript_document_id)
    turns_map = _turns_by_idx(meeting)
    approve = body.action == "approve"

    if body.kind == "decision":
        row = db.get(Decision, body.artifact_id)
        if not row or row.meeting_id != meeting.id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Artifact not found")
        if row.status != "proposed":
            raise HTTPException(status.HTTP_409_CONFLICT, f"Already {row.status}")
        if "title" in body.edits:
            row.title = str(body.edits["title"])[:400]
        if "rationale" in body.edits:
            row.rationale = str(body.edits["rationale"])
        if approve:
            row.status = "active"
            if user.name not in row.owners:
                row.owners = [*row.owners, user.name]
            record_id = _publish_decision_record(db, user, meeting, transcript_doc, row)
            row.sources = [*row.sources, record_id]
        else:
            row.status = "rejected"
        result = {"id": row.id, "title": row.title, "rationale": row.rationale,
                  "status": row.status,
                  "turns": _resolve_turns((row.details or {}).get("turn_ids", []), turns_map)}
    elif body.kind == "action":
        row = db.get(Task, body.artifact_id)
        if not row or row.meeting_id != meeting.id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Artifact not found")
        if row.status != "proposed":
            raise HTTPException(status.HTTP_409_CONFLICT, f"Already {row.status}")
        if "title" in body.edits:
            row.title = str(body.edits["title"])[:400]
        row.status = "open" if approve else "cancelled"
        action_ref = next((a for a in (meeting.extraction or {}).get("actions", [])
                           if a.get("task_id") == row.id), {})
        result = {"task_id": row.id, "title": row.title,
                  "owner_name": action_ref.get("owner_name", ""),
                  "due_hint": action_ref.get("due_hint", ""),
                  "status": row.status,
                  "turns": _resolve_turns(action_ref.get("turn_ids", []), turns_map)}
    else:  # risk | question — stored in meeting.extraction JSON
        key = "risks" if body.kind == "risk" else "questions"
        id_field = "rid" if body.kind == "risk" else "qid"
        ext = dict(meeting.extraction or {})
        items = [dict(i) for i in ext.get(key, [])]
        match = next((i for i in items if i.get(id_field) == body.artifact_id), None)
        if not match:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Artifact not found")
        if match.get("status") != "proposed":
            raise HTTPException(status.HTTP_409_CONFLICT, f"Already {match.get('status')}")
        if "title" in body.edits:
            match["text"] = str(body.edits["title"])[:400]
        match["status"] = "confirmed" if approve else "rejected"
        ext[key] = items
        meeting.extraction = ext  # reassign so the JSON change is detected
        result = {**match, "turns": _resolve_turns(match.get("turn_ids", []), turns_map)}

    audit.record(db, user.org_id, f"meeting.artifact.{body.action}", actor_user_id=user.id,
                target_type="meeting", target_id=meeting.id,
                meta={"kind": body.kind, "artifact_id": body.artifact_id}, commit=True)
    return result
