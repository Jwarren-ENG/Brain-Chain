"""Workflow 3: anonymous feedback protection is enforced by the backend."""
import json
import re

EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+\.[\w.]+")


def test_anonymous_submission_stores_no_identity(client, auth):
    resp = client.post(
        "/api/feedback",
        json={
            "body": "Anonymous test note about procurement approvals being slow.",
            "visibility": "anonymous",
            "category": "process",
            "allow_followup": True,  # must be ignored for anonymous
        },
        headers=auth("dana"),
    )
    assert resp.status_code == 201
    body = resp.json()
    assert "receipt_token" in body
    assert "id" not in body  # no addressable id handed back for anonymous items
    assert "privacy_note" in body

    # Structural check: the row has no user linkage.
    from app.db import SessionLocal
    from app.models import FeedbackSubmission

    db = SessionLocal()
    row = (
        db.query(FeedbackSubmission)
        .filter(FeedbackSubmission.receipt_token == body["receipt_token"])
        .one()
    )
    assert row.user_id is None
    assert row.allow_followup is False
    assert row.created_at.hour == 0 and row.created_at.minute == 0  # coarsened
    db.close()


def test_anonymous_audit_event_has_no_actor(client, auth):
    from app.db import SessionLocal
    from app.models import AuditEvent

    db = SessionLocal()
    events = (
        db.query(AuditEvent)
        .filter(AuditEvent.action == "feedback.submitted")
        .all()
    )
    anonymous_events = [e for e in events if e.meta.get("visibility") == "anonymous"]
    assert anonymous_events
    assert all(e.actor_user_id is None for e in anonymous_events)
    assert all(e.target_id == "" for e in anonymous_events)
    db.close()


def test_employee_cannot_read_aggregates(client, auth):
    assert client.get("/api/feedback/aggregate", headers=auth("avery")).status_code == 403


def test_threshold_blocks_then_unlocks_theme(client, auth):
    """Procurement bottlenecks is seeded with 4 anonymous submissions plus the
    one added above = 5 → it unlocks exactly at the configured cohort."""
    agg = client.get("/api/feedback/aggregate", headers=auth("morgan")).json()
    assert agg["cohort_met"] is True
    themes = {t["name"]: t for t in agg["themes"]}
    proc = themes["Procurement bottlenecks"]
    assert proc["suppressed"] is False
    assert proc["count"] == 5

    # A small theme stays suppressed with no counts or text.
    tooling = themes.get("Test equipment & tooling")
    assert tooling and tooling["suppressed"] is True
    assert "count" not in tooling and "sample_excerpts" not in tooling


def test_aggregate_contains_no_identities(client, auth):
    agg = client.get("/api/feedback/aggregate", headers=auth("morgan")).json()
    blob = json.dumps(agg)
    assert not EMAIL_RE.search(blob)
    for banned in ("user_id", "receipt_token", "Avery", "Priya", "Dana", "Noah", "Leo"):
        assert banned not in blob


def test_filter_narrowing_cannot_shrink_cohort(client, auth):
    """Slicing by a rare tag must return a cohort-too-small response, never a
    tiny identifiable set."""
    agg = client.get(
        "/api/feedback/aggregate",
        params={"department_tag": "Manufacturing"},
        headers=auth("morgan"),
    ).json()
    assert agg["cohort_met"] is False
    assert agg["themes"] == []
    assert agg["sentiment"] is None
    assert "response_count" in agg and agg["response_count"] < agg["threshold"]


def test_author_only_filters_are_ignored(client, auth):
    """Unknown/disallowed filter params (e.g. user) must not be honored."""
    full = client.get("/api/feedback/aggregate", headers=auth("morgan")).json()
    probed = client.get(
        "/api/feedback/aggregate", params={"user": "avery.chen"}, headers=auth("morgan")
    ).json()
    assert probed["response_count"] == full["response_count"]


def test_receipt_lookup_returns_status_only(client, auth):
    resp = client.post(
        "/api/feedback",
        json={"body": "Second anonymous probe about tooling budget.", "visibility": "anonymous"},
        headers=auth("leo"),
    )
    token = resp.json()["receipt_token"]
    receipt = client.get(f"/api/feedback/receipt/{token}", headers=auth("leo")).json()
    assert receipt["status"] == "submitted"
    assert set(receipt) == {"status", "category", "visibility", "submitted_on"}


def test_named_feedback_visible_to_author_only_in_mine(client, auth):
    mine = client.get("/api/feedback/mine", headers=auth("avery")).json()["items"]
    assert any("decisions digest" in f["body"] for f in mine)
    # Anonymous items never appear in /mine, even for their author.
    assert all(f["visibility"] != "anonymous" for f in mine)
