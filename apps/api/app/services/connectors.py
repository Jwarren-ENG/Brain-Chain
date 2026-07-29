"""Connector sync engine.

Every connector implements the same interface a live integration would:
sync() pulls pending items from its (mock) upstream, runs them through the
shared ingestion pipeline, updates counters/health and writes a SyncJob log.
Live credentials would replace the MockUpstream fetch only — parsing,
extraction, permission mapping and storage are already the real path.

The Zoom connector demonstrates full transcript processing: speaker-turn
parsing plus rule-based extraction of decisions, action items, owners,
deadlines, risks and open questions into first-class records.
"""
from __future__ import annotations

import re
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from ..models import (
    Connector,
    DataSource,
    Decision,
    Meeting,
    SourceItem,
    SyncJob,
    Task,
    User,
    utcnow,
)
from ..security.audit import record
from .ingestion import ingest_document

# ------------------------------------------------------ transcript extraction

_DECISION_RE = re.compile(
    r"\b(we(?:'ve| have)? decided|decision(?: is)?:|agreed (?:that|to)|we're going with|"
    r"final call:|let's lock in)\b(.*)",
    re.IGNORECASE,
)
_ACTION_RE = re.compile(
    r"\b(?:action(?: item)?:|(?:i|we|you)(?:'ll| will) take|(\w[\w .'-]*?) (?:will|to) "
    r"(?:own|handle|draft|update|follow up|send|schedule|review|complete))\b(.*)",
    re.IGNORECASE,
)
_RISK_RE = re.compile(
    r"\b(risk|blocker|blocked|concern|worried|slip|delay|behind schedule|shortage)\b",
    re.IGNORECASE,
)
_QUESTION_RE = re.compile(r"\?\s*$")
_DEADLINE_RE = re.compile(
    r"\bby (?:(?:end of|eo)\s*)?(monday|tuesday|wednesday|thursday|friday|next week|"
    r"friday|month end|q[1-4]|[a-z]+ \d{1,2})\b",
    re.IGNORECASE,
)


def parse_transcript(text: str) -> list[tuple[str, str]]:
    """Parse `Speaker: utterance` lines into (speaker, utterance) turns."""
    turns = []
    for line in text.splitlines():
        line = line.strip()
        m = re.match(r"^([A-Z][\w .'-]{1,40}):\s+(.*)$", line)
        if m:
            turns.append((m.group(1).strip(), m.group(2).strip()))
    return turns


def extract_from_transcript(text: str) -> dict:
    turns = parse_transcript(text)
    decisions, actions, risks, questions = [], [], [], []
    for speaker, utterance in turns:
        if _DECISION_RE.search(utterance):
            decisions.append({"text": utterance, "speaker": speaker})
        m = _ACTION_RE.search(utterance)
        if m:
            owner = (m.group(1) or speaker).strip()
            deadline = None
            dm = _DEADLINE_RE.search(utterance)
            if dm:
                deadline = dm.group(1)
            actions.append({"text": utterance, "owner": owner, "deadline": deadline})
        if _RISK_RE.search(utterance):
            risks.append({"text": utterance, "speaker": speaker})
        if _QUESTION_RE.search(utterance):
            questions.append({"text": utterance, "speaker": speaker})
    return {
        "decisions": decisions,
        "action_items": actions,
        "risks": risks,
        "open_questions": questions,
        "speakers": sorted({s for s, _ in turns}),
    }


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
        extraction = extract_from_transcript(item.get("content", ""))
        meeting = Meeting(
            org_id=connector.org_id,
            title=item.get("title", "Meeting"),
            held_at=_parse_dt(item.get("created_at")) or utcnow(),
            source=connector.provider,
            transcript_document_id=doc.id,
            department_id=source.department_id,
            attendees=extraction["speakers"],
            extraction=extraction,
        )
        db.add(meeting)
        db.flush()
        for d in extraction["decisions"]:
            db.add(
                Decision(
                    org_id=connector.org_id,
                    title=d["text"][:400],
                    decided_at=meeting.held_at,
                    rationale=f"Recorded in “{meeting.title}” by {d['speaker']}.",
                    meeting_id=meeting.id,
                    document_id=doc.id,
                    project=item.get("meta", {}).get("project", ""),
                    owners=[d["speaker"]],
                    sources=[doc.id],
                )
            )
        for a in extraction["action_items"]:
            db.add(
                Task(
                    org_id=connector.org_id,
                    title=a["text"][:400],
                    description=f"Extracted from meeting “{meeting.title}”."
                    + (f" Deadline mentioned: {a['deadline']}." if a.get("deadline") else ""),
                    status="open",
                    source="meeting",
                    meeting_id=meeting.id,
                    project=item.get("meta", {}).get("project", ""),
                    due_date=_deadline_to_date(a.get("deadline")),
                )
            )
        log.append(
            {
                "t": utcnow().isoformat(),
                "msg": (
                    f"Transcript processed: {len(extraction['decisions'])} decisions, "
                    f"{len(extraction['action_items'])} action items, "
                    f"{len(extraction['risks'])} risk mentions, "
                    f"{len(extraction['open_questions'])} open questions"
                ),
            }
        )


def _parse_dt(value) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value))
    except ValueError:
        return None


def _deadline_to_date(deadline: str | None) -> datetime | None:
    if not deadline:
        return None
    base = utcnow()
    lowered = deadline.lower()
    weekdays = ["monday", "tuesday", "wednesday", "thursday", "friday"]
    if lowered in weekdays:
        delta = (weekdays.index(lowered) - base.weekday()) % 7 or 7
        return base + timedelta(days=delta)
    if "next week" in lowered:
        return base + timedelta(days=7)
    if "month end" in lowered:
        return (base.replace(day=1) + timedelta(days=32)).replace(day=1) - timedelta(days=1)
    return base + timedelta(days=14)
