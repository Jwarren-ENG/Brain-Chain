"""Contract tests: extraction citations, publishing destinations, permission
inheritance, deletion propagation. Written before implementation (Phase 0)."""
import json


def _run_named_process_interview(client, auth, who="avery"):
    session = client.post(
        "/api/interviews",
        json={
            "mode": "text",
            "purpose": "process",
            "visibility": "named",
            "title": "Supplier qualification process",
        },
        headers=auth(who),
    ).json()
    sid = session["id"]
    client.post(f"/api/interviews/{sid}/start", headers=auth(who))
    answers = [
        "First procurement requests three quotes, then engineering reviews sample parts "
        "against the qualification checklist.",
        "Exception: when a program is schedule-critical we sometimes skip the second audit "
        "and rely on the incoming inspection instead. That workaround is not documented.",
        "The slowest step is the supplier financial-health check because it is a risk owned "
        "by finance and it blocks the purchase order.",
    ]
    for text in answers:
        client.post(f"/api/interviews/{sid}/turns", json={"text": text}, headers=auth(who))
    client.post(f"/api/interviews/{sid}/complete", headers=auth(who))
    return sid


def test_artifacts_carry_citations_and_provenance(client, auth):
    sid = _run_named_process_interview(client, auth)
    artifacts = client.get(f"/api/interviews/{sid}/artifacts", headers=auth("avery")).json()["items"]
    assert artifacts
    for artifact in artifacts:
        assert artifact["supporting_turn_ids"], "every artifact must cite source turns"
        assert artifact["excerpt"]
        assert artifact["provenance"] in ("firsthand", "hearsay", "unknown")
        assert 0 <= artifact["confidence"] <= 1
    kinds = {a["kind"] for a in artifacts}
    assert "process_step" in kinds
    assert kinds & {"process_exception", "workaround"}
    assert "risk" in kinds


def test_review_edits_and_selection_respected_on_publish(client, auth):
    sid = _run_named_process_interview(client, auth)
    artifacts = client.get(f"/api/interviews/{sid}/artifacts", headers=auth("avery")).json()["items"]

    excluded = artifacts[0]
    client.patch(
        f"/api/interviews/{sid}/artifacts/{excluded['id']}",
        json={"selected": False},
        headers=auth("avery"),
    )
    edited = artifacts[1]
    corrected = client.patch(
        f"/api/interviews/{sid}/artifacts/{edited['id']}",
        json={"summary": "Corrected by the employee during review."},
        headers=auth("avery"),
    ).json()
    assert corrected["employee_edited"] is True

    published = client.post(f"/api/interviews/{sid}/publish", headers=auth("avery")).json()
    published_artifact_ids = {d["artifact_id"] for d in published["destinations"]}
    assert excluded["id"] not in published_artifact_ids
    assert edited["id"] in published_artifact_ids


def test_named_knowledge_is_retrievable_with_contribution_label(client, auth):
    sid = _run_named_process_interview(client, auth)
    published = client.post(f"/api/interviews/{sid}/publish", headers=auth("avery")).json()
    doc_ids = [d["target_id"] for d in published["destinations"] if d["target_type"] == "document"]
    assert doc_ids

    doc = client.get(f"/api/documents/{doc_ids[0]}", headers=auth("avery")).json()
    assert doc["doc_type"] == "contribution"
    assert doc["meta"]["origin"] == "interview"
    assert doc["meta"]["contributed"] == "named"
    assert doc["meta"]["interview_session_id"] == sid

    # Ask the Brain can cite it, labeled as an employee contribution.
    answer = client.post(
        "/api/ask",
        json={"query": "How does the supplier qualification process work?"},
        headers=auth("avery"),
    ).json()
    contribution_citations = [
        c for c in answer["message"]["citations"] if c.get("origin") == "interview"
    ]
    assert contribution_citations, "published interview knowledge should be citable"


