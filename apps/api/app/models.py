"""BrainChain data model.

Every piece of ingested information keeps its source, owner, classification,
permitted principals, dates, retention policy, department, confidence and audit
trail. Knowledge-graph relationships are plain relational tables (Entity /
EntityRelationship) per the "no unnecessary infrastructure" rule.
"""
from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON

from .db import Base


def uid() -> str:
    return uuid.uuid4().hex


def utcnow() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)


# ---------------------------------------------------------------- organization


class Organization(Base, TimestampMixin):
    __tablename__ = "organizations"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    name: Mapped[str] = mapped_column(String(200))
    slug: Mapped[str] = mapped_column(String(100), unique=True)
    # government | commercial | private
    deployment_profile: Mapped[str] = mapped_column(String(20), default="commercial")
    # min_feedback_cohort, external_models_enabled, dry_run_default, ...
    settings: Mapped[dict] = mapped_column(JSON, default=dict)


class Workspace(Base, TimestampMixin):
    __tablename__ = "workspaces"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    org_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"))
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")


class Department(Base, TimestampMixin):
    __tablename__ = "departments"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    org_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"))
    name: Mapped[str] = mapped_column(String(120))
    slug: Mapped[str] = mapped_column(String(120))
    __table_args__ = (UniqueConstraint("org_id", "slug"),)


class User(Base, TimestampMixin):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    org_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"))
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(200))
    title: Mapped[str] = mapped_column(String(200), default="")
    department_id: Mapped[str | None] = mapped_column(ForeignKey("departments.id"), nullable=True)
    password_hash: Mapped[str] = mapped_column(String(500))
    # Highest classification level this user may read (0 public .. 3 restricted).
    clearance_level: Mapped[int] = mapped_column(Integer, default=1)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    department: Mapped[Department | None] = relationship()
    roles: Mapped[list[Role]] = relationship(secondary="user_roles", lazy="selectin")
    groups: Mapped[list[Group]] = relationship(secondary="user_groups", lazy="selectin")

    def role_names(self) -> set[str]:
        return {r.name for r in self.roles}


class Group(Base, TimestampMixin):
    __tablename__ = "groups"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    org_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"))
    name: Mapped[str] = mapped_column(String(120))


class UserGroup(Base):
    __tablename__ = "user_groups"
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), primary_key=True)
    group_id: Mapped[str] = mapped_column(ForeignKey("groups.id"), primary_key=True)


class Role(Base):
    __tablename__ = "roles"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    # employee, manager, executive, data_steward, security_admin, system_admin, agent_approver
    name: Mapped[str] = mapped_column(String(60), unique=True)
    description: Mapped[str] = mapped_column(Text, default="")


class UserRole(Base):
    __tablename__ = "user_roles"
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), primary_key=True)
    role_id: Mapped[str] = mapped_column(ForeignKey("roles.id"), primary_key=True)


class Permission(Base):
    __tablename__ = "permissions"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    role_id: Mapped[str] = mapped_column(ForeignKey("roles.id"))
    # e.g. feedback:aggregate, agents:approve, admin:*, audit:read
    action: Mapped[str] = mapped_column(String(120))


class SessionToken(Base):
    __tablename__ = "session_tokens"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    token: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime)


# ---------------------------------------------------------------- governance


class SecurityClassification(Base):
    __tablename__ = "security_classifications"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    org_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"))
    name: Mapped[str] = mapped_column(String(60))  # Public/Internal/Confidential/Restricted
    level: Mapped[int] = mapped_column(Integer)  # 0..3
    description: Mapped[str] = mapped_column(Text, default="")
    color: Mapped[str] = mapped_column(String(20), default="gray")


class RetentionPolicy(Base):
    __tablename__ = "retention_policies"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    org_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"))
    name: Mapped[str] = mapped_column(String(120))
    duration_days: Mapped[int] = mapped_column(Integer)  # 0 = indefinite
    description: Mapped[str] = mapped_column(Text, default="")


# ---------------------------------------------------------------- ingestion


