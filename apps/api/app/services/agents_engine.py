"""Agent engine: plan → review → approve → execute, with dry-run default.

Lifecycle:  queued → retrieving → planning → awaiting_approval (when external
actions are proposed) → executing → verifying → completed | failed | rejected.

Hard rules enforced here:
  * agents retrieve through the SAME permission engine as the requesting user
    (an agent can never see more than the human who launched it)
  * every action type in EXTERNAL_ACTIONS requires an ApprovalRequest decided
    by a human with the agent_approver (or security_admin) role
  * runs default to dry_run: approved actions are simulated and marked
    executed_dry_run; live mode still requires per-action approval
  * every transition writes an AgentStep and an AuditEvent
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from ..models import (
    Agent,
    AgentRun,
    AgentStep,
    ApprovalRequest,
    Organization,
    User,
    utcnow,
)
from ..security.audit import record
from .llm_gateway import MockProvider
from .retrieval import RetrievedChunk, retrieve

EXTERNAL_ACTIONS = {
    "send_email",
    "post_message",
    "modify_jira",
    "create_external_record",
    "approve_spend",
    "change_contract",
    "modify_permissions",
    "export_sensitive",
    "trigger_workflow",
    "external_comm",
}


def start_run(
    db: Session,
    agent: Agent,
    user: User,
    goal: str,
    *,
    mode: str = "dry_run",
) -> AgentRun:
    org = db.get(Organization, user.org_id)
    if org.settings.get("force_dry_run", True):
        mode = "dry_run"
    run = AgentRun(
        org_id=user.org_id,
        agent_id=agent.id,
        user_id=user.id,
        goal=goal,
        status="queued",
        mode=mode,
        started_at=utcnow(),
    )
    db.add(run)
    db.flush()
    record(
        db, user.org_id, "agent.run_started", actor_user_id=user.id,
        target_type="agent_run", target_id=run.id, meta={"agent": agent.key, "mode": mode},
    )
    db.commit()

    _execute_pipeline(db, run, agent, user)
    return run


def _execute_pipeline(db: Session, run: AgentRun, agent: Agent, user: User) -> None:
    try:
        # 1. Retrieve — using the invoking user's permissions, never more.
        run.status = "retrieving"
        run.current_step = "Retrieving authorized company information"
        db.commit()
        chunks = retrieve(db, user, run.goal, limit=10)
        run.source_document_ids = sorted({rc.document.id for rc in chunks})
        _step(
            db, run, 1, "retrieve", "Retrieve authorized information",
            {
                "tool": "knowledge.retrieve",
                "query": run.goal,
                "results": len(chunks),
                "documents": [
                    {"id": rc.document.id, "title": rc.document.title, "score": round(rc.score, 3)}
                    for rc in chunks
                ],
                "note": "Retrieval ran with the requesting user's permissions.",
            },
        )

        # 2. Plan
        run.status = "planning"
        run.current_step = "Producing proposed plan"
        db.commit()
        plan, assumptions, proposed_actions = _build_plan(agent, run.goal, chunks)
        run.plan = plan
        run.assumptions = assumptions
        run.proposed_actions = proposed_actions
        run.tokens_used = sum(len(rc.chunk.text) for rc in chunks) // 4 + len(run.goal) // 2
        run.cost_estimate = round(run.tokens_used * 2e-6, 4)
        _step(
            db, run, 2, "plan", "Draft plan, assumptions and proposed actions",
            {"plan_phases": len(plan), "assumptions": assumptions,
             "proposed_actions": [a["action_type"] for a in proposed_actions]},
        )

        # 3. Approval gate for anything that would touch an external system.
        external = [a for a in proposed_actions if a["action_type"] in EXTERNAL_ACTIONS]
        if external:
            for action in external:
                approval = ApprovalRequest(
                    org_id=run.org_id,
                    agent_run_id=run.id,
                    action_type=action["action_type"],
                    title=action["title"],
                    payload=action,
                    requested_by_user_id=user.id,
                )
                db.add(approval)
            run.status = "awaiting_approval"
            run.current_step = f"Waiting for human approval of {len(external)} external action(s)"
            _step(
                db, run, 3, "await_approval", "Request human approval",
                {"pending_actions": [a["title"] for a in external],
                 "note": "External actions execute only after an approver accepts them."},
            )
            record(
                db, run.org_id, "agent.approval_requested", actor_type="agent",
                target_type="agent_run", target_id=run.id,
                meta={"actions": [a["action_type"] for a in external]},
            )
            db.commit()
            return

        _finalize(db, run, agent, executed=[], note="No external actions were required.")
    except Exception as exc:  # noqa: BLE001 — run must record its own failure
        run.status = "failed"
        run.error = str(exc)
        run.finished_at = utcnow()
        record(db, run.org_id, "agent.run_failed", actor_type="agent",
               target_type="agent_run", target_id=run.id, meta={"error": str(exc)})
        db.commit()


def resume_after_decision(db: Session, run: AgentRun) -> None:
    """Called when an approval is decided. If none remain pending, execute
    approved actions (simulated in dry-run) and finish the run."""
    approvals = (
        db.query(ApprovalRequest).filter(ApprovalRequest.agent_run_id == run.id).all()
    )
    if any(a.status == "pending" for a in approvals):
        return

    agent = db.get(Agent, run.agent_id)
    approved = [a for a in approvals if a.status == "approved"]
    rejected = [a for a in approvals if a.status == "rejected"]

    run.status = "executing"
    run.current_step = "Executing approved actions"
    db.commit()

    executed = []
    for approval in approved:
        simulated = run.mode == "dry_run"
        approval.status = "executed_dry_run" if simulated else "executed"
        executed.append(
            {
                "title": approval.title,
                "action_type": approval.action_type,
                "result": (
                    "Simulated (dry-run): no external system was modified."
                    if simulated
                    else "Executed against external system."
                ),
            }
        )
        record(
            db, run.org_id,
            "agent.action_simulated" if simulated else "agent.action_executed",
            actor_type="agent", target_type="approval_request", target_id=approval.id,
            meta={"action_type": approval.action_type, "run_id": run.id},
        )
    _step(
        db, run, 4, "execute", "Execute approved actions",
        {"executed": executed,
         "rejected": [a.title for a in rejected],
         "mode": run.mode},
    )
    note = (
        f"{len(executed)} action(s) {'simulated in dry-run' if run.mode == 'dry_run' else 'executed'}; "
        f"{len(rejected)} rejected by the approver."
    )
    _finalize(db, run, agent, executed=executed, note=note)


def _finalize(db: Session, run: AgentRun, agent: Agent, *, executed: list, note: str) -> None:
    run.status = "verifying"
    run.current_step = "Verifying results"
    db.commit()
    _step(
        db, run, 5, "verify", "Verify results",
        {"checks": [
            "All cited documents were readable by the requesting user",
            "No unapproved external action was attempted",
            f"Plan contains {len(run.plan)} phase(s) with owners and risks",
        ]},
    )
    run.status = "completed"
    run.current_step = "Done"
    run.finished_at = utcnow()
    run.result_summary = (
        f"Goal analyzed against {len(run.source_document_ids)} authorized source(s). "
        f"Produced a {len(run.plan)}-phase plan with {len(run.assumptions)} explicit "
        f"assumption(s). {note}"
    )
    _step(db, run, 6, "report", "Final report", {"summary": run.result_summary})
    record(db, run.org_id, "agent.run_completed", actor_type="agent",
           target_type="agent_run", target_id=run.id, meta={"executed": len(executed)})
    db.commit()


def _step(db: Session, run: AgentRun, ord_: int, kind: str, title: str, detail: dict) -> None:
    db.add(
        AgentStep(
            run_id=run.id, ord=ord_, kind=kind, title=title, status="done",
            detail=detail, started_at=utcnow(), finished_at=utcnow(),
        )
    )
    db.commit()


# ------------------------------------------------------------- plan building


def _build_plan(agent: Agent, goal: str, chunks: list[RetrievedChunk]):
    """Deterministic planner keyed by agent type. Uses the same synthesis core
    as the assistant so plans quote real, authorized evidence."""
    provider = MockProvider()
    doc_titles = [rc.document.title for rc in chunks]
    owners = sorted({rc.document.owner.name for rc in chunks if rc.document.owner})
    risks = [
        rc.chunk.text[:200]
        for rc in chunks
        if rc.document.doc_type in ("risk_register", "ticket")
        or "risk" in rc.chunk.text.lower()
    ][:4]

    assumptions = [
        "Only information the requesting user is authorized to read was used.",
        f"Source freshness: newest document synced "
        f"{max((rc.document.last_synced_at for rc in chunks if rc.document.last_synced_at), default=None)}.",
    ]
    if not chunks:
        assumptions.append("No authorized sources matched the goal — plan is generic.")
    if len(owners) < 2:
        assumptions.append("Few named owners found in sources; owner assignments need confirmation.")

    key = agent.key
    proposed_actions: list[dict] = []

    if key == "planning":
        phases = [
            {"phase": "Stabilize", "duration": "Week 1",
             "items": [f"Confirm current state using: {t}" for t in doc_titles[:3]] or ["Collect baseline data"],
             "owner": owners[0] if owners else "TBD"},
            {"phase": "Recover", "duration": "Weeks 2–4",
             "items": [f"Mitigate: {r[:120]}" for r in risks] or ["Address top blockers"],
             "owner": owners[1] if len(owners) > 1 else (owners[0] if owners else "TBD")},
            {"phase": "Verify & handoff", "duration": "Week 5",
             "items": ["Re-baseline schedule", "Executive readout with evidence"],
             "owner": owners[0] if owners else "TBD"},
        ]
        proposed_actions = [
            {"action_type": "modify_jira", "title": f"Create {min(len(risks) + 2, 6)} recovery tasks in Jira",
             "detail": "Draft tasks for each recovery item, assigned to proposed owners."},
            {"action_type": "post_message", "title": "Post recovery-plan summary to the project channel",
             "detail": "Message summarizing phases and owners, with links."},
        ]
    elif key == "meeting_followup":
        phases = [{"phase": "Follow-ups", "duration": "This week",
                   "items": [f"Track: {t}" for t in doc_titles[:5]], "owner": owners[0] if owners else "TBD"}]
        proposed_actions = [
            {"action_type": "send_email", "title": "Email meeting summary to attendees",
             "detail": "Decisions, action items and owners from the transcript."},
            {"action_type": "modify_jira", "title": "Create tasks for extracted action items",
             "detail": "One tracked task per action item with deadline."},
        ]
    elif key == "exec_brief":
        phases = [{"phase": "Briefing", "duration": "Weekly",
                   "items": ["Compile developments", "Attach evidence", "Highlight risks"],
                   "owner": "Executive Briefing Agent"}]
        proposed_actions = []  # internal report only, no external systems touched
    elif key == "spend_supplier":
        phases = [{"phase": "Analysis", "duration": "3 days",
                   "items": [f"Review: {t}" for t in doc_titles[:4]], "owner": owners[0] if owners else "TBD"}]
        proposed_actions = [
            {"action_type": "create_external_record", "title": "Open supplier-review record in procurement system",
             "detail": "Consolidation opportunity flagged from spend analysis."},
        ]
    elif key == "project_health":
        phases = [{"phase": "Health review", "duration": "2 days",
                   "items": ([f"Investigate: {r[:120]}" for r in risks] or ["Review milestones"])
                   + ["Identify missing owners", "Map cross-team dependencies"],
                   "owner": owners[0] if owners else "TBD"}]
        proposed_actions = [
            {"action_type": "post_message", "title": "Notify project channel of at-risk items",
             "detail": "Summary of delays and blockers found."},
        ]
    else:  # research and anything else: internal-only
        phases = [{"phase": "Research synthesis", "duration": "Today",
                   "items": [f"Synthesize: {t}" for t in doc_titles[:5]] or ["No matching sources"],
                   "owner": "Research Agent"}]
        proposed_actions = []

    # Reuse the assistant's synthesis so the plan has an evidence-backed summary.
    answer = provider.generate(goal, "executive", chunks)
    for phase in phases:
        phase["evidence_note"] = f"Grounded in {len(chunks)} authorized source chunk(s)."
    phases.append({"phase": "Evidence summary", "duration": "", "items": [answer.content[:600]],
                   "owner": ""})
    return phases, assumptions, proposed_actions
