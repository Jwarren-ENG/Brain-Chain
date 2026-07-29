"""Connector sync engine: a single bad item must not sink the whole batch."""
from app.db import SessionLocal
from app.models import Connector, DataSource, Document, Meeting
from app.services.connectors import run_sync


def test_sync_continues_after_one_unparseable_transcript_item():
    """A transcript item with no speaker-labelled lines raises
    TranscriptParseError inside _ingest_item. That must be caught per-item
    (mirroring the ExtractionError handling right below it) rather than
    escaping to run_sync's outer except, which would mark the whole job
    failed and abandon every other pending item in the batch."""
    db = SessionLocal()
    try:
        org_id = db.query(Meeting).first().org_id
        classification_id = db.query(Document).first().classification_id
        source = DataSource(org_id=org_id, name="Test Zoom — batch resilience",
                            kind="zoom", classification_id=classification_id)
        db.add(source)
        db.flush()
        connector = Connector(
            org_id=org_id, data_source_id=source.id, provider="zoom",
            display_name="Zoom (batch resilience test)",
            config={"pending_items": [
                {
                    "external_id": "bad-1",
                    "kind": "transcript",
                    "title": "Unparseable meeting — batch resilience test",
                    "content": "no speaker labels here\njust plain prose, no colons\n",
                },
                {
                    "external_id": "good-1",
                    "kind": "transcript",
                    "title": "Good meeting — batch resilience test",
                    "content": (
                        "Maria Santos: We decided to switch the bracket to 7075 aluminum.\n"
                        "David Kim: Margin was insufficient with 6061.\n"
                    ),
                },
            ]},
        )
        db.add(connector)
        db.flush()

        job = run_sync(db, connector)

        assert job.status == "success"
        assert job.items_processed == 2  # both docs still ingested
        log_msgs = [entry["msg"] for entry in job.log]
        assert any("parse failed" in m.lower() for m in log_msgs)
        # metadata only: the unparseable content itself is never logged
        assert not any("no speaker labels" in m for m in log_msgs)

        bad_doc = (
            db.query(Document)
            .filter(Document.title == "Unparseable meeting — batch resilience test")
            .first()
        )
        assert bad_doc is not None  # document ingested despite the parse failure
        assert db.query(Meeting).filter(
            Meeting.transcript_document_id == bad_doc.id
        ).first() is None  # ...but no meeting/artifacts for it

        good_doc = (
            db.query(Document)
            .filter(Document.title == "Good meeting — batch resilience test")
            .first()
        )
        assert good_doc is not None
        good_meeting = db.query(Meeting).filter(
            Meeting.transcript_document_id == good_doc.id
        ).first()
        assert good_meeting is not None  # the valid item still processed normally
    finally:
        db.rollback()
        db.close()
