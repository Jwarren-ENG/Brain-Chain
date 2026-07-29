"""Contract tests: interview privacy invariants (release-blocking).
Written before implementation (Phase 0)."""
import json


def _create(client, auth, who="avery", **overrides):
    body = {
        "mode": "text",
        "purpose": "concern",
        "visibility": "anonymous",
        **overrides,
    }
    return client.post("/api/interviews", json=body, headers=auth(who))


# ------------------------------------------------------------ voice ≠ anonymous


def test_anonymous_voice_rejected_without_record(client, auth):
    from app.db import SessionLocal
    from app.models import InterviewSession

    db = SessionLocal()
    before = db.query(InterviewSession).count()
    db.close()

    for mode in ("voice", "quick_voice"):
        resp = _create(client, auth, mode=mode)
        assert resp.status_code == 422, f"{mode} must reject anonymous"
        assert "anonymous" in resp.text.lower()

    db = SessionLocal()
    after = db.query(InterviewSession).count()
    db.close()
    assert after == before  # no record created


# ------------------------------------------------------- structural anonymity


def test_anonymous_session_stores_no_identity(client, auth):
    resp = _create(client, auth, who="leo")
    assert resp.status_code == 201
    body = resp.json()
    assert body["receipt_token"]

    from app.db import SessionLocal
    from app.models import InterviewSession

    db = SessionLocal()
    row = db.get(InterviewSession, body["id"])
    assert row.user_id is None
    # Timestamp coarsened to the day.
    assert row.created_at.hour == 0 and row.created_at.minute == 0
    db.close()


def test_anonymous_session_not_in_account_history(client, auth):
    created = _create(client, auth, who="leo").json()
    listing = client.get("/api/interviews", headers=auth("leo")).json()
    assert all(item["id"] != created["id"] for item in listing["items"])


def test_anonymous_session_requires_receipt_even_for_creator(client, auth):
    created = _create(client, auth, who="leo").json()
    sid, receipt = created["id"], created["receipt_token"]
    # Without the receipt: 404 for everyone, including the creator's account.
    assert client.get(f"/api/interviews/{sid}", headers=auth("leo")).status_code == 404
    # With the receipt: accessible.
    ok = client.get(f"/api/interviews/{sid}", params={"receipt": receipt}, headers=auth("leo"))
    assert ok.status_code == 200
    # Managers/admins can never fetch it.
    for who in ("morgan", "jordan", "riley", "sam"):
        assert client.get(f"/api/interviews/{sid}", headers=auth(who)).status_code == 404


def test_anonymous_audit_has_no_actor_and_no_transcript(client, auth):
    created = _create(client, auth, who="leo").json()
    sid, receipt = created["id"], created["receipt_token"]
    secret_text = "the anonymized workload sentence nobody should see in audit"
    client.post(f"/api/interviews/{sid}/start", params={"receipt": receipt}, headers=auth("leo"))
    client.post(
        f"/api/interviews/{sid}/turns",
        params={"receipt": receipt},
        json={"text": secret_text},
        headers=auth("leo"),
    )

    from app.db import SessionLocal
    from app.models import AuditEvent

    db = SessionLocal()
    events = (
        db.query(AuditEvent)
        .filter(AuditEvent.action.like("interview.%"), AuditEvent.target_id == sid)
        .all()
    )
    assert events, "interview lifecycle must be audited"
    for event in events:
        assert event.actor_user_id is None
        assert secret_text not in json.dumps(event.meta)
    db.close()


def test_named_audit_never_contains_turn_text(client, auth):
    session = client.post(
        "/api/interviews",
        json={"mode": "text", "purpose": "process", "visibility": "named"},
        headers=auth("avery"),
    ).json()
    secret_text = "named transcript content that stays out of audit logs"
    client.post(f"/api/interviews/{session['id']}/start", headers=auth("avery"))
    client.post(
        f"/api/interviews/{session['id']}/turns",
        json={"text": secret_text},
        headers=auth("avery"),
    )

    from app.db import SessionLocal
    from app.models import AuditEvent

    db = SessionLocal()
    blob = json.dumps([e.meta for e in db.query(AuditEvent).all()])
    db.close()
    assert secret_text not in blob