def test_meeting_topic_routing_and_attribution(client, auth):
    meetings = client.get("/api/meetings", headers=auth("morgan")).json()["items"]
    meeting_id = meetings[0]["id"]

    # Named topic.
    named = client.post(
        "/api/interviews",
        json={
            "mode": "quick_text",
            "purpose": "meeting_prep",
            "visibility": "named",
            "meeting_id": meeting_id,
        },
        headers=auth("morgan"),
    ).json()
    client.post(f"/api/interviews/{named['id']}/start", headers=auth("morgan"))
    client.post(
        f"/api/interviews/{named['id']}/turns",
        json={"text": "We need to decide the battery buffer-stock quantity before October."},
        headers=auth("morgan"),
    )
    client.post(f"/api/interviews/{named['id']}/complete", headers=auth("morgan"))
    client.post(f"/api/interviews/{named['id']}/publish", headers=auth("morgan"))

    # Anonymous topic.
    anon = client.post(
        "/api/interviews",
        json={
            "mode": "quick_text",
            "purpose": "meeting_prep",
            "visibility": "anonymous",
            "meeting_id": meeting_id,
        },
        headers=auth("leo"),
    ).json()
    receipt = anon["receipt_token"]
    client.post(f"/api/interviews/{anon['id']}/start", params={"receipt": receipt}, headers=auth("leo"))
    client.post(
        f"/api/interviews/{anon['id']}/turns",
        params={"receipt": receipt},
        json={"text": "Please discuss weekend overtime expectations for the integration crunch."},
        headers=auth("leo"),
    )
    client.post(f"/api/interviews/{anon['id']}/complete", params={"receipt": receipt}, headers=auth("leo"))
    client.post(f"/api/interviews/{anon['id']}/publish", params={"receipt": receipt}, headers=auth("leo"))

    topics = client.get(f"/api/meetings/{meeting_id}/topics", headers=auth("avery")).json()["items"]
    named_topic = next(t for t in topics if "buffer-stock" in t["summary"])
    anon_topic = next(t for t in topics if "overtime" in t["summary"])
    assert named_topic["author"] == "Morgan Reyes"
    assert anon_topic["author"] is None
    assert "Leo" not in json.dumps(topics)


def test_decision_interview_creates_proposed_decision_requiring_confirmation(client, auth):
    session = client.post(
        "/api/interviews",
        json={"mode": "text", "purpose": "decision", "visibility": "named"},
        headers=auth("jordan"),
    ).json()
    sid = session["id"]
    client.post(f"/api/interviews/{sid}/start", headers=auth("jordan"))
    answers = [
        "We decided to dual-source the flight battery cells starting with Ionex as the second source.",
        "The alternative was a large buffer order from VoltCore alone, but that leaves a single "
        "point of failure. Dana disagreed and preferred the buffer order because qualification "
        "takes twelve weeks.",
        "We assume Ionex can pass qualification by December. Success metric: no battery-driven "
        "schedule slip in the October build.",
    ]
    for text in answers:
        client.post(f"/api/interviews/{sid}/turns", json={"text": text}, headers=auth("jordan"))
    client.post(f"/api/interviews/{sid}/complete", headers=auth("jordan"))
    published = client.post(f"/api/interviews/{sid}/publish", headers=auth("jordan")).json()

    decision_ids = [d["target_id"] for d in published["destinations"] if d["target_type"] == "decision"]
    assert decision_ids
    decisions = client.get("/api/decisions", headers=auth("jordan")).json()["items"]
    row = next(d for d in decisions if d["id"] == decision_ids[0])
    assert row["status"] == "proposed"

    # An ordinary employee cannot confirm it.
    assert client.post(
        f"/api/decisions/{decision_ids[0]}/confirm", headers=auth("avery")
    ).status_code == 403
    # A manager can.
    confirmed = client.post(f"/api/decisions/{decision_ids[0]}/confirm", headers=auth("morgan"))
    assert confirmed.status_code == 200
    assert confirmed.json()["status"] == "active"


