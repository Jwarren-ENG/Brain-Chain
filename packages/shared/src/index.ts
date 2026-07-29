/** Shared API types between the BrainChain web app and (future) TS services. */

export interface UserInfo {
  id: string;
  name: string;
  email: string;
  title: string;
  department: string | null;
  roles: string[];
  clearance_level: number;
  department_id: string | null;
  is_active: boolean;
}

export interface UserBrief {
  id: string;
  name: string;
  email: string;
  title: string;
  department: string | null;
}

export interface Classification {
  id: string;
  name: string;
  level: number;
  color: string;
}

export interface DocumentSummary {
  id: string;
  title: string;
  doc_type: string;
  summary: string;
  classification: Classification;
  department: string | null;
  owner: UserBrief | null;
  source: { id: string; name: string; kind: string } | null;
  project: string | null;
  freshness: "fresh" | "recent" | "stale" | "unknown";
  confidence: number;
  version: number;
  source_created_at: string | null;
  source_updated_at: string | null;
  last_synced_at: string | null;
  meta: Record<string, unknown>;
}

export interface AccessReason {
  kind: "clearance" | "grant";
  detail: string;
}

export interface DocumentDetail extends DocumentSummary {
  versions: { version: number; note: string; created_at: string; content: string }[];
  chunks: { id: string; ord: number; text: string }[];
  lineage: {
    source_item_id: string | null;
    data_source: string;
    retention: string;
    ingest_path: string;
  };
  access_reasons: AccessReason[];
}

export interface SearchResult {
  document: DocumentSummary;
  excerpt: string;
  score: number;
  keyword_hits: string[];
  access_reasons: AccessReason[];
}

export interface CitationInfo {
  origin?: string | null;
  contributed?: "named" | "unattributed" | null;
  ord: number;
  document_id: string;
  chunk_id: string | null;
  excerpt: string;
  relevance: number;
  title: string;
  doc_type: string;
  source_system: string;
  source_name: string;
  classification: Classification;
  department: string | null;
  owner: UserBrief | null;
  date: string | null;
  last_synced_at: string | null;
}

export type SegmentType =
  | "verified"
  | "inference"
  | "user_provided"
  | "suggested_action"
  | "missing"
  | "conflict";

export interface AnswerSegment {
  type: SegmentType;
  text: string;
  citations: number[];
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  mode: string;
  provider: string;
  model: string;
  segments: AnswerSegment[];
  citations: CitationInfo[];
  tokens_in: number;
  tokens_out: number;
  cost_estimate: number;
  latency_ms: number;
  created_at: string;
}

export interface ConnectorInfo {
  id: string;
  provider: string;
  display_name: string;
  status: "connected" | "error" | "paused";
  health: "healthy" | "degraded" | "failing";
  sync_frequency: string;
  last_sync_at: string | null;
  items_synced: number;
  items_skipped: number;
  permission_errors: number;
  is_mock: boolean;
  pending_items: number;
  data_source: {
    id: string;
    name: string;
    kind: string;
    owner: UserBrief | null;
    department: string | null;
    classification: Classification | null;
    retention: string | null;
  };
}

export interface SyncJobInfo {
  id: string;
  status: string;
  trigger: string;
  started_at: string | null;
  finished_at: string | null;
  items_processed: number;
  items_skipped: number;
  log: { t: string; msg: string; level?: string }[];
}

export interface TaskInfo {
  id: string;
  title: string;
  description: string;
  status: "open" | "in_progress" | "done" | "blocked";
  priority: string;
  assignee: UserBrief | null;
  due_date: string | null;
  project: string;
  source: string;
  external_ref: string;
  agent_run_id: string | null;
  created_at: string;
}

export interface ApprovalInfo {
  id: string;
  action_type: string;
  title: string;
  payload: Record<string, unknown>;
  status: string;
  requested_by: UserBrief | null;
  approver: UserBrief | null;
  decided_at: string | null;
  decision_reason: string;
  agent_run: { id: string; goal: string; agent_name: string; mode: string } | null;
  created_at: string;
}

