"""Audit trail helper. Important operations call record() with structured
metadata. Anonymous feedback is audited with actor_user_id=None so the trail
proves an event happened without linking it to a person."""
from __future__ import annotations

from sqlalchemy.orm import Session

from ..models import AuditEvent


def record(
    db: Session,
    org_id: str,
    action: str,
    *,
    actor_user_id: str | None = None,
    actor_type: str = "user",
    target_type: str = "",
    target_id: str = "",
    meta: dict | None = None,
    commit: bool = False,
) -> AuditEvent:
    event = AuditEvent(
        org_id=org_id,
        actor_user_id=actor_user_id,
        actor_type=actor_type,
        action=action,
        target_type=target_type,
        target_id=target_id,
        meta=meta or {},
    )
    db.add(event)
    if commit:
        db.commit()
    return event
