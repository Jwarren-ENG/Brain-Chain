# Brain Interview engine

> Tell the company brain something it should understand.

Brain Interview lets an employee speak or type naturally to the company brain,
receive intelligent follow-up questions, review every piece of knowledge extracted
from the conversation, control its visibility, and deliberately publish approved
information into the permission-aware company memory.

The complete loop: **interview → employee review → permissioned knowledge →
decision → approved plan → execution → measured outcome → reusable lesson.**

This document is both the Phase-0 contract (state machine, entities, API,
semantics — agreed before implementation) and the feature reference.

---

## 1. State machine (single source of truth)

```
draft ──▶ consent_required ──▶ active ⇄ paused          (voice only states)
  │              │               │  \
  │              ▼               │   ▶ processing ──▶ review_required ──▶ published
  ▼          discarded           ▼         │                │
discarded                     discarded    ▼                ▼
                                         failed         discarded
```

| From | Allowed to |
|---|---|
| `draft` | `active` (text modes) · `consent_required` (voice modes) · `discarded` |
| `consent_required` | `active` (after consent) · `discarded` |
| `active` | `paused` (voice) · `processing` (complete) · `failed` · `discarded` |
| `paused` | `active` · `processing` · `discarded` |
| `processing` | `review_required` · `failed` |
| `failed` | `active` (recover conversation) · `processing` (retry extraction) · `discarded` |
| `review_required` | `published` · `discarded` |
| `published`, `discarded` | terminal (deletion is row removal with propagation, not a state) |

Transitions are enforced in `apps/api/app/services/interviews.py` — the frontend
never decides validity. Any invalid transition → HTTP 409. **Publishing from any
state except `review_required` is rejected** (employee review is mandatory).

## 2. Modes, visibility, purposes

- **Modes:** `voice`, `text`, `quick_voice`, `quick_text`. Quick modes ask at most
  three follow-ups and always offer immediate completion.
- **Visibility:** `named`, `confidential`, `anonymous`.
  - **Voice can never be anonymous** — enforced at session creation and on every
    update (a voice can identify its speaker regardless of metadata).
  - Anonymous sessions store **no** `user_id`, no exact timestamp (day-coarsened),
    and are reachable only through a client-held **receipt token** — they never
    appear in account-linked history.
  - Confidential sessions store `user_id` for protected follow-up only; no
    manager-facing product ever exposes it, and published artifacts carry no
    attribution.
- **Purposes** (each with a question framework, not a rigid survey):
  `process` (explain a process) · `meeting_prep` (prepare for a meeting) ·
  `concern` (share a concern or idea) · `decision` (document a decision) ·
  `expert` (capture expert knowledge) · `outcome_review` (review a plan or outcome) ·
  `open` (**just talk** — a natural conversation with reflective, varied
  acknowledgments and no checklist; the interviewer never presses a feeling
  for "a concrete example", and unmatched statements become low-confidence
  candidates the employee can simply leave unselected).

## 2b. Assignments (manager-requested interviews)

A manager or executive can **request** an interview (`InterviewAssignment`) —
addressed to one person or to a department — with a title and an optional note
shown to the employee verbatim. Employees can also start any interview
whenever they want; assignments are just an inbox, never a gate.

Rules (service-enforced, tested in `tests/test_interview_assignments.py`):