def test_action_items_become_draft_tasks(client, auth):
    session = client.post(
        "/api/interviews",
        json={"mode": "text", "purpose": "process", "visibility": "named"},
        headers=auth("dana"),
    ).json()
    sid = session["id"]
    client.post(f"/api/interviews/{sid}/start", headers=auth("dana"))
    client.post(
        f"/api/interviews/{sid}/turns",
        json={"text": "I will draft the second-source qualification checklist for Ionex next week."},
        headers=auth("dana"),
    )
    client.post(f"/api/interviews/{sid}/complete", headers=auth("dana"))
    published = client.post(f"/api/interviews/{sid}/publish", headers=auth("dana")).json()
    task_ids = [d["target_id"] for d in published["destinations"] if d["target_type"] == "task"]
    assert task_ids
    tasks = client.get("/api/tasks", headers=auth("dana")).json()["items"]
    task = next(t for t in tasks if t["id"] == task_ids[0])
    assert task["source"] == "interview"


def test_deletion_propagates_everywhere(client, auth):
    sid = _run_named_process_interview(client, auth, who="priya")
    published = client.post(f"/api/interviews/{sid}/publish", headers=auth("priya")).json()
    doc_ids = [d["target_id"] for d in published["destinations"] if d["target_type"] == "document"]
    assert doc_ids

    deleted = client.delete(f"/api/interviews/{sid}", headers=auth("priya"))
    assert deleted.status_code == 200

    from app.db import SessionLocal
    from app.models import (
        Citation,
        Document,
        DocumentChunk,
        InterviewArtifact,
        InterviewSession,
        InterviewTurn,
    )

    db = SessionLocal()
    assert db.get(InterviewSession, sid) is None
    assert db.query(InterviewTurn).filter(InterviewTurn.session_id == sid).count() == 0
    assert db.query(InterviewArtifact).filter(InterviewArtifact.session_id == sid).count() == 0
    for doc_id in doc_ids:
        assert db.get(Document, doc_id) is None
        assert db.query(DocumentChunk).filter(DocumentChunk.document_id == doc_id).count() == 0
        assert db.query(Citation).filter(Citation.document_id == doc_id).count() == 0
    db.close()

    # Session is gone from the API too.
    assert client.get(f"/api/interviews/{sid}", headers=auth("priya")).status_code == 404


def test_voice_draft_deletion_removes_audio(client, auth):
    session = client.post(
        "/api/interviews",
        json={"mode": "voice", "purpose": "expert", "visibility": "named"},
        headers=auth("morgan"),
    ).json()
    sid = session["id"]
    client.post(f"/api/interviews/{sid}/start", headers=auth("morgan"))
    client.post(
        f"/api/interviews/{sid}/consent",
        json={"audio_retention_policy": "delete_after_transcription"},
        headers=auth("morgan"),
    )
    client.post(f"/api/interviews/{sid}/voice-chunk", json={}, headers=auth("morgan"))
    assert client.delete(f"/api/interviews/{sid}", headers=auth("morgan")).status_code == 200

    from app.db import SessionLocal
    from app.models import AudioAsset

    db = SessionLocal()
    assert db.query(AudioAsset).filter(AudioAsset.session_id == sid).count() == 0
    db.close()


def test_audio_deleted_after_transcription_by_default(client, auth):
    session = client.post(
        "/api/interviews",
        json={"mode": "voice", "purpose": "expert", "visibility": "named"},
        headers=auth("morgan"),
    ).json()
    sid = session["id"]
    client.post(f"/api/interviews/{sid}/start", headers=auth("morgan"))
    client.post(
        f"/api/interviews/{sid}/consent",
        json={"audio_retention_policy": "delete_after_transcription"},
        headers=auth("morgan"),
    )
    client.post(f"/api/interviews/{sid}/voice-chunk", json={}, headers=auth("morgan"))
    client.post(f"/api/interviews/{sid}/complete", headers=auth("morgan"))

    from app.db import SessionLocal
    from app.models import AudioAsset

    db = SessionLocal()
    assets = db.query(AudioAsset).filter(AudioAsset.session_id == sid).all()
    assert assets and all(a.status == "deleted" and a.deleted_at for a in assets)
    db.close()


def test_existing_restricted_document_rules_still_hold(client, auth):
    """Regression guard: the interview feature must not weaken existing
    permission behavior."""
    resp = client.get(
        "/api/search", params={"q": "negotiation strategy ceiling walk-away"}, headers=auth("avery")
    )
    assert "Negotiation Strategy" not in json.dumps(resp.json())
