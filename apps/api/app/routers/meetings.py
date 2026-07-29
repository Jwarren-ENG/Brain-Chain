"""Meeting capture: transcript import (the platform's first real write path)."""
from datetime import datetime

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import DataSource, Meeting, SecurityClassification, User, utcnow
from ..security import audit
from ..security.auth import require_roles
from ..serializers import meeting_dict
from ..services.ingestion import ingest_document
from ..services.transcripts import (
    TranscriptParseError,
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

    raw = file.file.read(MAX_TRANSCRIPT_CHARS + 1)
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
    audit.record(db, user.org_id, "meeting.imported", actor_user_id=user.id,
                 target_type="meeting", target_id=meeting.id,
                 meta={"turns": len(turns), "document_id": doc.id}, commit=True)
    return {
        "meeting": meeting_dict(meeting),
        "document_id": doc.id,
        "turn_count": len(turns),
        "extraction_status": "pending",  # Task 12 replaces this with real counts
    }