class DataSource(Base, TimestampMixin):
    __tablename__ = "data_sources"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    org_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"))
    name: Mapped[str] = mapped_column(String(200))
    # jira | zoom | slack | teams | email | gdrive | sharepoint | onedrive |
    # wiki | contracts | procurement | finance | upload | policy
    kind: Mapped[str] = mapped_column(String(60))
    description: Mapped[str] = mapped_column(Text, default="")
    owner_user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    department_id: Mapped[str | None] = mapped_column(ForeignKey("departments.id"), nullable=True)
    classification_id: Mapped[str | None] = mapped_column(
        ForeignKey("security_classifications.id"), nullable=True
    )
    retention_policy_id: Mapped[str | None] = mapped_column(
        ForeignKey("retention_policies.id"), nullable=True
    )

    classification: Mapped[SecurityClassification | None] = relationship()
    retention_policy: Mapped[RetentionPolicy | None] = relationship()
    owner: Mapped[User | None] = relationship()
    department: Mapped[Department | None] = relationship()


class Connector(Base, TimestampMixin):
    __tablename__ = "connectors"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    org_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"))
    data_source_id: Mapped[str] = mapped_column(ForeignKey("data_sources.id"))
    provider: Mapped[str] = mapped_column(String(60))  # zoom, slack, jira, ...
    display_name: Mapped[str] = mapped_column(String(200))
    status: Mapped[str] = mapped_column(String(30), default="connected")  # connected|error|paused
    health: Mapped[str] = mapped_column(String(20), default="healthy")  # healthy|degraded|failing
    sync_frequency: Mapped[str] = mapped_column(String(40), default="hourly")
    last_sync_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    items_synced: Mapped[int] = mapped_column(Integer, default=0)
    items_skipped: Mapped[int] = mapped_column(Integer, default=0)
    permission_errors: Mapped[int] = mapped_column(Integer, default=0)
    is_mock: Mapped[bool] = mapped_column(Boolean, default=True)
    config: Mapped[dict] = mapped_column(JSON, default=dict)

    data_source: Mapped[DataSource] = relationship()


class SyncJob(Base):
    __tablename__ = "sync_jobs"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    connector_id: Mapped[str] = mapped_column(ForeignKey("connectors.id"), index=True)
    status: Mapped[str] = mapped_column(String(30), default="queued")  # queued|running|success|failed
    trigger: Mapped[str] = mapped_column(String(30), default="manual")  # manual|scheduled
    started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    items_processed: Mapped[int] = mapped_column(Integer, default=0)
    items_skipped: Mapped[int] = mapped_column(Integer, default=0)
    log: Mapped[list] = mapped_column(JSON, default=list)
    triggered_by_user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)


class SourceItem(Base):
    __tablename__ = "source_items"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    connector_id: Mapped[str] = mapped_column(ForeignKey("connectors.id"), index=True)
    external_id: Mapped[str] = mapped_column(String(255))
    kind: Mapped[str] = mapped_column(String(60))  # transcript|message|file|ticket|record
    title: Mapped[str] = mapped_column(String(400))
    raw_meta: Mapped[dict] = mapped_column(JSON, default=dict)
    ingested_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


# ---------------------------------------------------------------- documents


class Document(Base, TimestampMixin):
    __tablename__ = "documents"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    org_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    data_source_id: Mapped[str | None] = mapped_column(ForeignKey("data_sources.id"), nullable=True)
    source_item_id: Mapped[str | None] = mapped_column(ForeignKey("source_items.id"), nullable=True)
    title: Mapped[str] = mapped_column(String(400))
    # contract | ticket | transcript | message | policy | plan | financial |
    # risk_register | roadmap | procedure | note | decision_log | supplier | spend
    doc_type: Mapped[str] = mapped_column(String(60))
    summary: Mapped[str] = mapped_column(Text, default="")
    department_id: Mapped[str | None] = mapped_column(ForeignKey("departments.id"), nullable=True)
    owner_user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    classification_id: Mapped[str] = mapped_column(ForeignKey("security_classifications.id"))
    retention_policy_id: Mapped[str | None] = mapped_column(
        ForeignKey("retention_policies.id"), nullable=True
    )
    source_created_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    source_updated_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    confidence: Mapped[float] = mapped_column(Float, default=0.9)
    current_version: Mapped[int] = mapped_column(Integer, default=1)
    # project, contract dates/values, obligations, entities, fact keys, lineage
    meta: Mapped[dict] = mapped_column(JSON, default=dict)

    classification: Mapped[SecurityClassification] = relationship(lazy="joined")
    department: Mapped[Department | None] = relationship(lazy="joined")
    owner: Mapped[User | None] = relationship(lazy="joined")
    data_source: Mapped[DataSource | None] = relationship(lazy="joined")
    retention_policy: Mapped[RetentionPolicy | None] = relationship(lazy="joined")
    versions: Mapped[list[DocumentVersion]] = relationship(
        back_populates="document", order_by="DocumentVersion.version"
    )
    chunks: Mapped[list[DocumentChunk]] = relationship(
        back_populates="document", order_by="DocumentChunk.ord"
    )


