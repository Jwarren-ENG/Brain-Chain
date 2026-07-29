"""Document access engine — the zero-trust core.

A user may read a document iff BOTH hold:
  1. clearance: user.clearance_level >= document.classification.level
  2. grant: at least one AccessControlEntry (on the document or its data
     source) matches one of the user's principals (org-wide, department,
     group, role, or the user directly).

Everything downstream — search, retrieval, ask-the-brain context assembly,
citations, agents, insights drill-down — calls accessible_document_ids() or
can_read_document() BEFORE any text is scored, returned, or sent to a model
provider. There is no client-side enforcement and no "executive bypass".
"""
from __future__ import annotations

from sqlalchemy import or_
from sqlalchemy.orm import Session

from ..models import AccessControlEntry, Document, SecurityClassification, User


def _principal_filters(user: User):
    principals = [
        (AccessControlEntry.principal_type == "org"),
        (AccessControlEntry.principal_type == "user") & (AccessControlEntry.principal_id == user.id),
    ]
    if user.department_id:
        principals.append(
            (AccessControlEntry.principal_type == "department")
            & (AccessControlEntry.principal_id == user.department_id)
        )
    group_ids = [g.id for g in user.groups]
    if group_ids:
        principals.append(
            (AccessControlEntry.principal_type == "group")
            & (AccessControlEntry.principal_id.in_(group_ids))
        )
    role_names = list(user.role_names())
    if role_names:
        principals.append(
            (AccessControlEntry.principal_type == "role")
            & (AccessControlEntry.principal_id.in_(role_names))
        )
    return or_(*principals)


def accessible_document_ids(db: Session, user: User) -> set[str]:
    """IDs of every document this user may read. Used to pre-filter retrieval."""
    granted_doc_ids = {
        row[0]
        for row in db.query(AccessControlEntry.document_id)
        .filter(
            AccessControlEntry.org_id == user.org_id,
            AccessControlEntry.document_id.isnot(None),
            _principal_filters(user),
        )
        .all()
    }
    granted_source_ids = {
        row[0]
        for row in db.query(AccessControlEntry.data_source_id)
        .filter(
            AccessControlEntry.org_id == user.org_id,
            AccessControlEntry.data_source_id.isnot(None),
            _principal_filters(user),
        )
        .all()
    }

    query = (
        db.query(Document.id)
        .join(SecurityClassification, Document.classification_id == SecurityClassification.id)
        .filter(
            Document.org_id == user.org_id,
            SecurityClassification.level <= user.clearance_level,
        )
    )
    if granted_doc_ids and granted_source_ids:
        query = query.filter(
            or_(Document.id.in_(granted_doc_ids), Document.data_source_id.in_(granted_source_ids))
        )
    elif granted_doc_ids:
        query = query.filter(Document.id.in_(granted_doc_ids))
    elif granted_source_ids:
        query = query.filter(Document.data_source_id.in_(granted_source_ids))
    else:
        return set()
    return {row[0] for row in query.all()}


def can_read_document(db: Session, user: User, document: Document) -> bool:
    if document.org_id != user.org_id:
        return False
    if document.classification.level > user.clearance_level:
        return False
    grant = (
        db.query(AccessControlEntry.id)
        .filter(
            AccessControlEntry.org_id == user.org_id,
            or_(
                AccessControlEntry.document_id == document.id,
                (AccessControlEntry.data_source_id == document.data_source_id)
                if document.data_source_id
                else False,
            ),
            _principal_filters(user),
        )
        .first()
    )
    return grant is not None


def access_explanation(db: Session, user: User, document: Document) -> list[dict]:
    """Why can this user see this document? Shown in the Knowledge Explorer."""
    reasons: list[dict] = [
        {
            "kind": "clearance",
            "detail": (
                f"Your clearance ({user.clearance_level}) covers "
                f"{document.classification.name} (level {document.classification.level})"
            ),
        }
    ]
    entries = (
        db.query(AccessControlEntry)
        .filter(
            AccessControlEntry.org_id == user.org_id,
            or_(
                AccessControlEntry.document_id == document.id,
                (AccessControlEntry.data_source_id == document.data_source_id)
                if document.data_source_id
                else False,
            ),
            _principal_filters(user),
        )
        .all()
    )
    for e in entries:
        scope = "document" if e.document_id else "data source"
        reasons.append(
            {
                "kind": "grant",
                "detail": f"{e.principal_type.title()} grant on this {scope}"
                + (f" — {e.note}" if e.note else ""),
            }
        )
    return reasons
