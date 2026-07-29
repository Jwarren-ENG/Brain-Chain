"""Contract tests: interview state machine. Written before implementation
(Phase 0). Every transition is enforced server-side; the frontend never
decides validity."""


def _create(client, auth, who="avery", **overrides):
    body = {
        "mode": "text",
        "purpose": "process",
        "visibility": "named",
        "title": "Supplier qualification process",
        **overrides,
    }
    return client.post("/api/interviews", json=body, headers=auth(who))


def test_text_session_lifecycle_happy_path(client, auth):
    resp = _create(client, auth)
    assert resp.status_code == 201, resp.text
    session = resp.json()
    assert session["status"] == "draft"

    started = client.post(f"/api/interviews/{session['id']}/start", headers=auth("avery"))
    assert started.status_code == 200
    body = started.json()
    assert body["status"] == "active"
    # Opening interviewer question exists.
    assert any(t["role"] == "interviewer" for t in body["turns"])

    answered = client.post(
        f"/api/interviews/{session['id']}/turns",
        json={"text": "First we request three quotes from qualified suppliers, then engineering reviews the samples."},
        headers=auth("avery"),
    )
    assert answered.status_code == 200
    envelope = answered.json()["interviewer"]
    assert envelope["question"]
    assert envelope["reason"]

    completed = client.post(f"/api/interviews/{session['id']}/complete", headers=auth("avery"))
    assert completed.status_code == 200
    assert completed.json()["status"] == "review_required"


def test_publish_requires_review_state(client, auth):
    session = _create(client, auth).json()
    client.post(f"/api/interviews/{session['id']}/start", headers=auth("avery"))
    # Publishing straight from active must be rejected.
    denied = client.post(f"/api/interviews/{session['id']}/publish", headers=auth("avery"))
    assert denied.status_code == 409
    # And from draft too.
    draft = _create(client, auth).json()
    assert client.post(
        f"/api/interviews/{draft['id']}/publish", headers=auth("avery")
    ).status_code == 409


def test_invalid_transitions_rejected(client, auth):
    session = _create(client, auth).json()
    # complete from draft
    assert client.post(
        f"/api/interviews/{session['id']}/complete", headers=auth("avery")
    ).status_code == 409
    # consent on a text session
    assert client.post(
        f"/api/interviews/{session['id']}/consent",
        json={"audio_retention_policy": "delete_after_transcription"},
        headers=auth("avery"),
    ).status_code == 409
    # pause a text session
    client.post(f"/api/interviews/{session['id']}/start", headers=auth("avery"))
    assert client.post(
        f"/api/interviews/{session['id']}/pause", headers=auth("avery")
    ).status_code == 409


def test_duplicate_publish_rejected(client, auth):
    session = _create(client, auth).json()
    sid = session["id"]
    client.post(f"/api/interviews/{sid}/start", headers=auth("avery"))
    client.post(
        f"/api/interviews/{sid}/turns",
        json={"text": "We qualify suppliers with a scored audit before any purchase order."},
        headers=auth("avery"),
    )
    client.post(f"/api/interviews/{sid}/complete", headers=auth("avery"))
    first = client.post(f"/api/interviews/{sid}/publish", headers=auth("avery"))
    assert first.status_code == 200
    second = client.post(f"/api/interviews/{sid}/publish", headers=auth("avery"))
    assert second.status_code == 409


def test_voice_requires_consent_before_turns(client, auth):
    session = _create(client, auth, mode="voice", purpose="expert").json()
    sid = session["id"]
    started = client.post(f"/api/interviews/{sid}/start", headers=auth("avery"))
    assert started.json()["status"] == "consent_required"
    # No turns and no transcription before consent.
    assert client.post(
        f"/api/interviews/{sid}/turns", json={"text": "hello"}, headers=auth("avery")
    ).status_code == 409
    assert client.post(
        f"/api/interviews/{sid}/voice-chunk", json={}, headers=auth("avery")
    ).status_code == 409
    consent = client.post(
        f"/api/interviews/{sid}/consent",
        json={"audio_retention_policy": "delete_after_transcription"},
        headers=auth("avery"),
    )
    assert consent.status_code == 200
    assert consent.json()["status"] == "active"
    assert consent.json()["consent_at"]


def test_voice_pause_resume_and_switch_to_text(client, auth):
    session = _create(client, auth, mode="voice", purpose="expert").json()
    sid = session["id"]
    client.post(f"/api/interviews/{sid}/start", headers=auth("avery"))
    client.post(
        f"/api/interviews/{sid}/consent",
        json={"audio_retention_policy": "delete_after_transcription"},
        headers=auth("avery"),
    )
    assert client.post(f"/api/interviews/{sid}/pause", headers=auth("avery")).json()["status"] == "paused"
    assert client.post(f"/api/interviews/{sid}/resume", headers=auth("avery")).json()["status"] == "active"
    switched = client.post(f"/api/interviews/{sid}/switch-to-text", headers=auth("avery"))
    assert switched.status_code == 200
    assert switched.json()["mode"] == "text"
    assert switched.json()["status"] == "active"  # session survives the switch


def test_transcription_failure_recovery(client, auth):
    session = _create(client, auth, mode="voice", purpose="expert").json()
    sid = session["id"]
    client.post(f"/api/interviews/{sid}/start", headers=auth("avery"))
    client.post(
        f"/api/interviews/{sid}/consent",
        json={"audio_retention_policy": "delete_after_transcription"},
        headers=auth("avery"),
    )
    # One good chunk, then a simulated provider failure.
    ok = client.post(f"/api/interviews/{sid}/voice-chunk", json={}, headers=auth("avery"))
    assert ok.status_code == 200
    turns_before = len(ok.json()["turns"])
    failed = client.post(
        f"/api/interviews/{sid}/voice-chunk",
        json={"simulate_failure": True},
        headers=auth("avery"),
    )
    assert failed.status_code == 200
    assert failed.json()["status"] == "failed"
    assert failed.json()["failure_code"]

    # Existing transcript preserved; retry recovers to active; no duplicate turns.
    recovered = client.post(f"/api/interviews/{sid}/retry", headers=auth("avery"))
    assert recovered.status_code == 200
    assert recovered.json()["status"] == "active"
    assert len(recovered.json()["turns"]) == turns_before


def test_turn_editing_before_completion_only(client, auth):
    session = _create(client, auth).json()
    sid = session["id"]
    client.post(f"/api/interviews/{sid}/start", headers=auth("avery"))
    turns = client.post(
        f"/api/interviews/{sid}/turns",
        json={"text": "The intake step is owned by procurment."},
        headers=auth("avery"),
    ).json()["turns"]
    employee_turn = next(t for t in turns if t["role"] == "employee")
    fixed = client.patch(
        f"/api/interviews/{sid}/turns/{employee_turn['id']}",
        json={"text": "The intake step is owned by procurement."},
        headers=auth("avery"),
    )
    assert fixed.status_code == 200
    assert fixed.json()["edited"] is True
    assert "procurement." in fixed.json()["text"]

    client.post(f"/api/interviews/{sid}/complete", headers=auth("avery"))
    late = client.patch(
        f"/api/interviews/{sid}/turns/{employee_turn['id']}",
        json={"text": "too late"},
        headers=auth("avery"),
    )
    assert late.status_code == 409
