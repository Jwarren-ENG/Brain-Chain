from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Connector, SyncJob, User
from ..security.auth import get_current_user, require_roles
from ..serializers import connector_dict, sync_job_dict
from ..services.connectors import run_sync

router = APIRouter(prefix="/connectors", tags=["connectors"])


@router.get("")
def list_connectors(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    connectors = db.query(Connector).filter(Connector.org_id == user.org_id).all()
    return {"items": [connector_dict(c) for c in connectors]}


@router.get("/{connector_id}")
def get_connector(connector_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    connector = db.get(Connector, connector_id)
    if not connector or connector.org_id != user.org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Connector not found")
    return connector_dict(connector)


@router.get("/{connector_id}/jobs")
def list_jobs(connector_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    connector = db.get(Connector, connector_id)
    if not connector or connector.org_id != user.org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Connector not found")
    jobs = (
        db.query(SyncJob)
        .filter(SyncJob.connector_id == connector_id)
        .order_by(SyncJob.started_at.desc())
        .limit(20)
        .all()
    )
    return {"items": [sync_job_dict(j) for j in jobs]}


@router.post("/{connector_id}/sync")
def trigger_sync(
    connector_id: str,
    user: User = Depends(require_roles("system_admin", "data_steward", "security_admin")),
    db: Session = Depends(get_db),
):
    connector = db.get(Connector, connector_id)
    if not connector or connector.org_id != user.org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Connector not found")
    if connector.status == "paused":
        raise HTTPException(status.HTTP_409_CONFLICT, "Connector is paused")
    job = run_sync(db, connector, triggered_by=user, trigger="manual")
    return {"job": sync_job_dict(job), "connector": connector_dict(connector)}