export interface AgentInfo {
  id: string;
  key: string;
  name: string;
  description: string;
  category: string;
  tool_allowlist: string[];
  approval_required_actions: string[];
}

export interface PlanPhase {
  phase: string;
  duration: string;
  items: string[];
  owner: string;
  evidence_note?: string;
}

export interface AgentRunInfo {
  id: string;
  agent: { id: string; key: string; name: string; category: string };
  user: UserBrief | null;
  goal: string;
  status: string;
  mode: "dry_run" | "live";
  current_step: string;
  assumptions: string[];
  proposed_actions: { action_type: string; title: string; detail: string }[];
  result_summary: string;
  error: string;
  retries: number;
  tokens_used: number;
  cost_estimate: number;
  started_at: string | null;
  finished_at: string | null;
  source_document_count: number;
  plan?: PlanPhase[];
  steps?: {
    ord: number;
    kind: string;
    title: string;
    status: string;
    detail: Record<string, unknown>;
    started_at: string | null;
    finished_at: string | null;
  }[];
  approvals?: ApprovalInfo[];
}

export interface FeedbackTheme {
  name: string;
  suppressed: boolean;
  message?: string;
  count?: number;
  negative_share?: number;
  sample_excerpts?: string[];
  trend?: string;
}

export interface FeedbackAggregate {
  cohort_met: boolean;
  threshold: number;
  response_count: number;
  message?: string;
  confidence?: string;
  sentiment: { positive: number; neutral: number; negative: number } | null;
  categories?: Record<string, number>;
  themes: FeedbackTheme[];
  suggested_actions: string[];
}

export interface SurveyInfo {
  id: string;
  title: string;
  kind: string;
  description: string;
  closes_at: string | null;
  questions: { id: string; ord: number; text: string; qtype: string; options: string[] }[];
}

export interface InsightCard {
  kind: string;
  severity: "info" | "warning" | "critical";
  title: string;
  body: string;
  confidence: string;
  evidence: DocumentSummary[];
  evidence_total: number;
}

export interface BriefSection {
  heading: string;
  body: string;
  evidence: DocumentSummary[];
}

export interface Brief {
  id: string;
  kind: string;
  title: string;
  period_start: string | null;
  period_end: string | null;
  created_at: string;
  created_by_agent_run_id: string | null;
  sections: BriefSection[];
}

export interface MeetingInfo {
  id: string;
  title: string;
  held_at: string | null;
  source: string;
  attendees: string[];
  extraction: {
    decisions?: { text: string; speaker: string }[];
    // `action_items` / `open_questions` are the hand-authored seed shape
    // (list-view summary of `{text,...}` pairs). `actions` / `questions` are
    // what `persist_extraction` actually writes for imported and
    // connector-synced meetings (apps/api/app/services/meeting_extraction.py)
    // — both must be read when deriving counts, since a given meeting's
    // extraction blob only ever has one pair populated.
    action_items?: { text: string; owner: string; deadline: string | null }[];
    actions?: { task_id: string; turn_ids: number[]; owner_name: string; due_hint: string }[];
    risks?: { text: string; speaker: string }[];
    open_questions?: { text: string; speaker: string }[];
    questions?: { qid: string; text: string; raised_by: string; status: string; turn_ids: number[] }[];
    speakers?: string[];
  };
  transcript_document_id: string | null;
}

export interface MeetingImportResponse {
  meeting: MeetingInfo;
  document_id: string;
  turn_count: number;
  extraction_status: string;
  counts?: { decisions: number; actions: number; risks: number; questions: number };
}

/** Mirrors `GET /api/meetings/{id}/review` (Task 13) verbatim. */
export interface ReviewTurnInfo {
  idx: number;
  speaker: string;
  text: string;
}

export interface ReviewDecisionArtifact {
  id: string;
  title: string;
  rationale: string;
  alternatives: string[];
  decided_by: string;
  status: string;
  turns: ReviewTurnInfo[];
}

