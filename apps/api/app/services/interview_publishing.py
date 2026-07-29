"""Publishing: route employee-approved artifacts into the correct memory
layer, in one transaction, preserving citations and never widening access.

Destination rules (see docs/brain-interviews.md §7):
  * knowledge kinds → permission-aware Documents with chunks/embeddings
    (named = attributed, confidential = unattributed, anonymous = never a
    citable document — routed to the protected feedback pipeline instead);
  * meeting_topic / contextual open_question → meeting preparation;
  * decision cluster → one proposed Decision requiring human confirmation;
  * risk / friction / idea / meeting_reflection → feedback pipeline with the
    session's visibility (cohort rules unchanged);
  * action_item → draft Task (named/confidential; anonymous falls back to
    feedback because a task needs an owner).
"""
from __future__ import annotations

import secrets

from fastapi import HTTPException
from fastapi import status as http_status
from sqlalchemy.orm import Session

from ..models import (
    DataSource,
    FeedbackSubmission,
    InterviewArtifact,
    InterviewSession,
    RetentionPolicy,
    SecurityClassification,
    Task,
    User,
    utcnow,
)
from ..models import Decision as DecisionModel
from ..security.audit import record
from .feedback import classify_sentiment, match_theme
from .ingestion import ingest_document
from .interviews import transition

KNOWLEDGE_KINDS = {
    "claim", "process_step", "process_exception", "workaround",
    "expert_heuristic", "lesson", "entity_relationship",
}
DECISION_KINDS = {"decision", "decision_alternative", "decision_rationale",
                  "dissent", "assumption", "success_metric"}
FEEDBACK_KINDS = {"risk", "friction", "idea", "meeting_reflection"}
MEETING_KINDS = {"meeting_topic"}

_FEEDBACK_CATEGORY = {
    "risk": "concern", "friction": "friction", "idea": "idea",
    "meeting_reflection": "meeting_reflection", "open_question": "question",
    "action_item": "process",
}

KIND_LABELS = {
    "claim": "Fact", "process_step": "Process step", "process_exception": "Exception",
    "workaround": "Workaround", "risk": "Risk", "friction": "Friction", "idea": "Idea",
    "decision": "Decision", "decision_alternative": "Alternative considered",
    "decision_rationale": "Rationale", "dissent": "Dissent", "assumption": "Assumption",
    "success_metric": "Success metric", "action_item": "Action item",
    "open_question": "Open question", "expert_heuristic": "Expert heuristic",
    "lesson": "Lesson", "entity_relationship": "Relationship",
    "meeting_topic": "Meeting topic", "meeting_reflection": "Meeting reflection",
}


def publish_session(db: Session, user: User, session: InterviewSession) -> list[dict]:
    """Single-transaction publish. Raises 409 unless the session is in
    review_required (mandatory employee review); duplicate publishing is
    therefore structurally impossible."""
    if session.status != "review_required":
        raise HTTPException(
            http_status.HTTP_409_CONFLICT,
            "Only a reviewed interview can be published. Finish the interview and "
            "review the extracted knowledge first.",
        )

    selected = [a for a in session.artifacts if a.selected]
    destinations: list[dict] = []
    try:
        decision_row = _publish_decision_cluster(db, user, session, selected, destinations)
        for artifact in selected:
            if artifact.kind in DECISION_KINDS:
                continue  # handled as a cluster above
            _route_artifact(db, user, session, artifact, destinations, decision_row)
        transition(session, "published")
        session.reviewed_at = session.reviewed_at or utcnow()
        session.published_at = utcnow()
        from .interview_assignments import mark_response_published

        mark_response_published(db, session)
        record(
            db,
            session.org_id,
            "interview.published",
            actor_user_id=session.user_id,
            target_type="interview_session",
            target_id=session.id,
            meta={
                "visibility": session.visibility,
                "artifacts_selected": len(selected),
                "destinations": sorted({d["target_type"] for d in destinations}),
            },
        )
        db.commit()
    except HTTPException:
        db.rollback()
        raise
    except Exception:  # noqa: BLE001 — nothing partial may survive
        db.rollback()
        raise HTTPException(
            http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            "Publishing failed; nothing was published.",
        ) from None
    return destinations


# ------------------------------------------------------------------ routing


def _route_artifact(
    db: Session,
    user: User,
    session: InterviewSession,
    artifact: InterviewArtifact,
    destinations: list[dict],
    decision_row: DecisionModel | None,
) -> None:
    kind = artifact.kind
    anonymous = session.visibility == "anonymous"

    if kind in MEETING_KINDS or (kind == "open_question" and session.meeting_id):
        # Meeting preparation topics render straight from published artifacts;
        # attribution only ever exists for named sessions.
        _mark(artifact, "meeting", session.meeting_id or "unassigned", destinations)
        return

    if kind in KNOWLEDGE_KINDS and not anonymous:
        doc = _publish_knowledge_document(db, user, session, artifact)
        _mark(artifact, "document", doc.id, destinations)
        return

    if kind == "action_item" and not anonymous:
        task = Task(
            org_id=session.org_id,
            title=artifact.summary[:400],
            description="Drafted from a Brain Interview and pending owner confirmation.",
            status="open",
            priority="medium",
            assignee_user_id=session.user_id if session.visibility == "named" else None,
            source="interview",
        )
        db.add(task)
        db.flush()
        _mark(artifact, "task", task.id, destinations)
        return

    # Everything else — and *everything* anonymous — goes to the protected
    # feedback pipeline, subject to the existing cohort rules.
    submission = _publish_feedback(db, session, artifact)
    _mark(artifact, "feedback", submission.id, destinations)


