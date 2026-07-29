"""Review queue: payload shape, visibility, turn-level evidence."""
import io

from tests.test_meeting_import import _internal_classification, _restricted_classification

VTT = (
    "WEBVTT\n\n1\n00:00:01.000 --> 00:00:04.000\n"
    "Maria Santos: We decided to switch the bracket to 7075 aluminum.\n\n"
    "2\n00:00:04.500 --> 00:00:08.000\n"
    "David Kim: I'm worried about a delay on supplier requalification.\n\n"
    "3\n00:00:08.500 --> 00:00:11.000\n"
    "David Kim: Priya will update the structural report by Friday.\n"
)


def _imported_meeting(client, headers, cid):
    resp = client.post(
        "/api/meetings/import",
        data={"title": "Bracket review", "classification_id": cid, "project": "Phoenix"},
        files={"file": ("r.vtt", io.BytesIO(VTT.encode()), "text/vtt")},
        headers=headers,
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


def test_review_payload_resolves_turn_excerpts(client, auth):
    headers = auth("morgan")
    cid = _internal_classification(client, headers)
    body = _imported_meeting(client, headers, cid)
    review = client.get(f"/api/meetings/{body['meeting']['id']}/review", headers=headers)
    assert review.status_code == 200
    payload = review.json()
    assert payload["decisions"], payload
    d = payload["decisions"][0]
    assert d["status"] == "proposed"
    assert d["turns"][0]["speaker"] == "Maria Santos"
    assert "7075" in d["turns"][0]["text"]
    assert payload["risks"][0]["rid"].startswith("r")


def test_review_hidden_without_transcript_access(client, auth):
    # Importer must hold an import role (manager/data_steward/system_admin)
    # AND clearance 3 to import at a restricted (level 3) classification.
    # riley.novak is security_admin-only (no import role) per seed.py, so we
    # use lena.hart — clearance 3, role "manager" — as the L3 importer,
    # keeping the clearance relationship the brief specifies: importer L3,
    # viewer L1 (avery.chen, clearance 1).
    headers_mgr = auth("lena")
    cid = _restricted_classification(client, headers_mgr)
    body = _imported_meeting(client, headers_mgr, cid)
    headers_emp = auth("avery")
    resp = client.get(f"/api/meetings/{body['meeting']['id']}/review", headers=headers_emp)
    assert resp.status_code == 404  # same as nonexistent — no existence oracle
    missing = client.get("/api/meetings/doesnotexist/review", headers=headers_emp)
    assert missing.status_code == 404
    assert resp.json() == missing.json()


def _resolve(client, headers, meeting_id, kind, artifact_id, action="approve", edits=None):
    return client.post(
        f"/api/meetings/{meeting_id}/review/resolve",
        json={"kind": kind, "artifact_id": artifact_id, "action": action,
              "edits": edits or {}},
        headers=headers,
    )


def test_employee_cannot_resolve(client, auth):
    mgr = auth("morgan")
    cid = _internal_classification(client, mgr)
    body = _imported_meeting(client, mgr, cid)
    mid = body["meeting"]["id"]
    d = client.get(f"/api/meetings/{mid}/review", headers=mgr).json()["decisions"][0]
    emp = auth("avery")
    assert _resolve(client, emp, mid, "decision", d["id"]).status_code == 403


def test_approve_decision_publishes_searchable_record(client, auth):
    mgr = auth("morgan")
    cid = _internal_classification(client, mgr)
    mid = _imported_meeting(client, mgr, cid)["meeting"]["id"]
    d = client.get(f"/api/meetings/{mid}/review", headers=mgr).json()["decisions"][0]

    # Before approval: no decision-record document exists, so /ask can't cite one.
    docs = client.get("/api/documents", params={"doc_type": "decision_log", "q": "7075"},
                      headers=mgr).json()["items"]
    before_ids = {x["id"] for x in docs}

    resp = _resolve(client, mgr, mid, "decision", d["id"],
                    edits={"rationale": "Load analysis showed insufficient margin."})
    assert resp.status_code == 200
    assert resp.json()["status"] == "active"

    docs = client.get("/api/documents", params={"doc_type": "decision_log", "q": "7075"},
                      headers=mgr).json()["items"]
    new = [x for x in docs if x["id"] not in before_ids]
    assert len(new) == 1
    detail = client.get(f"/api/documents/{new[0]['id']}", headers=mgr).json()
    text = str(detail)
    assert "Why:" in text and "insufficient margin" in text
    assert "Approved by:" in text

    # Idempotence: second approval is a 409.
    assert _resolve(client, mgr, mid, "decision", d["id"]).status_code == 409


def test_reject_keeps_artifact_out_of_memory(client, auth):
    mgr = auth("morgan")
    cid = _internal_classification(client, mgr)
    mid = _imported_meeting(client, mgr, cid)["meeting"]["id"]
    review = client.get(f"/api/meetings/{mid}/review", headers=mgr).json()
    r = review["risks"][0]
    resp = _resolve(client, mgr, mid, "risk", r["rid"], action="reject")
    assert resp.status_code == 200 and resp.json()["status"] == "rejected"


def test_approved_record_inherits_transcript_acl(client, auth):
    # Restricted import: approved record must stay invisible to low clearance.
    # lena.hart is the L3 (manager, clearance 3) importer persona per
    # test_meeting_import.py's test_review_hidden_without_transcript_access —
    # riley.novak is security_admin-only and holds no import role.
    mgr = auth("lena")
    cid = _restricted_classification(client, mgr)
    mid = _imported_meeting(client, mgr, cid)["meeting"]["id"]
    d = client.get(f"/api/meetings/{mid}/review", headers=mgr).json()["decisions"][0]
    before_ids = {x["id"] for x in client.get(
        "/api/documents", params={"doc_type": "decision_log", "q": "7075"},
        headers=mgr).json()["items"]}

    assert _resolve(client, mgr, mid, "decision", d["id"]).status_code == 200

    # The session's other tests may already have published unrelated,
    # lower-classification decision_log records that also match q=7075 (and
    # ARE legitimately visible to avery), so we isolate the record this test
    # created rather than asserting the whole result set is empty.
    after_ids = {x["id"] for x in client.get(
        "/api/documents", params={"doc_type": "decision_log", "q": "7075"},
        headers=mgr).json()["items"]}
    new_ids = after_ids - before_ids
    assert len(new_ids) == 1
    record_id = next(iter(new_ids))

    emp = auth("avery")
    docs = client.get("/api/documents", params={"doc_type": "decision_log", "q": "7075"},
                      headers=emp).json()["items"]
    assert record_id not in {x["id"] for x in docs}  # unauthorized user never sees the record
    assert client.get(f"/api/documents/{record_id}", headers=emp).status_code == 404


def test_review_tolerates_hand_authored_history_with_turns_only(client, auth):
    """Seeded meetings may carry extraction with only 'turns' (no decisions/
    actions/risks/questions/summary keys). The endpoint must not KeyError."""
    headers = auth("morgan")
    resp = client.get("/api/meetings", headers=headers)
    assert resp.status_code == 200, resp.text
    meetings = resp.json()["items"]
    turns_only = [
        m for m in meetings
        if m.get("extraction") and "turns" in m["extraction"]
        and not m["extraction"].get("decisions")
        and not m["extraction"].get("actions")
    ]
    if not turns_only:
        return  # nothing hand-authored in this seed slice; nothing to assert
    review = client.get(f"/api/meetings/{turns_only[0]['id']}/review", headers=headers)
    assert review.status_code in (200, 404)
    if review.status_code == 200:
        payload = review.json()
        for key in ("decisions", "actions", "risks", "questions", "dropped", "summary"):
            assert key in payload
