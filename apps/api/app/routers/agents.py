from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Agent, AgentRun, ApprovalRequest, Task, User, utcnow
from ..security import audit
from ..security.auth import get_current_user, require_roles
from ..serializers import agent_run_dict, approval_dict, task_dict
from ..services.agents_engine import resume_after_decision, start_run

router = APIRouter(tags=["agents"])


@router.get("/agents")
def list_agents(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    agents = db.query(Agent).filter(Agent.org_id == user.org_id, Agent.enabled.is_(True)).all()
    return {
        "items": [
            {
                "id": a.id, "key": a.key, "name": a.name, "description": a.description,
                "category": a.category, "tool_allowlist": a.tool_allowlist,
                "approval_required_actions": a.approval_required_actions,
            }
            for a in agents
        ]
    }


class RunRequest(BaseModel):
    goal: str = Field(min_length=5, max_length=2000)
    mode: str = Field(default="dry_run", pattern="^(dry_run|live)$")


@router.post("/agents/{agent_id}/runs", status_code=status.HTTP_201_CREATED)
def create_run(
    agent_id: str, body: RunRequest,
    user: User = Depends(get_current_user), db: Session = Depends(get_db),
):
    agent = db.get(Agent, agent_id)
    if not agent or agent.org_id != user.org_id or not agent.enabled:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Agent not found")
    run = start_run(db, agent, user, body.goal, mode=body.mode)
    return agent_run_dict(db, run, include_steps=True)


@router.get("/agent-runs")
def list_runs(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    runs = (
        db.query(AgentRun)
        .filter(AgentRun.org_id == user.org_id)
        .order_by(AgentRun.created_at.desc())
        .limit(50)
        .all()
    )
    return {"items": [agent_run_dict(db, r) for r in runs]}


@router.get("/agent-runs/{run_id}")
def get_run(run_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    run = db.get(AgentRun, run_id)
    if not run or run.org_id != user.org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Run not found")
    return agent_run_dict(db, run, include_steps=True)


# ------------------------------------------------------------------ approvals


@router.get("/approvals")
def list_approvals(
    status_filter: str | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(ApprovalRequest).filter(ApprovalRequest.org_id == user.org_id)
    if status_filter:
        query = query.filter(ApprovalRequest.status == status_filter)
    approvals = query.order_by(ApprovalRequest.created_at.desc()).limit(100).all()
    return {"items": [approval_dict(db, a) for a in approvals],
            "can_decide": bool({"agent_approver", "security_admin"} & user.role_names())}


class DecisionRequest(BaseModel):
    decision: str = Field(pattern="^(approved|rejected)$")
    reason: str = Field(default="", max_length=2000)


@router.post("/approvals/{approval_id}/decide")
def decide_approval(
    approval_id: str, body: DecisionRequest,
    user: User = Depends(require_roles("agent_approver", "security_admin")),
    db: Session = Depends(get_db),
):
    approval = db.get(ApprovalRequest, approval_id)
    if not approval or approval.org_id != user.org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Approval not found")
    if approval.status != "pending":
        raise HTTPException(status.HTTP_409_CONFLICT, f"Already {approval.status}")
    if approval.requested_by_user_id == user.id:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Separation of duties: you cannot approve an action you requested",
        )
    approval.status = body.decision
    approval.approver_user_id = user.id
    approval.decided_at = utcnow()
    approval.decision_reason = body.reason
    audit.record(
        db, user.org_id, f"approval.{body.decision}", actor_user_id=user.id,
        target_type="approval_request", target_id=approval.id,
        meta={"action_type": approval.action_type, "reason": body.reason[:200]},
    )
    db.commit()
    if approval.agent_run_id:
        run = db.get(AgentRun, approval.agent_run_id)
        if run:
            resume_after_decision(db, run)
    return approval_dict(db, approval)


# ---------------------------------------------------------------------- tasks


@router.get("/tasks")
def list_tasks(
    mine: bool = False,
    project: str | None = None,
    status_filter: str | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(Task).filter(Task.org_id == user.org_id)
    if mine:
        query = query.filter(Task.assignee_user_id == user.id)
    if project:
        query = query.filter(Task.project.ilike(f"%{project}%"))
    if status_filter:
        query = query.filter(Task.status == status_filter)
    tasks = query.order_by(Task.due_date.asc().nullslast()).limit(200).all()
    return {"items": [task_dict(t) for t in tasks]}


class TaskUpdateRequest(BaseModel):
    status: str | None = Field(default=None, pattern="^(open|in_progress|done|blocked)$")


@router.patch("/tasks/{task_id}")
def update_task(
    task_id: str, body: TaskUpdateRequest,
    user: User = Depends(get_current_user), db: Session = Depends(get_db),
):
    task = db.get(Task, task_id)
    if not task or task.org_id != user.org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Task not found")
    if body.status:
        task.status = body.status
        audit.record(db, user.org_id, "task.status_changed", actor_user_id=user.id,
                     target_type="task", target_id=task.id, meta={"status": body.status})
    db.commit()
    return task_dict(task)