def _mark(
    artifact: InterviewArtifact, target_type: str, target_id: str, destinations: list[dict]
) -> None:
    artifact.published_target_type = target_type
    artifact.published_target_id = target_id
    destinations.append(
        {
            "artifact_id": artifact.id,
            "kind": artifact.kind,
            "label": KIND_LABELS.get(artifact.kind, artifact.kind),
            "target_type": target_type,
            "target_id": target_id,
        }
    )


# ------------------------------------------------------------- destinations


def _interview_data_source(db: Session, org_id: str) -> DataSource:
    source = (
        db.query(DataSource)
        .filter(DataSource.org_id == org_id, DataSource.kind == "interview")
        .first()
    )
    if source:
        return source
    internal = (
        db.query(SecurityClassification)
        .filter(SecurityClassification.org_id == org_id, SecurityClassification.level == 1)
        .first()
    )
    retention = db.query(RetentionPolicy).filter(RetentionPolicy.org_id == org_id).first()
    source = DataSource(
        org_id=org_id,
        name="Brain Interviews",
        kind="interview",
        description="Employee-contributed knowledge, reviewed and published by its author.",
        classification_id=internal.id if internal else None,
        retention_policy_id=retention.id if retention else None,
    )
    db.add(source)
    db.flush()
    return source


def _publish_knowledge_document(
    db: Session, user: User, session: InterviewSession, artifact: InterviewArtifact
):
    named = session.visibility == "named"
    internal = (
        db.query(SecurityClassification)
        .filter(SecurityClassification.org_id == session.org_id, SecurityClassification.level == 1)
        .one()
    )
    source = _interview_data_source(db, session.org_id)
    kind_label = KIND_LABELS.get(artifact.kind, artifact.kind)
    title = (
        f"{session.title} — {kind_label}" if session.title else artifact.summary[:80]
    )
    meta: dict = {
        "origin": "interview",
        "contributed": "named" if named else "unattributed",
        "artifact_kind": artifact.kind,
        "provenance": artifact.provenance,
        "employee_edited": artifact.employee_edited,
    }
    if named:
        # Attribution is the author's explicit choice. Confidential and
        # anonymous publishes never carry a session reference in API-visible
        # fields — deletion linkage lives on the artifact row only.
        meta["interview_session_id"] = session.id

    doc = ingest_document(
        db,
        org_id=session.org_id,
        title=title,
        content=artifact.summary,
        doc_type="contribution",
        classification_id=internal.id,
        data_source_id=source.id,
        department_id=user.department_id if named else None,
        owner_user_id=session.user_id if named else None,
        summary=artifact.summary[:280],
        meta=meta,
        acl=[("org", "*")],  # never broader than the session allows; Internal org-wide
        source_created_at=utcnow(),
        confidence=artifact.confidence,
    )
    return doc


def _publish_feedback(
    db: Session, session: InterviewSession, artifact: InterviewArtifact
) -> FeedbackSubmission:
    """Inline (single-transaction) equivalent of the feedback service's
    submission path, preserving every anonymity guarantee."""
    is_anonymous = session.visibility == "anonymous"
    theme = match_theme(db, session.org_id, artifact.summary)
    submission = FeedbackSubmission(
        org_id=session.org_id,
        visibility=session.visibility,
        category=_FEEDBACK_CATEGORY.get(artifact.kind, "thought"),
        body=artifact.summary,
        user_id=None if is_anonymous else session.user_id,
        allow_followup=False if is_anonymous else session.visibility == "named",
        status="submitted",
        theme_id=theme.id if theme else None,
        sentiment=classify_sentiment(artifact.summary),
        receipt_token=secrets.token_urlsafe(24),
    )
    if is_anonymous:
        submission.created_at = utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    db.add(submission)
    db.flush()
    return submission


def _publish_decision_cluster(
    db: Session,
    user: User,
    session: InterviewSession,
    selected: list[InterviewArtifact],
    destinations: list[dict],
) -> DecisionModel | None:
    cluster = [a for a in selected if a.kind in DECISION_KINDS]
    if not cluster:
        return None
    if session.visibility == "anonymous":
        # Decisions need accountable humans; anonymous decision content routes
        # to the protected pipeline instead of decision memory.
        for artifact in cluster:
            submission = _publish_feedback(db, session, artifact)
            _mark(artifact, "feedback", submission.id, destinations)
        return None

    main = next((a for a in cluster if a.kind == "decision"), cluster[0])
    details: dict = {"from_interview": True}
    for key, kinds in (
        ("alternatives", {"decision_alternative"}),
        ("dissent", {"dissent"}),
        ("assumptions", {"assumption"}),
        ("success_metrics", {"success_metric"}),
        ("rationale_notes", {"decision_rationale"}),
    ):
        values = [a.summary for a in cluster if a.kind in kinds]
        if values:
            details[key] = values
    if session.visibility == "named":
        details["interview_session_id"] = session.id

    decision = DecisionModel(
        org_id=session.org_id,
        title=main.summary[:400],
        decided_at=utcnow(),
        rationale="Documented through a Brain Interview; awaiting confirmation by an "
        "authorized decision owner.",
        status="proposed",
        meeting_id=session.meeting_id,
        owners=[user.name] if session.visibility == "named" else [],
        sources=[],
        details=details,
    )
    db.add(decision)
    db.flush()
    for artifact in cluster:
        _mark(artifact, "decision", decision.id, destinations)
    return decision
