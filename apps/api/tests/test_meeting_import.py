"""Transcript import: roles, parsing errors, ACLs, audit, meeting creation."""
import io

from app.routers.meetings import MAX_TRANSCRIPT_CHARS

VTT = (
    "WEBVTT\n\n1\n00:00:01.000 --> 00:00:04.000\n"
    "Maria Santos: We decided to switch the bracket to 7075 aluminum.\n\n"
    "2\n00:00:04.500 --> 00:00:08.000\n"
    "David Kim: Load analysis showed insufficient margin with 6061.\n"
)


def _import(client, headers, *, classification_id, filename="review.vtt", body=VTT, **fields):
    data = {"title": "Bracket design review", "classification_id": classification_id,
            "project": "Phoenix", **fields}
    return client.post(
        "/api/meetings/import",
        data=data,
        files={"file": (filename, io.BytesIO(body.encode()), "text/vtt")},
        headers=headers,
    )


def _classification_at_level(client, headers, level):
    # /api/governance/classifications is open to any authenticated user and
    # returns {"items": [{"id", "name", "level", "description", "color"}]}.
    resp = client.get("/api/governance/classifications", headers=headers)
    assert resp.status_code == 200, resp.text
    return next(c["id"] for c in resp.json()["items"] if c["level"] == level)


def _internal_classification(client, headers):
    return _classification_at_level(client, headers, 1)


def test_employee_cannot_import(client, auth):
    resp = _import(client, auth("avery"), classification_id="anything")
    assert resp.status_code == 403


def test_manager_import_creates_meeting_document_and_acl(client, auth):
    headers = auth("morgan")
    cid = _internal_classification(client, headers)
    resp = _import(client, headers, classification_id=cid)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["turn_count"] == 2
    assert body["meeting"]["attendees"] == ["David Kim", "Maria Santos"]
    # the transcript document is readable by the importer
    doc = client.get(f"/api/documents/{body['document_id']}", headers=headers)
    assert doc.status_code == 200
    assert "7075 aluminum" in str(doc.json())
    # turns are stored for provenance
    assert body["meeting"]["extraction"]["turns"][0]["speaker"] == "Maria Santos"


def test_unparseable_file_is_422_and_persists_nothing(client, auth):
    headers = auth("morgan")
    cid = _internal_classification(client, headers)
    before = client.get("/api/meetings", headers=headers).json()["items"]
    resp = _import(client, headers, classification_id=cid,
                   filename="junk.txt", body="no labels here\nat all\n")
    assert resp.status_code == 422
    after = client.get("/api/meetings", headers=headers).json()["items"]
    assert len(after) == len(before)


def test_unknown_classification_is_404(client, auth):
    headers = auth("morgan")
    resp = _import(client, headers, classification_id="nope")
    assert resp.status_code == 404


def test_importer_cannot_exceed_own_clearance(client, auth):
    headers = auth("morgan")
    # Morgan (manager, clearance 2) must not be able to import material at a
    # classification above her own clearance (level 3, restricted), even
    # though her role otherwise permits importing.
    restricted_id = _classification_at_level(client, headers, 3)
    resp = _import(client, headers, classification_id=restricted_id)
    assert resp.status_code == 403


def test_oversized_multibyte_transcript_is_422_and_persists_nothing(client, auth):
    headers = auth("morgan")
    cid = _internal_classification(client, headers)
    before = client.get("/api/meetings", headers=headers).json()["items"]

    # "本" is 3 bytes in UTF-8. A read cap of MAX_TRANSCRIPT_CHARS+1 *bytes*
    # (the old, buggy behavior) can land exactly on a character boundary for
    # some prefix lengths, in which case decoding the truncated bytes
    # succeeds cleanly instead of raising UnicodeDecodeError — and the
    # resulting (truncated) character count is far below the cap, so the
    # size check never fires either. That's the real bug: a file that is
    # genuinely oversized gets silently accepted (200) with content chopped
    # mid-transcript. Construct the prefix so the legacy byte-only cap lands
    # on exactly such a boundary, to prove the fix (reading a worst-case
    # 4-bytes/char budget before deciding on size) actually rejects it,
    # rather than merely happening to 422 for the wrong reason.
    cjk = "本"
    cjk_bytes = len(cjk.encode())
    old_cap_bytes = MAX_TRANSCRIPT_CHARS + 1
    prefix = "A: "
    pad = (old_cap_bytes - len(prefix)) % cjk_bytes
    prefix += "x" * pad
    assert (old_cap_bytes - len(prefix)) % cjk_bytes == 0

    overflow_chars = MAX_TRANSCRIPT_CHARS + 5000  # genuinely exceeds the char cap
    huge = prefix + cjk * overflow_chars
    resp = _import(client, headers, classification_id=cid,
                   filename="huge.txt", body=huge)
    assert resp.status_code == 422, resp.text
    after = client.get("/api/meetings", headers=headers).json()["items"]
    assert len(after) == len(before)


def test_unknown_department_id_is_404_and_persists_nothing(client, auth):
    headers = auth("morgan")
    cid = _internal_classification(client, headers)
    before = client.get("/api/meetings", headers=headers).json()["items"]
    resp = _import(client, headers, classification_id=cid, department_id="not-a-real-department")
    assert resp.status_code == 404
    after = client.get("/api/meetings", headers=headers).json()["items"]
    assert len(after) == len(before)


def test_import_runs_extraction_and_reports_counts(client, auth):
    headers = auth("morgan")
    cid = _internal_classification(client, headers)
    resp = _import(client, headers, classification_id=cid)
    body = resp.json()
    assert body["extraction_status"] == "completed"
    assert body["counts"]["decisions"] >= 1  # "We decided to switch..." in VTT


def test_extraction_retry_endpoint_reruns_only_when_no_artifacts(client, auth):
    headers = auth("morgan")
    cid = _internal_classification(client, headers)
    mid = _import(client, headers, classification_id=cid).json()["meeting"]["id"]
    # Artifacts already exist → retry refuses rather than duplicating them.
    resp = client.post(f"/api/meetings/{mid}/extract", headers=headers)
    assert resp.status_code == 409


def test_import_records_audit_event(client, auth):
    headers = auth("morgan")
    cid = _internal_classification(client, headers)
    resp = _import(client, headers, classification_id=cid, filename="audit.vtt")
    assert resp.status_code == 200, resp.text
    meeting_id = resp.json()["meeting"]["id"]
    # riley (security_admin) can search the audit trail for the import event.
    events = client.get(
        "/api/audit", params={"action": "meeting.imported"}, headers=auth("riley")
    )
    assert events.status_code == 200, events.text
    targets = [e["target_id"] for e in events.json()["items"]]
    assert meeting_id in targets