class DocumentVersion(Base):
    __tablename__ = "document_versions"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    document_id: Mapped[str] = mapped_column(ForeignKey("documents.id"), index=True)
    version: Mapped[int] = mapped_column(Integer, default=1)
    content: Mapped[str] = mapped_column(Text)
    note: Mapped[str] = mapped_column(String(400), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    document: Mapped[Document] = relationship(back_populates="versions")


class DocumentChunk(Base):
    __tablename__ = "document_chunks"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    document_id: Mapped[str] = mapped_column(ForeignKey("documents.id"), index=True)
    ord: Mapped[int] = mapped_column(Integer, default=0)
    text: Mapped[str] = mapped_column(Text)
    # JSON list of floats from the embedding provider. With Postgres+pgvector
    # this column is replaced by a vector column (see docs/architecture.md).
    embedding: Mapped[list] = mapped_column(JSON, default=list)
    # section, fact_key (used for conflict detection), page, speaker, ...
    meta: Mapped[dict] = mapped_column(JSON, default=dict)

    document: Mapped[Document] = relationship(back_populates="chunks")


class AccessControlEntry(Base):
    __tablename__ = "access_control_entries"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    org_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    document_id: Mapped[str | None] = mapped_column(
        ForeignKey("documents.id"), nullable=True, index=True
    )
    data_source_id: Mapped[str | None] = mapped_column(
        ForeignKey("data_sources.id"), nullable=True, index=True
    )
    # org | department | group | role | user
    principal_type: Mapped[str] = mapped_column(String(30))
    principal_id: Mapped[str] = mapped_column(String(64))  # id, or "*" for org
    permission: Mapped[str] = mapped_column(String(20), default="read")
    granted_by_user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    note: Mapped[str] = mapped_column(String(300), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


# ---------------------------------------------------------------- knowledge graph


class Entity(Base, TimestampMixin):
    __tablename__ = "entities"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    org_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    # person|team|department|project|contract|supplier|product|meeting|decision|
    # document|task|risk|goal|system|policy|customer
    kind: Mapped[str] = mapped_column(String(40), index=True)
    name: Mapped[str] = mapped_column(String(300), index=True)
    meta: Mapped[dict] = mapped_column(JSON, default=dict)


class EntityRelationship(Base):
    __tablename__ = "entity_relationships"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    org_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    from_entity_id: Mapped[str] = mapped_column(ForeignKey("entities.id"), index=True)
    to_entity_id: Mapped[str] = mapped_column(ForeignKey("entities.id"), index=True)
    # owns|works_on|supplies|governs|depends_on|decided_in|mentions|manages|at_risk
    rel_type: Mapped[str] = mapped_column(String(60))
    weight: Mapped[float] = mapped_column(Float, default=1.0)
    meta: Mapped[dict] = mapped_column(JSON, default=dict)


# ---------------------------------------------------------------- tribal knowledge


class Meeting(Base, TimestampMixin):
    __tablename__ = "meetings"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    org_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"))
    title: Mapped[str] = mapped_column(String(300))
    held_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    source: Mapped[str] = mapped_column(String(40), default="zoom")
    transcript_document_id: Mapped[str | None] = mapped_column(
        ForeignKey("documents.id"), nullable=True
    )
    department_id: Mapped[str | None] = mapped_column(ForeignKey("departments.id"), nullable=True)
    attendees: Mapped[list] = mapped_column(JSON, default=list)
    # decisions, action_items, open_questions, risks extracted at ingest
    extraction: Mapped[dict] = mapped_column(JSON, default=dict)


class Decision(Base, TimestampMixin):
    __tablename__ = "decisions"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    org_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"))
    title: Mapped[str] = mapped_column(String(400))
    decided_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    rationale: Mapped[str] = mapped_column(Text, default="")
    # proposed|active|superseded|revisited — "proposed" decisions come from
    # interviews and require confirmation by an authorized person.
    status: Mapped[str] = mapped_column(String(30), default="active")
    supersedes_id: Mapped[str | None] = mapped_column(ForeignKey("decisions.id"), nullable=True)
    meeting_id: Mapped[str | None] = mapped_column(ForeignKey("meetings.id"), nullable=True)
    document_id: Mapped[str | None] = mapped_column(ForeignKey("documents.id"), nullable=True)
    project: Mapped[str] = mapped_column(String(200), default="")
    owners: Mapped[list] = mapped_column(JSON, default=list)
    sources: Mapped[list] = mapped_column(JSON, default=list)  # document ids
    # alternatives / dissent / assumptions / success metrics (from interviews)
    details: Mapped[dict] = mapped_column(JSON, default=dict)


# ---------------------------------------------------------------- interviews


class InterviewAssignment(Base, TimestampMixin):
    """A manager's request for an interview. The employee stays in control:
    they choose visibility (within the privacy rules), can decline, and the
    manager never gains access to the session itself.

    Privacy rules enforced in the service layer:
      * individual assignments (assignee_user_id) can never be answered
        anonymously — a cohort of one is not anonymous;
      * department assignments report only an aggregate response count to the
        creator, never who responded.
    """

    __tablename__ = "interview_assignments"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    org_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    created_by_user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    # Exactly one of the two targets is set (validated in the service).
    assignee_user_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id"), nullable=True, index=True
    )
    department_id: Mapped[str | None] = mapped_column(
        ForeignKey("departments.id"), nullable=True, index=True
    )
    purpose: Mapped[str] = mapped_column(String(30))
    suggested_mode: Mapped[str] = mapped_column(String(20), default="text")
    title: Mapped[str] = mapped_column(String(300))
    # What the manager wants to understand, shown to the employee verbatim.
    note: Mapped[str] = mapped_column(Text, default="")
    due_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    # open | completed | declined | cancelled  (department assignments stay
    # open until cancelled; completion is per-response and count-only)
    status: Mapped[str] = mapped_column(String(20), default="open")
    decline_reason: Mapped[str] = mapped_column(Text, default="")


class InterviewSession(Base, TimestampMixin):
    """A Brain Interview conversation. Anonymity is structural: anonymous
    sessions store user_id NULL, a day-coarsened creation time, and are
    reachable only through the receipt token the author holds."""

    __tablename__ = "interview_sessions"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    org_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    # NULL ⇔ anonymous. Confidential sessions keep the id for protected
    # follow-up only; it never reaches manager-facing surfaces.
    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    receipt_token: Mapped[str] = mapped_column(String(64), unique=True, default=uid)
    # process | meeting_prep | concern | decision | expert | outcome_review
    purpose: Mapped[str] = mapped_column(String(30))
    # voice | text | quick_voice | quick_text
    mode: Mapped[str] = mapped_column(String(20))
    # named | confidential | anonymous  (voice modes can never be anonymous)
    visibility: Mapped[str] = mapped_column(String(20), default="named")
    # draft | consent_required | active | paused | processing | review_required
    # | published | discarded | failed
    status: Mapped[str] = mapped_column(String(30), default="draft")
    title: Mapped[str] = mapped_column(String(300), default="")
    # Optional context references (validated against the caller's permissions).
    meeting_id: Mapped[str | None] = mapped_column(ForeignKey("meetings.id"), nullable=True)
    entity_id: Mapped[str | None] = mapped_column(ForeignKey("entities.id"), nullable=True)
    decision_id: Mapped[str | None] = mapped_column(ForeignKey("decisions.id"), nullable=True)
    agent_run_id: Mapped[str | None] = mapped_column(ForeignKey("agent_runs.id"), nullable=True)
    assignment_id: Mapped[str | None] = mapped_column(
        ForeignKey("interview_assignments.id"), nullable=True, index=True
    )
    consent_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    # delete_after_transcription (default) | retain_with_consent
    audio_retention_policy: Mapped[str] = mapped_column(
        String(40), default="delete_after_transcription"
    )
    transcript_retention_policy: Mapped[str] = mapped_column(String(40), default="retain")
    started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    published_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    # User-safe failure code (e.g. transcription_provider_error); no stack traces.
    failure_code: Mapped[str] = mapped_column(String(60), default="")
    # Interviewer memory (asked fields) + provider names. Never secrets.
    provider_meta: Mapped[dict] = mapped_column(JSON, default=dict)
    asked_fields: Mapped[list] = mapped_column(JSON, default=list)

    turns: Mapped[list[InterviewTurn]] = relationship(
        back_populates="session", order_by="InterviewTurn.seq", cascade="all, delete-orphan"
    )
    artifacts: Mapped[list[InterviewArtifact]] = relationship(
        back_populates="session", order_by="InterviewArtifact.created_at",
        cascade="all, delete-orphan",
    )


class InterviewTurn(Base):
    """One conversational turn. Inherits the session's access — a turn never
    has broader permissions than its parent."""

    __tablename__ = "interview_turns"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    session_id: Mapped[str] = mapped_column(
        ForeignKey("interview_sessions.id"), index=True
    )
    seq: Mapped[int] = mapped_column(Integer, default=0)
    role: Mapped[str] = mapped_column(String(20))  # interviewer | employee | system
    text: Mapped[str] = mapped_column(Text)
    started_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    transcription_confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    edited: Mapped[bool] = mapped_column(Boolean, default=False)
    redactions: Mapped[list] = mapped_column(JSON, default=list)
    meta: Mapped[dict] = mapped_column(JSON, default=dict)  # reason category, field
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    session: Mapped[InterviewSession] = relationship(back_populates="turns")


class InterviewArtifact(Base):
    """A candidate piece of knowledge extracted from the conversation. Nothing
    publishes without the employee's explicit selection during review."""

    __tablename__ = "interview_artifacts"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    session_id: Mapped[str] = mapped_column(
        ForeignKey("interview_sessions.id"), index=True
    )
    kind: Mapped[str] = mapped_column(String(40))
    summary: Mapped[str] = mapped_column(Text)  # canonical, employee-editable
    details: Mapped[dict] = mapped_column(JSON, default=dict)
    confidence: Mapped[float] = mapped_column(Float, default=0.5)
    provenance: Mapped[str] = mapped_column(String(20), default="unknown")  # firsthand|hearsay|unknown
    selected: Mapped[bool] = mapped_column(Boolean, default=True)
    employee_edited: Mapped[bool] = mapped_column(Boolean, default=False)
    uncertain: Mapped[bool] = mapped_column(Boolean, default=False)
    published_target_type: Mapped[str | None] = mapped_column(String(30), nullable=True)
    published_target_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    supporting_turn_ids: Mapped[list] = mapped_column(JSON, default=list)
    excerpt: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    session: Mapped[InterviewSession] = relationship(back_populates="artifacts")


class AudioAsset(Base):
    """Object-storage reference for voice audio — never binary in the DB.
    Default lifecycle: deleted immediately after successful transcription."""

    __tablename__ = "audio_assets"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    session_id: Mapped[str] = mapped_column(ForeignKey("interview_sessions.id"), index=True)
    storage_key: Mapped[str] = mapped_column(String(300))
    status: Mapped[str] = mapped_column(String(20), default="recorded")  # recorded|transcribed|deleted
    retention_policy: Mapped[str] = mapped_column(String(40), default="delete_after_transcription")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


# ---------------------------------------------------------------- feedback


class Survey(Base, TimestampMixin):
    __tablename__ = "surveys"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    org_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"))
    title: Mapped[str] = mapped_column(String(300))
    # weekly_pulse | pre_meeting | post_meeting | team_health | retro | review_input
    kind: Mapped[str] = mapped_column(String(40))
    status: Mapped[str] = mapped_column(String(20), default="open")  # draft|open|closed
    description: Mapped[str] = mapped_column(Text, default="")
    opens_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    closes_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    min_cohort_override: Mapped[int | None] = mapped_column(Integer, nullable=True)

    questions: Mapped[list[SurveyQuestion]] = relationship(order_by="SurveyQuestion.ord")


class SurveyQuestion(Base):
    __tablename__ = "survey_questions"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    survey_id: Mapped[str] = mapped_column(ForeignKey("surveys.id"), index=True)
    ord: Mapped[int] = mapped_column(Integer, default=0)
    text: Mapped[str] = mapped_column(Text)
    qtype: Mapped[str] = mapped_column(String(30), default="text")  # text|scale|choice
    options: Mapped[list] = mapped_column(JSON, default=list)


class FeedbackSubmission(Base):
    """A feedback item. Anonymity is structural: for anonymous submissions the
    user_id column is NULL and identifying metadata is never stored. The
    receipt_token lets the author check status without any server-side link
    from the submission to their account."""

    __tablename__ = "feedback_submissions"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    org_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    survey_id: Mapped[str | None] = mapped_column(ForeignKey("surveys.id"), nullable=True)
    # named | confidential | anonymous
    visibility: Mapped[str] = mapped_column(String(20), default="named")
    # thought | idea | concern | question | process | friction | retro | survey_answer
    category: Mapped[str] = mapped_column(String(40), default="thought")
    body: Mapped[str] = mapped_column(Text)
    answers: Mapped[dict] = mapped_column(JSON, default=dict)  # question_id -> answer
    # NULL for anonymous; set for named/confidential (confidential is visible
    # only to the feedback service, never to manager-facing endpoints).
    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    department_tag: Mapped[str | None] = mapped_column(String(120), nullable=True)
    project_tag: Mapped[str | None] = mapped_column(String(120), nullable=True)
    allow_followup: Mapped[bool] = mapped_column(Boolean, default=False)
    status: Mapped[str] = mapped_column(String(20), default="submitted")  # draft|submitted|reviewed
    theme_id: Mapped[str | None] = mapped_column(ForeignKey("feedback_themes.id"), nullable=True)
    sentiment: Mapped[str] = mapped_column(String(20), default="neutral")
    receipt_token: Mapped[str] = mapped_column(String(64), default=uid, unique=True)
    # Coarse timestamp only (day resolution) for anonymous items to reduce
    # timing-correlation deanonymization.
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class FeedbackTheme(Base, TimestampMixin):
    __tablename__ = "feedback_themes"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    org_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"))
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    keywords: Mapped[list] = mapped_column(JSON, default=list)


# ---------------------------------------------------------------- assistant


class Conversation(Base, TimestampMixin):
    __tablename__ = "conversations"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    org_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    title: Mapped[str] = mapped_column(String(300), default="New conversation")


class LLMMessage(Base):
    __tablename__ = "llm_messages"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    conversation_id: Mapped[str] = mapped_column(ForeignKey("conversations.id"), index=True)
    role: Mapped[str] = mapped_column(String(20))  # user | assistant
    content: Mapped[str] = mapped_column(Text)
    # direct | detailed | executive | action_plan | research | compare | tasks | meeting_prep
    mode: Mapped[str] = mapped_column(String(30), default="direct")
    provider: Mapped[str] = mapped_column(String(60), default="")
    model: Mapped[str] = mapped_column(String(120), default="")
    tokens_in: Mapped[int] = mapped_column(Integer, default=0)
    tokens_out: Mapped[int] = mapped_column(Integer, default=0)
    cost_estimate: Mapped[float] = mapped_column(Float, default=0.0)
    latency_ms: Mapped[int] = mapped_column(Integer, default=0)
    # statement provenance blocks: verified | inference | user_provided |
    # suggested_action | missing | conflict
    segments: Mapped[list] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    citations: Mapped[list[Citation]] = relationship(order_by="Citation.ord")


class Citation(Base):
    __tablename__ = "citations"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    message_id: Mapped[str] = mapped_column(ForeignKey("llm_messages.id"), index=True)
    document_id: Mapped[str] = mapped_column(ForeignKey("documents.id"))
    chunk_id: Mapped[str | None] = mapped_column(ForeignKey("document_chunks.id"), nullable=True)
    ord: Mapped[int] = mapped_column(Integer, default=1)
    excerpt: Mapped[str] = mapped_column(Text, default="")
    relevance: Mapped[float] = mapped_column(Float, default=0.0)

    document: Mapped[Document] = relationship(lazy="joined")


# ---------------------------------------------------------------- model gateway


class ModelProvider(Base, TimestampMixin):
    __tablename__ = "model_providers"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    org_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"))
    name: Mapped[str] = mapped_column(String(200))
    # mock | openai_compatible | private_hosted | local
    kind: Mapped[str] = mapped_column(String(40))
    base_url: Mapped[str] = mapped_column(String(400), default="")
    model: Mapped[str] = mapped_column(String(120), default="")
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    is_external: Mapped[bool] = mapped_column(Boolean, default=False)
    allows_data_retention: Mapped[bool] = mapped_column(Boolean, default=False)
    allows_tool_use: Mapped[bool] = mapped_column(Boolean, default=True)
    max_context_tokens: Mapped[int] = mapped_column(Integer, default=128000)
    cost_limit_usd_month: Mapped[float] = mapped_column(Float, default=0.0)
    region: Mapped[str] = mapped_column(String(60), default="us")


class ModelPolicy(Base, TimestampMixin):
    __tablename__ = "model_policies"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    org_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"))
    name: Mapped[str] = mapped_column(String(200))
    provider_id: Mapped[str] = mapped_column(ForeignKey("model_providers.id"))
    fallback_provider_id: Mapped[str | None] = mapped_column(
        ForeignKey("model_providers.id"), nullable=True
    )
    # Highest classification level whose content may be sent to this provider.
    max_classification_level: Mapped[int] = mapped_column(Integer, default=1)
    department_ids: Mapped[list] = mapped_column(JSON, default=list)  # empty = all
    role_names: Mapped[list] = mapped_column(JSON, default=list)  # empty = all
    logging_policy: Mapped[str] = mapped_column(String(40), default="metadata_only")
    priority: Mapped[int] = mapped_column(Integer, default=100)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)

    provider: Mapped[ModelProvider] = relationship(foreign_keys=[provider_id], lazy="joined")


