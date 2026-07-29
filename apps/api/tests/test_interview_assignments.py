"""Interview assignments (manager-requested, employee-controlled) and the
open "just talk" conversation purpose."""
import json


def _create_individual(client, auth, assignee_id):
    return client.post(
        "/api/interview-assignments",
        json={
            "purpose": "process",
            "title": "Walk me through the supplier audit as it really happens",
            "note": "The documented flow and reality seem to differ — your view would help.",
            "assignee_user_id": assignee_id,
        },
        headers=auth("morgan"),
    )


def _user_id(client, auth, who):
    return client.get("/api/auth/me", headers=auth(who)).json()["id"]


def test_only_managers_create_assignments(client, auth):
    avery_id = _user_id(client, auth, "avery")
    denied = client.post(
        "/api/interview-assignments",
        json={"purpose": "process", "title": "Not allowed", "assignee_user_id": avery_id},
        headers=auth("avery"),
    )
    assert denied.status_code == 403


def test_assignment_requires_exactly_one_target(client, auth):
    avery_id = _user_id(client, auth, "avery")
    neither = client.post(
        "/api/interview-assignments",
        json={"purpose": "process", "title": "No target"},
        headers=auth("morgan"),
    )
    assert neither.status_code == 422
    departments = client.get("/api/departments", headers=auth("morgan")).json()["items"]
    both = client.post(
        "/api/interview-assignments",
        json={
            "purpose": "process",
            "title": "Two targets",
            "assignee_user_id": avery_id,
            "department_id": departments[0]["id"],
        },
        headers=auth("morgan"),
    )
    assert both.status_code == 422


def test_individual_assignment_lifecycle(client, auth):
    avery_id = _user_id(client, auth, "avery")
    assignment = _create_individual(client, auth, avery_id).json()
    assert assignment["status"] == "open"
    assert assignment["scope"] == "individual"

    # Avery sees it; an uninvolved employee does not.
    avery_view = client.get("/api/interview-assignments", headers=auth("avery")).json()
    assert any(a["id"] == assignment["id"] for a in avery_view["assigned_to_me"])
    assert avery_view["assigned_to_me"][0]["created_by"]["name"] == "Morgan Reyes"
    leo_view = client.get("/api/interview-assignments", headers=auth("leo")).json()
    assert all(a["id"] != assignment["id"] for a in leo_view["assigned_to_me"])

    # Anonymous response to a personal request is rejected honestly.
    anon = client.post(
        "/api/interviews",
        json={
            "mode": "text",
            "purpose": "process",
            "visibility": "anonymous",
            "assignment_id": assignment["id"],
        },
        headers=auth("avery"),
    )
    assert anon.status_code == 422
    assert "not actually be anonymous" in anon.text

    # Named response completes the assignment on publish.
    session = client.post(
        "/api/interviews",
        json={
            "mode": "text",
            "purpose": "process",
            "visibility": "named",
            "assignment_id": assignment["id"],
        },
        headers=auth("avery"),
    ).json()
    assert session["title"] == assignment["title"]  # inherited
    sid = session["id"]
    client.post(f"/api/interviews/{sid}/start", headers=auth("avery"))
    client.post(
        f"/api/interviews/{sid}/turns",
        json={"text": "First we pull the audit checklist, then quality walks the supplier floor."},
        headers=auth("avery"),
    )
    client.post(f"/api/interviews/{sid}/complete", headers=auth("avery"))
    client.post(f"/api/interviews/{sid}/publish", headers=auth("avery"))

    created = client.get("/api/interview-assignments", headers=auth("morgan")).json()["created_by_me"]
    row = next(a for a in created if a["id"] == assignment["id"])
    assert row["status"] == "completed"

    # The creator still cannot open the session itself.
    assert client.get(f"/api/interviews/{sid}", headers=auth("morgan")).status_code == 404


def test_decline_is_always_available(client, auth):
    priya_id = _user_id(client, auth, "priya")
    assignment = _create_individual(client, auth, priya_id).json()
    declined = client.post(
        f"/api/interview-assignments/{assignment['id']}/decline",
        json={"reason": "This overlaps with the retro I already wrote up."},
        headers=auth("priya"),
    )
    assert declined.status_code == 200
    assert declined.json()["status"] == "declined"
    created = client.get("/api/interview-assignments", headers=auth("morgan")).json()["created_by_me"]
    row = next(a for a in created if a["id"] == assignment["id"])
    assert row["status"] == "declined"
    assert "retro" in row["decline_reason"]
    # No longer offered to the employee.
    mine = client.get("/api/interview-assignments", headers=auth("priya")).json()["assigned_to_me"]
    assert all(a["id"] != assignment["id"] for a in mine)