# ------------------------------------------------------ ownership & isolation


def test_sessions_are_owner_private(client, auth):
    session = client.post(
        "/api/interviews",
        json={"mode": "text", "purpose": "process", "visibility": "named"},
        headers=auth("avery"),
    ).json()
    # Another employee, a manager, an executive, and the security admin all 404.
    for who in ("priya", "morgan", "jordan", "riley"):
        assert client.get(f"/api/interviews/{session['id']}", headers=auth(who)).status_code == 404
        assert (
            client.get(f"/api/interviews/{session['id']}/artifacts", headers=auth(who)).status_code
            == 404
        )


def test_confidential_publish_carries_no_attribution(client, auth):
    session = client.post(
        "/api/interviews",
        json={"mode": "text", "purpose": "expert", "visibility": "confidential"},
        headers=auth("priya"),
    ).json()
    sid = session["id"]
    client.post(f"/api/interviews/{sid}/start", headers=auth("priya"))
    client.post(
        f"/api/interviews/{sid}/turns",
        json={
            "text": "Rule of thumb: always soak the thermal chamber for two hours before "
            "any qualification run, otherwise the first cycle data is unusable."
        },
        headers=auth("priya"),
    )
    client.post(f"/api/interviews/{sid}/complete", headers=auth("priya"))
    published = client.post(f"/api/interviews/{sid}/publish", headers=auth("priya"))
    assert published.status_code == 200
    doc_ids = [
        d["target_id"] for d in published.json()["destinations"] if d["target_type"] == "document"
    ]
    assert doc_ids, "expert heuristic should publish as knowledge"

    # Any authorized reader sees the knowledge but never the author or session.
    doc = client.get(f"/api/documents/{doc_ids[0]}", headers=auth("morgan")).json()
    blob = json.dumps(doc)
    assert "Priya" not in blob
    assert sid not in blob
    assert doc["owner"] is None
    assert doc["meta"]["contributed"] == "unattributed"


def test_anonymous_knowledge_is_not_a_citable_document(client, auth):
    created = _create(client, auth, who="noah").json()
    sid, receipt = created["id"], created["receipt_token"]
    client.post(f"/api/interviews/{sid}/start", params={"receipt": receipt}, headers=auth("noah"))
    client.post(
        f"/api/interviews/{sid}/turns",
        params={"receipt": receipt},
        json={"text": "The procurement approval queue is a risk to every test campaign this quarter."},
        headers=auth("noah"),
    )
    client.post(f"/api/interviews/{sid}/complete", params={"receipt": receipt}, headers=auth("noah"))
    published = client.post(
        f"/api/interviews/{sid}/publish", params={"receipt": receipt}, headers=auth("noah")
    )
    assert published.status_code == 200
    destinations = published.json()["destinations"]
    assert destinations, "anonymous concern should publish somewhere protected"
    assert all(d["target_type"] != "document" for d in destinations)
    assert any(d["target_type"] == "feedback" for d in destinations)

    from app.db import SessionLocal
    from app.models import FeedbackSubmission

    db = SessionLocal()
    rows = [
        f
        for f in db.query(FeedbackSubmission).all()
        if "procurement approval queue" in f.body
    ]
    assert rows and all(r.user_id is None and r.visibility == "anonymous" for r in rows)
    db.close()


def test_consent_required_before_any_voice_capture(client, auth):
    session = client.post(
        "/api/interviews",
        json={"mode": "voice", "purpose": "expert", "visibility": "named"},
        headers=auth("morgan"),
    ).json()
    sid = session["id"]
    client.post(f"/api/interviews/{sid}/start", headers=auth("morgan"))
    assert client.post(
        f"/api/interviews/{sid}/voice-chunk", json={}, headers=auth("morgan")
    ).status_code == 409