# ---------------------------------------------------------------- agents


class Agent(Base, TimestampMixin):
    __tablename__ = "agents"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    org_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"))
    key: Mapped[str] = mapped_column(String(60))  # research|planning|project_health|...
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    category: Mapped[str] = mapped_column(String(60), default="general")
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    # Allowlist of tools this agent may call.
    tool_allowlist: Mapped[list] = mapped_column(JSON, default=list)
    # Action types that always require human approval.
    approval_required_actions: Mapped[list] = mapped_column(JSON, default=list)
    config: Mapped[dict] = mapped_column(JSON, default=dict)


class AgentRun(Base, TimestampMixin):
    __tablename__ = "agent_runs"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    org_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    agent_id: Mapped[str] = mapped_column(ForeignKey("agents.id"))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    goal: Mapped[str] = mapped_column(Text)
    # queued|retrieving|planning|awaiting_approval|executing|verifying|completed|failed|rejected
    status: Mapped[str] = mapped_column(String(30), default="queued")
    mode: Mapped[str] = mapped_column(String(20), default="dry_run")  # dry_run | live
    current_step: Mapped[str] = mapped_column(String(200), default="")
    plan: Mapped[list] = mapped_column(JSON, default=list)  # phases/tasks/owners/risks
    assumptions: Mapped[list] = mapped_column(JSON, default=list)
    source_document_ids: Mapped[list] = mapped_column(JSON, default=list)
    proposed_actions: Mapped[list] = mapped_column(JSON, default=list)
    result_summary: Mapped[str] = mapped_column(Text, default="")
    error: Mapped[str] = mapped_column(Text, default="")
    retries: Mapped[int] = mapped_column(Integer, default=0)
    tokens_used: Mapped[int] = mapped_column(Integer, default=0)
    cost_estimate: Mapped[float] = mapped_column(Float, default=0.0)
    started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    agent: Mapped[Agent] = relationship(lazy="joined")
    steps: Mapped[list[AgentStep]] = relationship(order_by="AgentStep.ord")


