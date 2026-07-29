"""Administration, data governance, model policies, audit search."""
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..config import get_settings
from ..db import get_db
from ..models import (
    AuditEvent,
    DataSource,
    Department,
    ModelPolicy,
    ModelProvider,
    Organization,
    RetentionPolicy,
    SecurityClassification,
    User,
)
from ..security import audit
from ..security.auth import get_current_user, require_roles
from ..serializers import iso, user_brief, user_full

router = APIRouter(tags=["admin"])


@router.get("/org")
def get_org(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    org = db.get(Organization, user.org_id)
    settings = get_settings()
    return {
        "id": org.id,
        "name": org.name,
        "deployment_profile": org.deployment_profile,
        "settings": org.settings,
        "external_models_allowed": settings.external_models_allowed
        and org.settings.get("external_models_enabled", False),
        "profiles": {
            "government": "Isolated / self-hosted. External model calls disabled at the platform level.",
            "commercial": "Managed enterprise cloud with provider controls and governance.",
            "private": "Customer VPC, private models, customer-managed keys.",
        },
    }


class OrgSettingsUpdate(BaseModel):
    deployment_profile: str | None = Field(default=None, pattern="^(government|commercial|private)$")
    min_feedback_cohort: int | None = Field(default=None, ge=2, le=100)
    external_models_enabled: bool | None = None
    force_dry_run: bool | None = None
    log_raw_prompts: bool | None = None


@router.patch("/org")
def update_org(
    body: OrgSettingsUpdate,
    user: User = Depends(require_roles("system_admin", "security_admin")),
    db: Session = Depends(get_db),
):
    org = db.get(Organization, user.org_id)
    changes = {}
    if body.deployment_profile:
        org.deployment_profile = body.deployment_profile
        changes["deployment_profile"] = body.deployment_profile
        if body.deployment_profile == "government":
            org.settings = {**org.settings, "external_models_enabled": False}
    updates = {
        k: v
        for k, v in body.model_dump(exclude_none=True).items()
        if k != "deployment_profile"
    }
    if updates:
        if org.deployment_profile == "government":
            updates["external_models_enabled"] = False
        org.settings = {**org.settings, **updates}
        changes.update(updates)
    audit.record(db, org.id, "admin.org_updated", actor_user_id=user.id, meta=changes)
    db.commit()
    return get_org(user, db)


@router.get("/users")
def list_users(
    user: User = Depends(require_roles("system_admin", "security_admin", "data_steward")),
    db: Session = Depends(get_db),
):
    users = db.query(User).filter(User.org_id == user.org_id).order_by(User.name).all()
    return {"items": [user_full(u) for u in users]}


@router.get("/departments")
def list_departments(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    departments = (
        db.query(Department).filter(Department.org_id == user.org_id).order_by(Department.name).all()
    )
    return {"items": [{"id": d.id, "name": d.name, "slug": d.slug} for d in departments]}


@router.get("/governance/classifications")
def list_classifications(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = (
        db.query(SecurityClassification)
        .filter(SecurityClassification.org_id == user.org_id)
        .order_by(SecurityClassification.level)
        .all()
    )
    return {"items": [
        {"id": c.id, "name": c.name, "level": c.level, "description": c.description, "color": c.color}
        for c in rows
    ]}


@router.get("/governance/retention")
def list_retention(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.query(RetentionPolicy).filter(RetentionPolicy.org_id == user.org_id).all()
    return {"items": [
        {"id": r.id, "name": r.name, "duration_days": r.duration_days, "description": r.description}
        for r in rows
    ]}


@router.get("/governance/sources")
def list_sources(
    user: User = Depends(require_roles("data_steward", "system_admin", "security_admin")),
    db: Session = Depends(get_db),
):
    rows = db.query(DataSource).filter(DataSource.org_id == user.org_id).all()
    return {"items": [
        {
            "id": s.id, "name": s.name, "kind": s.kind, "description": s.description,
            "owner": user_brief(s.owner),
            "department": s.department.name if s.department else None,
            "classification": s.classification.name if s.classification else None,
            "retention": s.retention_policy.name if s.retention_policy else None,
        }
        for s in rows
    ]}


# ------------------------------------------------------------- model policies


@router.get("/model-providers")
def list_providers(
    user: User = Depends(require_roles("security_admin", "system_admin")),
    db: Session = Depends(get_db),
):
    rows = db.query(ModelProvider).filter(ModelProvider.org_id == user.org_id).all()
    return {"items": [
        {
            "id": p.id, "name": p.name, "kind": p.kind, "model": p.model,
            "enabled": p.enabled, "is_external": p.is_external,
            "allows_data_retention": p.allows_data_retention,
            "allows_tool_use": p.allows_tool_use,
            "max_context_tokens": p.max_context_tokens,
            "cost_limit_usd_month": p.cost_limit_usd_month,
            "region": p.region,
        }
        for p in rows
    ]}


@router.get("/model-policies")
def list_policies(
    user: User = Depends(require_roles("security_admin", "system_admin")),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(ModelPolicy)
        .filter(ModelPolicy.org_id == user.org_id)
        .order_by(ModelPolicy.priority)
        .all()
    )
    return {"items": [
        {
            "id": p.id, "name": p.name, "priority": p.priority, "enabled": p.enabled,
            "provider": {"id": p.provider.id, "name": p.provider.name,
                         "is_external": p.provider.is_external},
            "max_classification_level": p.max_classification_level,
            "department_ids": p.department_ids,
            "role_names": p.role_names,
            "logging_policy": p.logging_policy,
        }
        for p in rows
    ]}


class PolicyUpdate(BaseModel):
    enabled: bool | None = None
    max_classification_level: int | None = Field(default=None, ge=0, le=3)
    priority: int | None = Field(default=None, ge=1, le=1000)


@router.patch("/model-policies/{policy_id}")
def update_policy(
    policy_id: str, body: PolicyUpdate,
    user: User = Depends(require_roles("security_admin")),
    db: Session = Depends(get_db),
):
    policy = db.get(ModelPolicy, policy_id)
    if not policy or policy.org_id != user.org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Policy not found")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(policy, field, value)
    audit.record(db, user.org_id, "admin.model_policy_updated", actor_user_id=user.id,
                 target_type="model_policy", target_id=policy.id,
                 meta=body.model_dump(exclude_none=True))
    db.commit()
    return {"ok": True}


# --------------------------------------------------------------------- audit


@router.get("/audit")
def search_audit(
    action: str | None = None,
    actor: str | None = None,
    target_type: str | None = None,
    limit: int = Query(default=50, le=200),
    offset: int = 0,
    user: User = Depends(require_roles("security_admin", "system_admin")),
    db: Session = Depends(get_db),
):
    query = db.query(AuditEvent).filter(AuditEvent.org_id == user.org_id)
    if action:
        query = query.filter(AuditEvent.action.ilike(f"%{action}%"))
    if target_type:
        query = query.filter(AuditEvent.target_type == target_type)
    if actor:
        matched = (
            db.query(User.id)
            .filter(User.org_id == user.org_id, User.name.ilike(f"%{actor}%"))
            .all()
        )
        query = query.filter(AuditEvent.actor_user_id.in_([m[0] for m in matched]))
    total = query.count()
    events = query.order_by(AuditEvent.created_at.desc()).offset(offset).limit(limit).all()
    actors = {
        u.id: u
        for u in db.query(User)
        .filter(User.id.in_([e.actor_user_id for e in events if e.actor_user_id]))
        .all()
    }
    return {
        "total": total,
        "items": [
            {
                "id": e.id,
                "action": e.action,
                "actor": user_brief(actors.get(e.actor_user_id)) if e.actor_user_id else None,
                "actor_type": e.actor_type,
                "target_type": e.target_type,
                "target_id": e.target_id,
                "meta": e.meta,
                "created_at": iso(e.created_at),
            }
            for e in events
        ],
    }
