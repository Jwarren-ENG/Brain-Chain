"""Workflow 6: permission enforcement. The restricted legal document and the
confidential supply-chain assessment must never leak to unauthorized users —
not in retrieval, answers, citations, search, listings, or by direct fetch."""
import json

RESTRICTED_MARKER = "Negotiation Strategy"
CONFIDENTIAL_MARKER = "VoltCore Dependency"
QUESTION = "What are the main risks affecting the Phoenix project this quarter?"


def _ask(client, headers, query=QUESTION):
    resp = client.post("/api/ask", json={"query": query}, headers=headers)
    assert resp.status_code == 200
    return resp.json()


def test_employee_answer_excludes_unauthorized_sources(client, auth):
    payload = _ask(client, auth("avery"))
    blob = json.dumps(payload)
    assert RESTRICTED_MARKER not in blob
    assert CONFIDENTIAL_MARKER not in blob
    assert len(payload["message"]["citations"]) > 0  # still a useful answer


def test_manager_sees_confidential_but_not_restricted(client, auth):
    payload = _ask(client, auth("morgan"))
    blob = json.dumps(payload)
    assert CONFIDENTIAL_MARKER in blob  # manager is authorized for the assessment
    assert RESTRICTED_MARKER not in blob


def test_same_question_different_evidence(client, auth):
    avery_titles = {c["title"] for c in _ask(client, auth("avery"))["message"]["citations"]}
    morgan_titles = {c["title"] for c in _ask(client, auth("morgan"))["message"]["citations"]}
    assert avery_titles != morgan_titles


def test_executive_title_does_not_bypass_clearance(client, auth):
    """Jordan (COO, clearance 2) must not see the level-3 restricted document."""
    payload = _ask(client, auth("jordan"), "Falcon Shield option year negotiation strategy")
    assert RESTRICTED_MARKER not in json.dumps(payload["message"]["citations"])


def test_security_admin_with_clearance_can_find_restricted(client, auth):
    resp = client.get(
        "/api/search", params={"q": "option-year negotiation strategy"}, headers=auth("riley")
    )
    titles = [r["document"]["title"] for r in resp.json()["results"]]
    assert any(RESTRICTED_MARKER in t for t in titles)


def test_search_never_returns_restricted_to_employee(client, auth):
    resp = client.get(
        "/api/search", params={"q": "negotiation strategy ceiling walk-away"}, headers=auth("avery")
    )
    assert RESTRICTED_MARKER not in json.dumps(resp.json())


def test_document_listing_is_filtered(client, auth):
    resp = client.get("/api/documents", params={"limit": 100}, headers=auth("avery"))
    titles = [d["title"] for d in resp.json()["items"]]
    assert not any(RESTRICTED_MARKER in t for t in titles)
    assert not any(CONFIDENTIAL_MARKER in t for t in titles)


def test_direct_fetch_unauthorized_returns_404(client, auth):
    # Find the restricted doc id as riley, then try to fetch it as avery.
    resp = client.get(
        "/api/search", params={"q": "option-year negotiation strategy"}, headers=auth("riley")
    )
    doc_id = next(
        r["document"]["id"]
        for r in resp.json()["results"]
        if RESTRICTED_MARKER in r["document"]["title"]
    )
    denied = client.get(f"/api/documents/{doc_id}", headers=auth("avery"))
    assert denied.status_code == 404  # indistinguishable from nonexistent
    allowed = client.get(f"/api/documents/{doc_id}", headers=auth("riley"))
    assert allowed.status_code == 200
    assert allowed.json()["access_reasons"]


def test_search_results_explain_access(client, auth):
    resp = client.get("/api/search", params={"q": "Phoenix risk register"}, headers=auth("avery"))
    results = resp.json()["results"]
    assert results
    assert all(r["access_reasons"] for r in results)


def test_conflicting_sources_are_surfaced(client, auth):
    payload = _ask(client, auth("morgan"), "When is the Phoenix flight readiness review?")
    conflict = [s for s in payload["message"]["segments"] if s["type"] == "conflict"]
    assert conflict, "conflicting FRR dates should be surfaced, not silently resolved"
    assert "September 12" in conflict[0]["text"] and "October 2" in conflict[0]["text"]