class AgentStep(Base):
    __tablename__ = "agent_steps"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    run_id: Mapped[str] = mapped_column(ForeignKey("agent_runs.id"), index=True)
    ord: Mapped[int] = mapped_column(Integer, default=0)
    # retrieve | plan | propose_action | await_approval | execute | verify | report
    kind: Mapped[str] = mapped_column(String(40))
    title: Mapped[str] = mapped_column(String(300))
    status: Mapped[str] = mapped_column(String(30), default="pending")
    detail: Mapped[dict] = mapped_column(JSON, default=dict)  # tool calls, sources, output
    started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class Task(Base, TimestampMixin):
    __tablename__ = "tasks"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    org_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    title: Mapped[str] = mapped_column(String(400))
    description: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(30), default="open")  # open|in_progress|done|blocked
    priority: Mapped[str] = mapped_column(String(20), default="medium")
    assignee_user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    due_date: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    project: Mapped[str] = mapped_column(String(200), default="")
    source: Mapped[str] = mapped_column(String(40), default="manual")  # manual|agent|meeting|jira
    agent_run_id: Mapped[str | None] = mapped_column(ForeignKey("agent_runs.id"), nullable=True)
    meeting_id: Mapped[str | None] = mapped_column(ForeignKey("meetings.id"), nullable=True)
    external_ref: Mapped[str] = mapped_column(String(120), default="")  # e.g. PHX-482

    assignee: Mapped[User | None] = relationship(lazy="joined")


