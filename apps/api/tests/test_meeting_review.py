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
