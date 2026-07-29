"""Connector sync engine.

Every connector implements the same interface a live integration would:
sync() pulls pending items from its (mock) upstream, runs them through the
shared ingestion pipeline, updates counters/health and writes a SyncJob log.
Live credentials would replace the MockUpstream fetch only — parsing,
extraction, permission mapping and storage are already the real path.

The Zoom connector demonstrates full transcript processing: speaker-turn
parsing plus LLM-backed extraction (`meeting_extraction.extract_meeting` /
`persist_extraction`, keyless-mock fallback included) of decisions, action
items, owners, due hints, risks and open questions — landed as proposed
knowledge pending review.
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy.orm import Session

from ..models import (
    Connector,
    DataSource,
    Meeting,
    SourceItem,
    SyncJob,
    User,
    utcnow,
)
from ..security.audit import record
from .ingestion import ingest_document

# ------------------------------------------------------------- sync execution


def run_sync(
    db: Session,
    connector: Connector,
    *,
    triggered_by: User | None = None,
    trigger: str = "manual",
) -> SyncJob:
    """Execute one sync cycle for a connector: pull pending mock items, ingest
    them, update health metrics, and record an auditable job log."""
    job = SyncJob(
        connector_id=connector.id,
        status="running",
        trigger=trigger,
        started_at=utcnow(),
        triggered_by_user_id=triggered_by.id if triggered_by else None,
    )
    db.add(job)
    db.flush()

    log: list[dict] = [{"t": utcnow().isoformat(), "msg": f"Sync started ({trigger})"}]
    pending: list[dict] = list(connector.config.get("pending_items", []))
    processed = skipped = 0

    try:
        for item in pending:
            if item.get("permission_error"):
                skipped += 1
                connector.permission_errors += 1
                log.append(
                    {
                        "t": utcnow().isoformat(),
                        "msg": f"Skipped “{item.get('title', 'item')}”: upstream permission "
                        "denied — item stays out of the knowledge base",
                        "level": "warning",
                    }
                )
                continue
            _ingest_item(db, connector, item, log)
            processed += 1

        connector.config = {**connector.config, "pending_items": []}
        connector.items_synced += processed
        connector.items_skipped += skipped
        connector.last_sync_at = utcnow()
        connector.health = "degraded" if skipped and not processed else "healthy"
        connector.status = "connected"
        job.status = "success"
        log.append(
            {"t": utcnow().isoformat(), "msg": f"Sync complete: {processed} ingested, {skipped} skipped"}
        )
    except Exception as exc:  # noqa: BLE001 - job must record its own failure
        job.status = "failed"
        connector.health = "failing"
        log.append({"t": utcnow().isoformat(), "msg": f"Sync failed: {exc}", "level": "error"})

    job.items_processed = processed
    job.items_skipped = skipped
    job.finished_at = utcnow()
    job.log = log
    record(
        db,
        connector.org_id,
        "connector.sync",
        actor_user_id=triggered_by.id if triggered_by else None,
        actor_type="user" if triggered_by else "system",
        target_type="connector",
        target_id=connector.id,
        meta={"processed": processed, "skipped": skipped, "status": job.status},
    )
    db.commit()
    return job


def _ingest_item(db: Session, connector: Connector, item: dict, log: list[dict]) -> None:
    source: DataSource = connector.data_source
    source_item = SourceItem(
        connector_id=connector.id,
        external_id=item.get("external_id", ""),
        kind=item.get("kind", "file"),
        title=item.get("title", "Untitled"),
        raw_meta={k: v for k, v in item.items() if k not in ("content",)},
    )
    db.add(source_item)
    db.flush()

    acl = [tuple(a) for a in item.get("acl", [])]
    if not acl:
        acl = (
            [("department", source.department_id)]
            if source.department_id
            else [("org", "*")]
        )

    doc = ingest_document(
        db,
        org_id=connector.org_id,
        title=item.get("title", "Untitled"),
        content=item.get("content", ""),
        doc_type=item.get("doc_type", "note"),
        classification_id=item.get("classification_id") or source.classification_id,
        data_source_id=source.id,
        source_item_id=source_item.id,
        department_id=source.department_id,
        owner_user_id=source.owner_user_id,
        retention_policy_id=source.retention_policy_id,
        meta=item.get("meta", {}),
        acl=acl,
        source_created_at=_parse_dt(item.get("created_at")),
    )
    log.append({"t": utcnow().isoformat(), "msg": f"Ingested “{doc.title}” ({doc.doc_type})"})

    if item.get("kind") == "transcript":
        from .meeting_extraction import ExtractionError, extract_meeting, persist_extraction
        from .transcripts import TranscriptParseError, parse_transcript_file, turns_to_meta

        try:
            turns = parse_transcript_file(item.get("title", "t.txt") + ".txt",
                                          item.get("content", ""))
        except TranscriptParseError as exc:
            # The document itself is already ingested above; just skip
            # meeting/artifact creation for this one item and keep the batch
            # going — one unparseable transcript must not fail the whole sync.
            log.append({"t": utcnow().isoformat(),
                        "msg": f"Transcript parse failed: {exc}", "level": "error"})
            return

        meeting = Meeting(
            org_id=connector.org_id,
            title=item.get("title", "Meeting"),
            held_at=_parse_dt(item.get("created_at")) or utcnow(),
            source=connector.provider,
            transcript_document_id=doc.id,
            department_id=source.department_id,
            attendees=sorted({t.speaker for t in turns}),
            extraction={"turns": turns_to_meta(turns)},
        )
        db.add(meeting)
        db.flush()
        try:
            extraction, dropped = extract_meeting(turns)
            counts = persist_extraction(db, meeting, doc, extraction, dropped)
            log.append({"t": utcnow().isoformat(),
                        "msg": (f"Transcript processed: {counts['decisions']} decisions, "
                                f"{counts['actions']} action items, {counts['risks']} risks, "
                                f"{counts['questions']} open questions (proposed — "
                                "pending review)")})
        except ExtractionError as exc:
            log.append({"t": utcnow().isoformat(),
                        "msg": f"Extraction failed: {exc}", "level": "error"})


def _parse_dt(value) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value))
    except ValueError:
        return None
