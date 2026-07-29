"""Workflow 4: agents must not touch external systems without human approval,
and dry-run is the enforced default."""


def _planning_agent_id(client, auth):
    agents = client.get("/api/agents", headers=auth("morgan")).json()["items"]
    return next(a["id"] for a in agents if a["key"] == "planning")


def test_run_with_external_actions_awaits_approval(client, auth):
    run = client.post(
        f"/api/agents/{_planning_agent_id(client, auth)}/runs",
        json={"goal": "Plan a recovery for the Skylark antenna verification slip", "mode": "live"},
        headers=auth("morgan"),
    ).json()
    assert run["status"] == "awaiting_approval"
    assert run["mode"] == "dry_run"  # org policy forces dry-run even when live requested
    assert run["proposed_actions"]
    assert run["approvals"]
    assert all(a["status"] == "pending" for a in run["approvals"])
    # Nothing executed yet: no execute step exists.
    assert not any(s["kind"] == "execute" for s in run["steps"])


def test_non_approver_cannot_decide(client, auth):
    pending = client.get(
        "/api/approvals", params={"status_filter": "pending"}, headers=auth("avery")
    ).json()
    assert pending["can_decide"] is False
    if pending["items"]:
        resp = client.post(
            f"/api/approvals/{pending['items'][0]['id']}/decide",
            json={"decision": "approved"},
            headers=auth("avery"),
        )
        assert resp.status_code == 403


def test_requester_cannot_self_approve(client, auth):
    """Taylor holds the approver role; a run Taylor requests must not be
    self-approvable (separation of duties)."""
    run = client.post(
        f"/api/agents/{_planning_agent_id(client, auth)}/runs",
        json={"goal": "Draft a recovery plan for thermal chamber scheduling"},
        headers=auth("taylor"),
    ).json()
    approval_id = run["approvals"][0]["id"]
    resp = client.post(
        f"/api/approvals/{approval_id}/decide",
        json={"decision": "approved"},
        headers=auth("taylor"),
    )
    assert resp.status_code == 403


def test_approval_flow_executes_dry_run_and_audits(client, auth):
    run = client.post(
        f"/api/agents/{_planning_agent_id(client, auth)}/runs",
        json={"goal": "Recovery plan for Phoenix battery supply risk"},
        headers=auth("morgan"),
    ).json()
    assert run["status"] == "awaiting_approval"

    decisions = ["approved", "rejected"]
    for approval, decision in zip(run["approvals"], decisions, strict=True):
        resp = client.post(
            f"/api/approvals/{approval['id']}/decide",
            json={"decision": decision, "reason": f"test {decision}"},
            headers=auth("taylor"),
        )
        assert resp.status_code == 200

    final = client.get(f"/api/agent-runs/{run['id']}", headers=auth("morgan")).json()
    assert final["status"] == "completed"
    statuses = {a["status"] for a in final["approvals"]}
    assert "executed_dry_run" in statuses  # approved action simulated only
    assert "rejected" in statuses
    execute_steps = [s for s in final["steps"] if s["kind"] == "execute"]
    assert execute_steps
    executed = execute_steps[0]["detail"]["executed"]
    assert all("Simulated (dry-run)" in e["result"] for e in executed)

    # Audit trail: simulation recorded, not real execution.
    from app.db import SessionLocal
    from app.models import AuditEvent

    db = SessionLocal()
    sim = db.query(AuditEvent).filter(AuditEvent.action == "agent.action_simulated").count()
    real = db.query(AuditEvent).filter(AuditEvent.action == "agent.action_executed").count()
    db.close()
    assert sim > 0
    assert real == 0


def test_internal_only_agent_completes_without_approval(client, auth):
    agents = client.get("/api/agents", headers=auth("avery")).json()["items"]
    research_id = next(a["id"] for a in agents if a["key"] == "research")
    run = client.post(
        f"/api/agents/{research_id}/runs",
        json={"goal": "Summarize Nimbus Composites delivery performance"},
        headers=auth("avery"),
    ).json()
    assert run["status"] == "completed"
    assert run["approvals"] == []
    assert run["result_summary"]


def test_agent_retrieval_respects_requester_permissions(client, auth):
    """An agent run started by Avery must not read the confidential
    supply-chain assessment Avery cannot see."""
    agents = client.get("/api/agents", headers=auth("avery")).json()["items"]
    research_id = next(a["id"] for a in agents if a["key"] == "research")
    run = client.post(
        f"/api/agents/{research_id}/runs",
        json={"goal": "What are the VoltCore dependency risks for Phoenix?"},
        headers=auth("avery"),
    ).json()
    retrieve_step = next(s for s in run["steps"] if s["kind"] == "retrieve")
    titles = [d["title"] for d in retrieve_step["detail"]["documents"]]
    assert not any("VoltCore Dependency" in t for t in titles)