def test_department_assignment_is_aggregate_only(client, auth):
    departments = client.get("/api/departments", headers=auth("morgan")).json()["items"]
    manufacturing = next(d for d in departments if d["name"] == "Manufacturing")
    assignment = client.post(
        "/api/interview-assignments",
        json={
            "purpose": "open",
            "title": "How is the integration crunch actually feeling?",
            "note": "Anonymous is fine — I want the honest picture, not names.",
            "department_id": manufacturing["id"],
        },
        headers=auth("morgan"),
    ).json()

    # Leo (Manufacturing) sees it; anonymous is allowed for department scope.
    mine = client.get("/api/interview-assignments", headers=auth("leo")).json()["assigned_to_me"]
    assert any(a["id"] == assignment["id"] for a in mine)
    session = client.post(
        "/api/interviews",
        json={
            "mode": "text",
            "purpose": "open",
            "visibility": "anonymous",
            "assignment_id": assignment["id"],
        },
        headers=auth("leo"),
    ).json()
    receipt = session["receipt_token"]
    sid = session["id"]
    client.post(f"/api/interviews/{sid}/start", params={"receipt": receipt}, headers=auth("leo"))
    client.post(
        f"/api/interviews/{sid}/turns",
        params={"receipt": receipt},
        json={"text": "Honestly the weekend overtime is wearing people down across the line."},
        headers=auth("leo"),
    )
    client.post(f"/api/interviews/{sid}/complete", params={"receipt": receipt}, headers=auth("leo"))
    client.post(f"/api/interviews/{sid}/publish", params={"receipt": receipt}, headers=auth("leo"))

    created = client.get("/api/interview-assignments", headers=auth("morgan")).json()["created_by_me"]
    row = next(a for a in created if a["id"] == assignment["id"])
    assert row["status"] == "open"  # department requests stay open
    assert row["response_count"] == 1
    # Aggregate only: no names, no assignee, no session reference anywhere.
    blob = json.dumps(row)
    assert "Leo" not in blob and sid not in blob

    # A department assignment cannot be declined for the whole team.
    denied = client.post(
        f"/api/interview-assignments/{assignment['id']}/decline",
        json={},
        headers=auth("leo"),
    )
    assert denied.status_code == 409


def test_open_conversation_feels_natural_and_stays_protected(client, auth):
    session = client.post(
        "/api/interviews",
        json={"mode": "text", "purpose": "open", "visibility": "anonymous"},
        headers=auth("priya"),
    ).json()
    sid, receipt = session["id"], session["receipt_token"]
    start = client.post(
        f"/api/interviews/{sid}/start", params={"receipt": receipt}, headers=auth("priya")
    ).json()
    opening = next(t for t in start["turns"] if t["role"] == "interviewer")
    assert "your space" in opening["text"].lower()

    first = client.post(
        f"/api/interviews/{sid}/turns",
        params={"receipt": receipt},
        json={"text": "Honestly I'm exhausted — the schedule assumes weekends and it's wearing me down."},
        headers=auth("priya"),
    ).json()["interviewer"]
    # Reflective, not clinical: empathetic ack, and never the "concrete example" push.
    assert first["message"] in (
        "That sounds genuinely hard.",
        "Thanks for being straight about that.",
        "That would wear anyone down.",
    )
    second = client.post(
        f"/api/interviews/{sid}/turns",
        params={"receipt": receipt},
        json={"text": "It started when the chamber slot slipped and every plan since assumes overtime."},
        headers=auth("priya"),
    ).json()["interviewer"]
    assert second["question"] != first["question"]  # no repeats

    client.post(f"/api/interviews/{sid}/complete", params={"receipt": receipt}, headers=auth("priya"))
    published = client.post(
        f"/api/interviews/{sid}/publish", params={"receipt": receipt}, headers=auth("priya")
    ).json()
    # Anonymous open conversations publish only into the protected pipeline.
    assert published["destinations"]
    assert all(d["target_type"] == "feedback" for d in published["destinations"])