class ApprovalRequest(Base, TimestampMixin):
    __tablename__ = "approval_requests"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    org_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    agent_run_id: Mapped[str | None] = mapped_column(ForeignKey("agent_runs.id"), nullable=True)
    step_id: Mapped[str | None] = mapped_column(ForeignKey("agent_steps.id"), nullable=True)
    # send_email|post_message|modify_jira|create_external_record|approve_spend|
    # change_contract|modify_permissions|export_sensitive|trigger_workflow|external_comm
    action_type: Mapped[str] = mapped_column(String(60))
    title: Mapped[str] = mapped_column(String(400))
    payload: Mapped[dict] = mapped_column(JSON, default=dict)
    # pending | approved | rejected | executed_dry_run | executed | cancelled
    status: Mapped[str] = mapped_column(String(30), default="pending")
    requested_by_user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    approver_user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    decision_reason: Mapped[str] = mapped_column(Text, default="")


# ---------------------------------------------------------------- intelligence


class Insight(Base, TimestampMixin):
    __tablename__ = "insights"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    org_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    # change | attention | deadline | project_risk | decision_pending |
    # feedback_theme | spend_signal | recommendation | data_quality | integration
    kind: Mapped[str] = mapped_column(String(40))
    title: Mapped[str] = mapped_column(String(400))
    body: Mapped[str] = mapped_column(Text, default="")
    severity: Mapped[str] = mapped_column(String(20), default="info")  # info|warning|critical
    confidence: Mapped[str] = mapped_column(String(20), default="medium")
    audience: Mapped[str] = mapped_column(String(20), default="executive")  # manager|executive
    period: Mapped[str] = mapped_column(String(40), default="")
    evidence_document_ids: Mapped[list] = mapped_column(JSON, default=list)
    meta: Mapped[dict] = mapped_column(JSON, default=dict)