- A request is **not an order**: individual assignees can decline (optional
  reason, shown to the requester); department members can simply not respond
  (a team request is not declinable on the whole team's behalf).
- **Individual assignments can never be answered anonymously** — a cohort of
  one is not anonymous, and the API refuses to pretend otherwise (422 with an
  honest explanation). Named or confidential only.
- **Department assignments** accept any visibility. The requester sees only an
  **aggregate response count** — never who responded, never per-person status.
- The requester never gains access to the session: the owner-or-receipt rule
  is unchanged, and confidential completions show "completed" with no outputs
  listed (published knowledge stays unattributed and unlinked).
- Publishing a linked session completes an individual assignment; department
  assignments stay open and count responses.

Endpoints: `POST/GET /interview-assignments`, `GET /interview-assignments/targets`
(manager-only directory of people/departments), `POST …/{id}/decline`,
`POST …/{id}/cancel`; session creation accepts `assignment_id`.

## 3. Entities

- **InterviewSession** — org, nullable user (NULL ⇔ anonymous), receipt_token,
  purpose, mode, visibility, status, title, optional context (meeting, project
  entity, decision, agent run), consent_at, audio/transcript retention policies,
  started/completed/reviewed/published timestamps, user-safe failure_code,
  provider metadata (never secrets), interviewer memory (asked fields).
- **InterviewTurn** — session, sequence, role (`interviewer|employee|system`),
  text, optional timing, transcription confidence, employee-edited flag,
  redaction markers. Turns never carry broader permissions than their session.
- **InterviewArtifact** — session, kind (§4), canonical summary, structured
  details, confidence, provenance (`firsthand|hearsay|unknown`), selected flag,
  employee-edited flag, uncertainty flag, supporting turn IDs + excerpt,
  published target (type, id). Access inherits from the session until published.
- **AudioAsset** — object-storage reference only (never binary in the database):
  storage key, status (`recorded|transcribed|deleted`), retention policy,
  deleted_at. Default policy: **delete raw audio after successful transcription**;
  retention requires both an org policy allowing it and per-session employee
  consent.

## 4. Artifact kinds

`claim`, `process_step`, `process_exception`, `workaround`, `risk`, `friction`,
`idea`, `decision`, `decision_alternative`, `decision_rationale`, `dissent`,
`assumption`, `success_metric`, `action_item`, `open_question`,
`expert_heuristic`, `lesson`, `entity_relationship`, `meeting_topic`,
`meeting_reflection`.

Every artifact must reference the turn(s) it came from; the extractor may not
invent unsupported facts. Model-generated interpretations are labeled as
inference/uncertain, never as verified fact.

## 5. API surface (`/api/interviews`)

| Method | Path | Purpose |
|---|---|---|
| POST | `/interviews` | Create session (validates voice ≠ anonymous → 422, no record) |
| GET | `/interviews` | Caller's named+confidential sessions only (anonymous excluded by design) |
| GET | `/interviews/{id}` | Detail incl. turns/artifacts. Owner, or `?receipt=` for anonymous. Others → 404 |
| DELETE | `/interviews/{id}` | Full deletion propagation (§8) |
| POST | `/interviews/{id}/consent` | Voice consent + audio retention choice; `consent_required → active` |
| POST | `/interviews/{id}/start` | `draft → active` (text) or `draft → consent_required` (voice); returns opening question |
| POST | `/interviews/{id}/turns` | Append employee answer; returns interviewer envelope |
| PATCH | `/interviews/{id}/turns/{turn_id}` | Correct an employee/transcript turn before completion |
| POST | `/interviews/{id}/voice-chunk` | Transcription adapter (deterministic mock locally) |
| POST | `/interviews/{id}/pause` · `/resume` | Voice pause lifecycle |
| POST | `/interviews/{id}/switch-to-text` | Voice → text without losing the session |
| POST | `/interviews/{id}/complete` | `active|paused → processing → review_required` (extraction) |
| POST | `/interviews/{id}/retry` | Recover from `failed` |
| GET | `/interviews/{id}/artifacts` | Candidate artifacts for review |
| PATCH | `/interviews/{id}/artifacts/{artifact_id}` | Include/exclude, edit summary, mark uncertain |
| POST | `/interviews/{id}/publish` | `review_required → published`; transactional routing (§7) |

There is **no endpoint anywhere** that returns individual anonymous interviews to
managers, executives, administrators, or audit viewers. Security admins see audit
event metadata only — anonymous authorship cannot be produced because it is not
stored.

## 6. Interviewer & extractor (two separated AI jobs)

- **Interviewer** (`services/interviewer.py`): input = purpose framework, prior
  turns, visibility/mode, asked-field memory, safety rules, max length. Output =
  validated envelope `{message, question, reason, can_complete,
  unresolved_fields, sensitive_warning}`. One question at a time; asks for
  examples on vague claims; distinguishes firsthand from hearsay; never promises
  anonymity in voice; never pressures for protected/personal topics (sensitive
  keywords produce a gentle redirect + warning flag); the employee can always
  skip or finish. The local provider is deterministic (keyword field-coverage
  over the purpose framework) and works offline; the interface matches the model
  gateway for a future external provider.
- **Extractor** (`services/interview_extraction.py`): converts the completed
  conversation into candidate artifacts with per-turn citations, confidence,
  and provenance classification. Deterministic locally; every artifact carries
  `supporting_turn_ids` or it is rejected by validation. The interviewer can
  never publish; the extractor can never create uncited facts.

## 7. Publishing destinations

Publishing is a single transaction; partial failure rolls everything back.
Duplicate publishing is rejected (session must be `review_required`).

| Artifact kinds | Named / Confidential destination | Anonymous destination |
|---|---|---|
| `claim`, `process_step`, `process_exception`, `workaround`, `expert_heuristic`, `lesson`, `entity_relationship`, `decision_rationale`* | Knowledge `Document` (`doc_type="contribution"`, Internal, org-readable) with chunks + embeddings; named = attributed, confidential = unattributed | Not published as citable documents (stylometry risk); routed to the protected feedback pipeline |
| `meeting_topic`, `open_question` (with meeting context) | Meeting preparation topics (attributed only when named) | Meeting preparation topics, unattributed |
| `meeting_reflection` | Protected feedback pipeline with meeting tag | Same, anonymous |
| `decision` + `decision_alternative`/`dissent`/`assumption`/`success_metric` | One `Decision` row with `status="proposed"` — requires confirmation by a manager/executive before becoming active | Not available anonymously |
| `risk`, `friction`, `idea` | Feedback pipeline with the session's visibility (cohort rules unchanged) | Feedback pipeline, anonymous, cohort-protected |
| `action_item` | Draft `Task` (`source="interview"`) | Feedback pipeline (tasks need an owner) |

\* `decision_rationale` publishes with its decision when one exists in the session,
otherwise as knowledge.

Citation rules: named documents carry `meta.interview_session_id`; confidential
and all feedback-routed artifacts carry **no session linkage in any API-visible
field** — the linkage for deletion lives only on the artifact row, which only the
owner can read. Ask-the-Brain evidence labels contributions
("Employee contribution" / "unattributed employee contribution").

## 8. Retention & deletion

- Raw audio: deleted after transcription by default (`AudioAsset.status=deleted`);
  retained only with org policy + explicit employee consent.
- Transcript: retained for the owner; anonymous transcripts have no identity to
  protect but remain receipt-only.
- **Session deletion propagates** to: turns, artifacts, audio asset, published
  knowledge documents (+ versions, chunks/embeddings, citations), feedback
  submissions, *proposed* decisions, and open interview-created tasks. Confirmed
  decisions survive with their interview linkage scrubbed (they became
  organizational records through human confirmation). The audit log records the
  deletion event with counts only — no deleted content.

## 9. Privacy invariants (release-blocking, tested)

1. Voice cannot be anonymous (UI never offers it; API rejects with 422, no row).
2. Microphone flows require explicit consent before any capture.
3. Recording state is always visibly indicated (text + icon, not color alone).
4. Anonymous sessions store no author identity anywhere, including audit actors.
5. Confidential identities never appear in manager-facing outputs.
6. Artifacts never gain broader access than their source session/context.
7. Context documents pass the caller's ACL check before the interviewer sees them.
8. Publication requires employee review and an affirmative action.
9. Deletion propagates (see §8) and is verified by tests.
10. No customer data trains shared models; no scoring, emotion inference, or
    performance ranking exists in this codebase.
11. Audit events store identifiers and metadata, never transcript text.
12. Anonymous artifacts entering feedback aggregation obey the cohort minimum.
13. The UI explains limitations honestly (free text can self-identify).

## 10. Frontend surfaces

- **Today**: "Talk to the Brain" entry card (voice / text / quick capture).
- **/interviews/new**: mode → purpose → context & visibility (+ voice consent).
- **/interviews/[id]**: one workspace that renders per state — text chat, voice
  workspace (recording indicator, elapsed time, live transcript with correction,
  pause/resume, switch to text, finish, discard, retention reminder), processing,
  mandatory review (grouped artifact cards with include/exclude/edit, destination
  and access preview, retention explanation), publish confirmation, failure
  recovery.
- **/interviews**: drafts & history (named/confidential only) with delete flow.
- **Meetings**: "Add a topic or concern" offers quick text, text interview, or
  named voice; reflections use the `meeting_reflection` purpose. Prepared topics
  render from published artifacts.
- **Feedback**: "Help me explain this" launches a concern interview.
- **Decision memory**: authorized users start decision interviews; published
  decisions appear as *proposed* until confirmed.
- **Ask the Brain**: published contributions appear in retrieval with origin
  labels.

## 11. File ownership (Phase-0 assignment)

| Area | Files |
|---|---|
| Backend engine | `app/models.py` (additions), `app/services/interviews.py`, `app/routers/interviews.py`, `app/serializers.py` (additions), alembic revision |
| AI jobs | `app/services/interviewer.py`, `app/services/interview_extraction.py` |
| Voice/media | `app/services/transcription.py` |
| Publishing | `app/services/interview_publishing.py` |
| Frontend | `apps/web/app/(app)/interviews/**`, `apps/web/components/interview/**`, Today/Meetings/Feedback/tribal/ask touch-points, `packages/shared` types |
| Security tests | `tests/test_interview_privacy.py`, `tests/test_interview_state_machine.py`, `tests/test_interview_publishing.py` |
| Docs | this file + architecture/api/privacy/threat-model updates |