export interface ReviewActionArtifact {
  task_id: string;
  title: string;
  owner_name: string;
  due_hint: string;
  status: string;
  turns: ReviewTurnInfo[];
}

export interface ReviewRiskArtifact {
  rid: string;
  text: string;
  severity: string;
  status: string;
  turns: ReviewTurnInfo[];
}

export interface ReviewQuestionArtifact {
  qid: string;
  text: string;
  raised_by: string;
  status: string;
  turns: ReviewTurnInfo[];
}

/** Kind-tagged union of every artifact shape the review queue can render. */
export type ReviewArtifact =
  | ({ kind: "decision" } & ReviewDecisionArtifact)
  | ({ kind: "action" } & ReviewActionArtifact)
  | ({ kind: "risk" } & ReviewRiskArtifact)
  | ({ kind: "question" } & ReviewQuestionArtifact);

/** The raw `meeting.extraction` blob as written by `persist_extraction` /
 * `import_meeting` (apps/api/app/services/meeting_extraction.py,
 * app/routers/meetings.py) — NOT the same shape as `MeetingInfo["extraction"]`
 * (that one is the list-view summary of `{text,speaker}` pairs). The review
 * endpoint's `meeting_dict()` returns this raw blob verbatim under `meeting.
 * extraction`, so `MeetingReviewPayload` types it separately rather than
 * reusing `MeetingInfo` as-is. */
export interface MeetingReviewMeta {
  turns?: { idx: number; speaker: string; text: string; start?: string | null }[];
  decisions?: { id: string; turn_ids: number[] }[];
  actions?: { task_id: string; turn_ids: number[]; owner_name: string; due_hint: string }[];
  risks?: { rid: string; text: string; severity: string; status: string; turn_ids: number[] }[];
  questions?: { qid: string; text: string; raised_by: string; status: string; turn_ids: number[] }[];
  dropped?: string[];
  summary?: string;
  error?: string;
}

export interface MeetingReviewPayload {
  meeting: Omit<MeetingInfo, "extraction"> & { extraction: MeetingReviewMeta | null };
  summary: string;
  decisions: ReviewDecisionArtifact[];
  actions: ReviewActionArtifact[];
  risks: ReviewRiskArtifact[];
  questions: ReviewQuestionArtifact[];
  dropped: string[];
}

/** Body for `POST /api/meetings/{id}/review/resolve` (Task 14). */
export interface ResolveArtifactRequest {
  kind: "decision" | "action" | "risk" | "question";
  artifact_id: string;
  action: "approve" | "reject";
  edits: { title?: string; rationale?: string };
}

export interface DecisionInfo {
  id: string;
  title: string;
  decided_at: string | null;
  rationale: string;
  status: "proposed" | "active" | "superseded" | "revisited";
  details: Record<string, unknown>;
  supersedes_id: string | null;
  meeting_id: string | null;
  document_id: string | null;
  project: string;
  owners: string[];
  sources: string[];
}

export interface AuditEventInfo {
  id: string;
  action: string;
  actor: UserBrief | null;
  actor_type: string;
  target_type: string;
  target_id: string;
  meta: Record<string, unknown>;
  created_at: string;
}

export interface HomeData {
  greeting_name: string;
  recent_documents: DocumentSummary[];
  my_tasks: TaskInfo[];
  pending_approvals: ApprovalInfo[];
  active_agent_runs: AgentRunInfo[];
  deadlines: { title: string; date: string; document_id: string }[];
  integration_warnings: ConnectorInfo[];
  suggested_questions: string[];
}

/* ------------------------------------------------------------- interviews */

export type InterviewMode = "voice" | "text" | "quick_voice" | "quick_text";
export type InterviewPurpose =
  | "process"
  | "meeting_prep"
  | "concern"
  | "decision"
  | "expert"
  | "outcome_review"
  | "open";
