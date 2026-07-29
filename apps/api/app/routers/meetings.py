"""Meeting capture: transcript import (the platform's first real write path)."""
from datetime import datetime

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import DataSource, Department, Document, Meeting, SecurityClassification, User, utcnow
from ..security import audit
from ..security.auth import require_roles
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


@router.post("/meetings/{meeting_id}/extract")
def retry_extraction(
    meeting_id: str,
    user: User = Depends(require_roles(*_IMPORT_ROLES)),
    db: Session = Depends(get_db),
):
    """Re-run extraction after a failure. Refuses if artifacts already exist,
    so a retry can never duplicate proposed knowledge.

    Access check inlined here (Task 12): 404 unless the meeting exists in the
    caller's org AND `can_read_document` passes on its transcript document —
    same no-existence-oracle shape as `get_document`. Task 13 lifts this into
    a shared `_reviewable_meeting` helper used by the review endpoints too.
    """
    from ..services.meeting_extraction import ExtractionError, extract_meeting, persist_extraction

    meeting = db.get(Meeting, meeting_id)
    doc = db.get(Document, meeting.transcript_document_id) if meeting and meeting.transcript_document_id else None
    if not meeting or meeting.org_id != user.org_id or not doc or not can_read_document(db, user, doc):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Meeting not found")

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