class ExecutiveSummary(Base, TimestampMixin):
    __tablename__ = "executive_summaries"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    org_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    kind: Mapped[str] = mapped_column(String(40), default="weekly")  # daily|weekly|monthly|...
    title: Mapped[str] = mapped_column(String(400))
    period_start: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    period_end: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    # [{heading, body, evidence: [{document_id, excerpt}]}]
    sections: Mapped[list] = mapped_column(JSON, default=list)
    created_by_agent_run_id: Mapped[str | None] = mapped_column(
        ForeignKey("agent_runs.id"), nullable=True
    )


# ---------------------------------------------------------------- audit & eval


class AuditEvent(Base):
    __tablename__ = "audit_events"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    org_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    # NULL actor for anonymized events (e.g. anonymous feedback submission).
    actor_user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    actor_type: Mapped[str] = mapped_column(String(20), default="user")  # user|agent|system
    action: Mapped[str] = mapped_column(String(120), index=True)
    target_type: Mapped[str] = mapped_column(String(60), default="")
    target_id: Mapped[str] = mapped_column(String(64), default="")
    meta: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)


class EvaluationRun(Base, TimestampMixin):
    __tablename__ = "evaluation_runs"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    org_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"))
    name: Mapped[str] = mapped_column(String(200))
    kind: Mapped[str] = mapped_column(String(60), default="retrieval")  # retrieval|answer_quality
    metrics: Mapped[dict] = mapped_column(JSON, default=dict)
    notes: Mapped[str] = mapped_column(Text, default="")