export type InterviewVisibility = "named" | "confidential" | "anonymous";
export type InterviewStatus =
  | "draft"
  | "consent_required"
  | "active"
  | "paused"
  | "processing"
  | "review_required"
  | "published"
  | "discarded"
  | "failed";

export type InterviewArtifactKind =
  | "claim"
  | "process_step"
  | "process_exception"
  | "workaround"
  | "risk"
  | "friction"
  | "idea"
  | "decision"
  | "decision_alternative"
  | "decision_rationale"
  | "dissent"
  | "assumption"
  | "success_metric"
  | "action_item"
  | "open_question"
  | "expert_heuristic"
  | "lesson"
  | "entity_relationship"
  | "meeting_topic"
  | "meeting_reflection";

export interface InterviewTurnInfo {
  id: string;
  seq: number;
  role: "interviewer" | "employee" | "system";
  text: string;
  edited: boolean;
  transcription_confidence: number | null;
  reason: string | null;
  created_at: string;
}

export interface InterviewerEnvelope {
  message: string;
  question: string | null;
  reason: string;
  can_complete: boolean;
  unresolved_fields: string[];
  sensitive_warning: string | null;
}

export interface InterviewArtifactInfo {
  id: string;
  kind: InterviewArtifactKind;
  summary: string;
  details: Record<string, unknown>;
  confidence: number;
  provenance: "firsthand" | "hearsay" | "unknown";
  selected: boolean;
  employee_edited: boolean;
  uncertain: boolean;
  supporting_turn_ids: string[];
  excerpt: string;
  published_target_type: string | null;
  published_target_id: string | null;
}

export interface InterviewDestination {
  artifact_id: string;
  kind: InterviewArtifactKind;
  label: string;
  target_type: "document" | "feedback" | "decision" | "task" | "meeting";
  target_id: string;
}

export interface InterviewSessionInfo {
  id: string;
  status: InterviewStatus;
  mode: InterviewMode;
  purpose: InterviewPurpose;
  visibility: InterviewVisibility;
  title: string;
  meeting_id: string | null;
  entity_id: string | null;
  decision_id: string | null;
  consent_at: string | null;
  audio_retention_policy: "delete_after_transcription" | "retain_with_consent";
  transcript_retention_policy: string;
  started_at: string | null;
  completed_at: string | null;
  published_at: string | null;
  created_at: string;
  failure_code: string;
  receipt_token?: string;
  turns?: InterviewTurnInfo[];
  artifacts?: InterviewArtifactInfo[];
  interviewer?: InterviewerEnvelope;
  destinations?: InterviewDestination[];
  assignment?: InterviewAssignmentInfo;
}

export interface InterviewAssignmentInfo {
  id: string;
  purpose: InterviewPurpose;
  suggested_mode: InterviewMode;
  title: string;
  note: string;
  due_at: string | null;
  status: "open" | "completed" | "declined" | "cancelled";
  scope: "individual" | "department";
  department: string | null;
  created_by: UserBrief | null;
  created_at: string;
  /** Creator view only */
  assignee?: UserBrief | null;
  decline_reason?: string;
  response_count?: number;
}

export interface MeetingTopicInfo {
  id: string;
  kind: InterviewArtifactKind;
  summary: string;
  author: string | null;
  provenance: string;
}

export interface BrainMapData {
  deployment_profile: string;
  nodes: {
    knowledge_db: { label: string; sub: string; stats: Record<string, unknown> };
    profiles: { key: string; label: string; active: boolean; sub: string }[];
    brain: { label: string; sub: string; stats: Record<string, unknown> };
    company_info: { label: string; route: string; stats: Record<string, unknown> };
    tribal: { label: string; route: string; stats: Record<string, unknown> };
    feedback: { label: string; route: string; stats: Record<string, unknown> };
    llm_usage: { label: string; route: string; stats: Record<string, unknown> };
    agents: { label: string; route: string; stats: Record<string, unknown> };
    zero_trust: { label: string; sub: string };
    cycle: { key: string; label: string }[];
  };
}
