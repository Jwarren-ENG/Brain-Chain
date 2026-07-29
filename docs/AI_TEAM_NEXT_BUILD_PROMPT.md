# Master prompt for the entire AI team: build the Brain Interview engine

Copy everything below this line into the team orchestrator or distribute it unchanged to every participating AI agent.

---

## Mission

You are the product, engineering, AI, security, design, research, and quality team responsible for the next major BrainChain release.

Your objective is to design and implement a production-shaped **Brain Interview engine** that lets an employee speak or type naturally to the company brain, receive intelligent follow-up questions, review the knowledge extracted from the conversation, control its visibility, and deliberately publish approved information into the company’s permission-aware memory.

This is the next highest-priority product capability. Do not add unrelated dashboards, generic analytics, decorative prototypes, speculative autonomous agents, long-tail connectors, government/private editions, or broad features that do not serve this interview-to-knowledge workflow.

The repository is located at:

`/Users/jacobwarren/Brain Chain`

Read these sources before making changes:

1. `README.md`
2. `docs/product-vision-and-build-plan.md`
3. `docs/privacy-and-anonymity.md`
4. `docs/security-model.md`
5. `docs/architecture.md`
6. `SAFETY_AND_PRIVACY_RULES.md`
7. The current frontend Today, Feedback, Meetings, Ask, and shell components.
8. The backend models, serializers, permission engine, feedback service, assistant service, agent engine, and knowledge routers.

Preserve all existing permission, anonymity, citation, audit, and human-approval guarantees.

## Product strategy

Klarity uses AI observation and interviews primarily to discover and map how processes are performed. BrainChain must use interviews more broadly to capture how a company **thinks, decides, disagrees, adapts, and learns**.

The interview engine must be capable of capturing:

- how a process really works;
- where the documented process differs from reality;
- exceptions and workarounds;
- recurring friction and emerging risks;
- why a decision was made;
- which alternatives were considered;
- unresolved disagreement or dissent;
- cross-functional constraints;
- expert judgment that does not exist in documents;
- what an employee wants discussed before a meeting;
- what remained unsaid after a meeting;
- whether an approved plan was implemented correctly;
- whether an intervention worked, failed, or produced mixed results;
- what the organization should remember for the future.

The differentiation is not “we also have AI interviews.” The differentiation is the complete learning loop:

`interview → employee review → permissioned knowledge → decision → approved plan → execution → measured outcome → reusable lesson`

The product must feel safe and useful to the interviewed employee, not merely useful to management.

## Product name and interface language

Use **Brain Interview** as the initial feature name.

Primary employee-facing invitation:

> Tell the company brain something it should understand.

Primary actions:

- Start a voice interview
- Start a text interview
- Make a quick capture
- Continue a draft
- Review before publishing

Avoid surveillance language such as:

- “The AI learns everything about you.”
- “Employee monitoring.”
- “Productivity scoring.”
- “We know how you feel.”
- “Automatic performance evaluation.”

Use language such as:

- “Share what the company should understand.”
- “You control what is saved.”
- “Review every extracted item before it enters company memory.”
- “Your source permissions travel with what you share.”
- “Anonymous text is stored without your identity.”

## Required interview purposes

Every interview session begins with one explicit purpose. Implement these initial purpose templates:

1. **Explain a process**
   - Capture steps, participants, systems, handoffs, exceptions, workarounds, bottlenecks, and improvement ideas.

2. **Prepare for a meeting**
   - Capture desired agenda topics, needed decisions, risks, questions, objections, and relevant evidence.

3. **Share a concern or idea**
   - Capture the issue, who or what is affected, frequency, severity, suggested change, and whether follow-up is allowed.

4. **Document a decision**
   - Capture the decision, context, alternatives, rationale, affected teams, dissent, approvers, assumptions, and success measures.

5. **Capture expert knowledge**
   - Capture unwritten heuristics, diagnostic questions, known failure patterns, edge cases, and advice for a future employee or agent.

6. **Review a plan or outcome**
   - Capture intended outcome, implementation quality, observed results, unintended consequences, employee reaction, confounders, and lessons.

The purpose template provides the interviewer with a question framework but must not force a rigid survey. The interviewer should converse naturally and adapt based on what the employee has already said.

## Required modes

### Voice interview

The user speaks naturally and receives spoken or visibly rendered follow-up questions. The interface must provide:

- an explicit consent and retention screen before microphone activation;
- a clear recording indicator that is continuously visible;
- start, pause, resume, finish, restart, and delete controls;
- live or near-live transcription;
- a visible transcript the user can correct;
- the ability to switch from voice to text without losing the session;
- a defined failure state if microphone permission is denied;
- a defined recovery state after network or transcription failure;
- no hidden recording;
- no automatic publishing.

Voice sessions are never labeled anonymous. A voice can identify its speaker even if account metadata is removed.

For the first implementation, create a provider abstraction. The local/demo profile must work without external API keys by using a deterministic mock transcription stream or a supplied text transcript. A real transcription provider can be configured through environment variables, but provider secrets must never enter the browser bundle, database, repository, logs, or audit metadata.

### Text interview

The user has a focused, chat-like conversation with the interviewer. It must support:

- named visibility;
- confidential visibility;
- structurally anonymous visibility;
- draft saving;
- resuming;
- editing prior user answers before completion;
- adaptive follow-up questions;
- completion and review.

Anonymous interviews must use text only. The anonymous storage path must not write a user ID, email, employee identifier, IP-derived identity, precise timestamp, or reversible identity mapping into the interview record or artifacts.

### Quick capture

The user submits one thought by voice or text. The system may ask up to three high-value follow-up questions, but the user can skip them and proceed directly to review.

## Experience flow

Implement the following end-to-end state machine:

1. `draft`
2. `consent_required` for voice
3. `active`
4. `paused` for voice
5. `processing`
6. `review_required`
7. `published`
8. `discarded`
9. `failed`

Only valid state transitions are allowed. Enforce them in backend service logic, not only in the frontend.

### Step 1: Entry

Add a prominent action on the Today page:

> Talk to the Brain

Supporting text:

> Explain a process, share a concern, prepare for a meeting, or capture something only you know.

The employee chooses Voice, Text, or Quick Capture and then chooses a purpose.

Do not add another top-level navigation item unless usability testing proves it necessary. The simple primary navigation must remain intact. A direct `/interviews` route may exist for drafts and history, but entry should be contextual from Today, Meetings, Feedback, Decision Memory, and later plan retrospectives.

### Step 2: Context and visibility

Ask the employee to select optional context:

- meeting;
- project;
- team;
- process;
- decision;
- plan or agent run.

Then choose visibility:

- **Named:** the employee is attributed and may receive follow-up.
- **Confidential:** identity is retained only within the protected follow-up service and must not appear in ordinary manager-facing products.
- **Anonymous text:** no identity is stored. Manager-facing access remains aggregate-only and subject to cohort protection.

Explain the practical consequences before the interview begins.

### Step 3: Adaptive conversation

The interviewer should:

- ask one clear question at a time;
- acknowledge the employee’s answer without excessive praise;
- avoid repeating information already provided;
- ask for examples when a claim is vague;
- distinguish firsthand knowledge from hearsay;
- ask what evidence may exist;
- identify affected teams and objectives;
- ask about exceptions and counterexamples;
- surface uncertainty and disagreement;
- never pressure a user to reveal protected, personal, medical, legal, or unrelated information;
- never promise anonymity in a voice session;
- never make an employment judgment;
- allow the employee to skip any question;
- provide a visible “Finish and review” action at all times.

### Step 4: Extraction

When the interview is completed, extract candidate artifacts. Supported artifact kinds:

- `claim`
- `process_step`
- `process_exception`
- `workaround`
- `risk`
- `friction`
- `idea`
- `decision`
- `decision_alternative`
- `decision_rationale`
- `dissent`
- `assumption`
- `success_metric`
- `action_item`
- `open_question`
- `expert_heuristic`
- `lesson`
- `entity_relationship`
- `meeting_topic`
- `meeting_reflection`

Each artifact must contain:

- a canonical summary;
- the original supporting turn IDs;
- source excerpts visible to the employee during review;
- confidence;
- firsthand/hearsay/unknown provenance;
- affected entities when known;
- temporal validity when relevant;
- visibility and access policy inherited from the interview;
- publication selection state;
- employee corrections;
- extraction model/provider metadata suitable for audit without raw hidden prompts.

Do not publish model-generated interpretations as verified fact. Maintain the existing typed distinction between verified information, inference, conflict, missing information, and suggested action.

### Step 5: Employee review

The review screen is mandatory. It must show plain-language cards such as:

- “The brain understood this as a fact.”
- “The brain understood this as a risk.”
- “The brain understood this as an exception.”
- “The brain understood this as a proposed decision.”

For every candidate artifact, the employee can:

- include or exclude it;
- edit the canonical summary;
- correct affected teams/projects;
- change allowed visibility where policy permits;
- mark it as uncertain;
- view the supporting transcript excerpt.

The review screen must also show:

- where approved information will appear;
- who can access it;
- whether the transcript will be retained;
- whether raw audio will be retained;
- how to delete the session later.

Nothing enters ordinary company knowledge, decision memory, meeting memory, or feedback aggregation until the employee explicitly presses **Publish approved knowledge**.

### Step 6: Publishing

Publishing should route artifacts to the correct memory layer:

- process artifacts → process/tribal knowledge;
- meeting topics → meeting preparation;
- meeting reflections → protected feedback/outcome memory;
- decisions, alternatives, rationale, and dissent → decision memory;
- risks, friction, and concerns → protected human-signal pipeline based on visibility;
- expert heuristics and lessons → company knowledge with citations;
- actions → draft tasks requiring appropriate confirmation or approval;
- outcome reviews → plan/outcome memory.

Every published artifact must preserve a citation back to the interview or an allowed redacted source representation. Anonymous manager-facing products must never expose a transcript citation that could reveal the author.

## Backend and data architecture

Follow the repository’s existing FastAPI, SQLAlchemy, Pydantic, serializer, router, service, migration, and audit patterns.

### Minimum entities

Design and migrate production-shaped equivalents of:

#### InterviewSession

- `id`
- `org_id`
- nullable `user_id` only for named/confidential sessions
- `receipt_token` for anonymous sessions
- `purpose`
- `mode` (`voice`, `text`, `quick_voice`, `quick_text`)
- `visibility` (`named`, `confidential`, `anonymous`)
- `status`
- `title`
- optional context IDs: meeting, project/entity, decision, agent run, plan
- `consent_at`
- `audio_retention_policy`
- `transcript_retention_policy`
- `started_at`
- `completed_at`
- `reviewed_at`
- `published_at`
- coarse anonymous creation date when required
- failure code safe for user display
- provider metadata without secrets

#### InterviewTurn

- `id`
- `session_id`
- sequence number
- `role` (`interviewer`, `employee`, `system`)
- text
- optional timing fields
- transcription confidence
- whether the employee edited the text
- redaction markers
- no independent broader permission than the parent session

#### InterviewArtifact

- `id`
- `session_id`
- `kind`
- canonical text
- structured details JSON
- confidence
- provenance type
- selected for publication
- employee-edited flag
- published target type and ID
- supporting turn IDs
- access/visibility data

#### AudioAsset or provider reference

Only create this if audio retention is enabled. Default to deleting raw audio after successful transcription unless an organization policy explicitly requires retention and the employee consents. Never store binary audio directly in the relational database. Model object storage with encryption and deletion support.

### Required API surface

Implement coherent REST endpoints consistent with current API conventions, including equivalents of:

- `POST /interviews`
- `GET /interviews`
- `GET /interviews/{id}`
- `DELETE /interviews/{id}`
- `POST /interviews/{id}/consent`
- `POST /interviews/{id}/turns`
- `PATCH /interviews/{id}/turns/{turn_id}`
- `POST /interviews/{id}/pause`
- `POST /interviews/{id}/resume`
- `POST /interviews/{id}/complete`
- `GET /interviews/{id}/artifacts`
- `PATCH /interviews/{id}/artifacts/{artifact_id}`
- `POST /interviews/{id}/publish`
- a transcription upload/stream adapter appropriate for the selected implementation

Do not expose an endpoint that returns individual anonymous interviews to managers, executives, administrators, or ordinary audit viewers. Security administrators may audit event metadata but must not receive anonymous authorship because it does not exist.

### Service boundaries

Create explicit services for:

- interview state transitions;
- interviewer response generation;
- transcription provider abstraction;
- artifact extraction;
- employee review updates;
- publishing/routing artifacts;
- retention and deletion propagation;
- anonymous/confidential protection.

Do not put complex workflow rules directly in route handlers.

### Shared frontend types

Add fully typed shared interfaces for session summary, session detail, turn, artifact, consent configuration, retention policy, and API responses in `packages/shared`.

## Interviewer and extraction architecture

The interview system is two different AI jobs and must remain separable:

1. **Interviewer:** chooses the next helpful question.
2. **Extractor:** converts the completed conversation into reviewable candidate artifacts.

Do not let the interviewer silently publish knowledge. Do not let the extractor create facts without source-turn references.

### Interviewer input

- interview purpose;
- current visibility/mode;
- selected company context the user is authorized to access;
- prior turns;
- purpose-specific question framework;
- safety rules;
- maximum interview length;
- known gaps already detected.

### Interviewer output

Use a validated structured envelope:

- response text;
- next question;
- reason category for the question;
- detected sensitive-content warning if any;
- whether sufficient information exists to offer completion;
- unresolved fields for the chosen purpose.

Do not expose hidden reasoning. A short user-facing explanation such as “I’m asking because this sounds like an undocumented exception” is acceptable.

### Deterministic local provider

The demo must work offline. Implement a deterministic local interviewer that selects sensible follow-ups from the purpose framework based on simple extracted fields or keywords. Implement deterministic artifact extraction for seeded acceptance conversations. Keep the provider interfaces compatible with a configurable external model gateway.

### Evaluation

Create fixtures and tests measuring:

- question relevance;
- repeated-question rate;
- required-field coverage by purpose;
- artifact precision;
- artifact citation completeness;
- correct firsthand/hearsay classification;
- sensitive-content avoidance;
- permission inheritance;
- anonymous-data separation;
- deletion propagation;
- employee correction preservation;
- unsupported-fact rate.

## Privacy, security, and employee trust requirements

These are release-blocking requirements.

1. Voice cannot be anonymous.
2. Microphone activation requires explicit consent.
3. Recording state is always visibly indicated.
4. Raw audio defaults to deletion after transcription.
5. Anonymous text sessions store no author identity.
6. Confidential identities never appear in manager-facing outputs.
7. Interview artifacts never gain broader access than their source.
8. Source ACL checks happen before context is provided to the interviewer.
9. Publication requires employee review and affirmative action.
10. Deleting a session propagates to transcript, artifacts, audio, embeddings, caches, derived unpublished objects, and any permitted published object according to documented retention semantics.
11. No customer data trains shared models.
12. No hidden employee scoring, emotion recognition, or performance ranking.
13. No medical, protected-class, union, personal-life, or unrelated sensitive inference.
14. Audit logs record actions and identifiers but avoid raw transcript text by default.
15. Rate limits and query protections prevent anonymous differencing attacks.
16. Anonymous artifacts that enter feedback aggregation remain subject to the configured minimum cohort.
17. The interface must explain limitations honestly, including that free text may self-identify a person.

Update the threat model and privacy documentation for microphone misuse, accidental bystander capture, voice biometric identifiability, transcript leakage, prompt injection inside spoken content, malicious uploaded audio, model extraction errors, anonymous self-identification, and deletion failures.

## Frontend requirements

Follow the existing Next.js, React Query, shared component, token, accessibility, and responsive design patterns.

### Required screens/components

1. Today-page Talk to the Brain entry card.
2. Interview start dialog/page with mode and purpose selection.
3. Visibility and context selection.
4. Voice consent screen.
5. Voice interview workspace.
6. Text interview workspace.
7. Quick capture workspace.
8. Processing state.
9. Artifact review screen.
10. Publish confirmation and destination summary.
11. Draft/history page.
12. Session deletion flow.
13. Contextual launch from Meetings.

### Voice workspace

Must show:

- session purpose;
- recording indicator;
- elapsed time;
- microphone state;
- live transcript;
- current AI question;
- pause/resume;
- switch to text;
- finish and review;
- discard;
- retention reminder.

Do not create a fake decorative waveform as the only recording signal. If a waveform is shown, it must accompany explicit text and icon state.

### Text workspace

Use the product’s simple chat language, but distinguish it from ordinary Ask-the-Brain chat. This conversation is contributing knowledge, not merely retrieving it. Keep the selected purpose, visibility, and “You control what is saved” visible.

### Review workspace

Optimize for comprehension, not density. Group artifacts by kind. Default to including high-confidence direct statements and clearly mark inferences. Let the employee edit without opening raw JSON.

### Responsive and accessible behavior

- Verify at 1440px, 1024px, 768px, and 390px widths.
- No horizontal overflow.
- Full keyboard operation.
- Correct labels for microphone, recording, pause, deletion, artifact selection, and visibility controls.
- Do not rely on color alone.
- Use focus management for dialogs and major state changes.
- Provide reduced-motion behavior.
- Provide text alternatives to any audio visualization.

## Integration requirements

### Today

Add the interview entry without overwhelming the existing simple command center.

### Meetings

“Add a topic or concern” should offer quick text, text interview, or named voice interview. Meeting reflections should use the same engine with the meeting-reflection purpose template.

### Feedback

Employees sharing a complex concern can choose “Help me explain this” to launch an interview. Preserve feedback visibility semantics and anonymity rules.

### Decision memory

Allow an authorized participant to start a decision-documentation interview. Published decision artifacts should remain proposals until a person with the appropriate authority confirms the decision record.

### Ask the Brain

Authorized published interview artifacts can later appear in retrieval results with citations. Answers must explain when the source is employee-contributed, inferred, confidentially aggregated, or anonymous aggregate information.

## Team structure and ownership

The team lead must assign explicit file ownership before parallel editing. Avoid two agents editing the same file simultaneously. Coordinate contracts first, then implement in parallel.

### Workstream A: Product and UX

Own:

- final user journeys;
- purpose templates;
- interface copy;
- error/recovery behavior;
- employee trust explanations;
- accessibility review;
- visual acceptance checklist.

Deliver before frontend implementation:

- state-by-state screen specification;
- component inventory;
- exact visibility and retention copy;
- voice permission-denied flow;
- transcript-failure flow;
- publish and deletion confirmations.

### Workstream B: Backend and data model

Own:

- migrations;
- models;
- serializers;
- state machine;
- routers;
- service boundaries;
- retention/deletion logic;
- publishing transaction semantics;
- shared API contracts with frontend.

Deliver the API and state tests before UI integration is declared complete.

### Workstream C: AI interviewer and extraction

Own:

- purpose frameworks;
- interviewer provider contract;
- deterministic local interviewer;
- model-gateway adapter;
- extraction contract;
- deterministic demo extraction;
- artifact validation;
- evaluation fixtures and metrics.

Do not weaken provenance or permission checks for convenience.

### Workstream D: Voice and media platform

Own:

- browser microphone lifecycle;
- consent enforcement;
- audio buffering/upload or streaming design;
- transcription provider interface;
- local mock path;
- retention/deletion;
- failure recovery;
- audio security review.

Coordinate closely with security before choosing retention defaults.

### Workstream E: Frontend

Own:

- Today entry;
- interview start flow;
- voice/text workspaces;
- React Query mutations and state handling;
- review and publish screens;
- drafts/history;
- meeting and feedback integration;
- responsive behavior;
- component tests.

Do not hardcode successful API results or bypass the backend state machine.

### Workstream F: Security and privacy

Own:

- threat model;
- privacy review;
- anonymous storage audit;
- confidential-access tests;
- ACL inheritance;
- prompt-injection defenses;
- retention/deletion verification;
- audit-event policy;
- release sign-off.

Security may block release for any violated requirement above.

### Workstream G: Quality, evaluation, and documentation

Own:

- acceptance test automation;
- adversarial tests;
- end-to-end test script;
- build/lint/type/test gates;
- documentation updates;
- demo personas and fixtures;
- pilot instrumentation plan.

## Required implementation sequence

### Phase 0: Contract and design alignment

Before broad implementation:

1. Agree on the state machine.
2. Agree on entities and API payloads.
3. Agree on visibility and retention semantics.
4. Agree on artifact types.
5. Agree on publishing destinations.
6. Assign file ownership.
7. Write failing contract/privacy tests for critical invariants.

Do not allow the frontend, backend, and AI workstreams to invent incompatible schemas independently.

### Phase 1: Text vertical slice

Deliver first:

- named text interview;
- deterministic adaptive questions;
- completion;
- artifact extraction;
- employee review;
- publication into permissioned knowledge;
- citation back to the interview;
- deletion.

This vertical slice must be usable end to end before adding voice complexity.

### Phase 2: Confidential and anonymous text

Add:

- confidential identity separation;
- anonymous session creation with receipt token;
- no account-linked history for anonymous interviews;
- aggregate-only publication path;
- cohort enforcement;
- adversarial privacy tests.

### Phase 3: Voice

Add:

- consent;
- microphone lifecycle;
- mock transcription path;
- configurable real-provider adapter;
- transcript correction;
- pause/resume;
- switch to text;
- deletion and retention enforcement;
- permission-denied and provider-failure recovery.

### Phase 4: Contextual integrations

Add Today, Meetings, Feedback, Decision Memory, and Ask-the-Brain integration only after the base engine works.

### Phase 5: Evaluation and pilot readiness

Run the full evaluation suite, visual QA, security review, documentation update, and pilot instrumentation review.

## Acceptance workflows

All workflows below must work in the local seeded demo without external services.

### Workflow 1: Named process interview

Avery starts a named text interview to explain the supplier qualification process. The AI asks about steps, exceptions, engineering/procurement handoffs, and failure points. Avery finishes, corrects one extracted step, excludes one weak inference, and publishes the rest. Avery can later ask the brain about the process and receive an answer citing the approved interview knowledge.

### Workflow 2: Anonymous concern

Avery starts an anonymous text interview about workload. The interview record contains no Avery user ID. The AI asks limited, non-identifying follow-ups. Published output enters the protected feedback pipeline. Morgan cannot retrieve the individual interview or transcript. Morgan sees a theme only if the minimum cohort is met.

### Workflow 3: Voice expert capture

Morgan starts a named voice expert-knowledge interview. Microphone access requires explicit consent. The recording state is visible. The local demo produces a deterministic transcript. Morgan corrects the transcript, finishes, reviews heuristics and exceptions, and publishes selected items. Raw audio is deleted under the default policy.

### Workflow 4: Voice cannot be anonymous

The UI does not offer anonymous visibility for voice. A direct API attempt to create an anonymous voice session is rejected with a clear validation error and no record is created.

### Workflow 5: Meeting preparation

From the Phoenix meeting page, Morgan starts a text interview to add a complex topic. Approved meeting-topic artifacts appear in the meeting preparation context. Named artifacts show attribution; anonymous text artifacts do not.

### Workflow 6: Decision documentation

Jordan conducts a decision interview. The system extracts the proposed decision, alternatives, rationale, dissent, assumptions, and success metrics. Publication creates a draft decision record requiring confirmation by an authorized person rather than marking it final automatically.

### Workflow 7: Deletion

A user deletes a draft voice session. Its transcript, artifacts, mock audio reference, embeddings, and cached representations are removed. The audit log records deletion metadata without retaining deleted content.

### Workflow 8: Permission enforcement

An interview referencing a confidential Phoenix document may use that document only for authorized users. Published artifacts do not expose the confidential source or derived claim to unauthorized users. Existing restricted-document non-disclosure tests continue to pass.

### Workflow 9: Failure recovery

Transcription fails midway. The user retains the existing transcript, can retry, switch to text, or delete the session. No duplicate turns or partially published artifacts are created.

### Workflow 10: Employee review is mandatory

Attempting to publish directly from `active` or `processing` is rejected. Only a reviewed session with selected artifacts can be published.

## Test requirements

Add backend tests for:

- every state transition;
- invalid state transitions;
- anonymous voice rejection;
- consent enforcement;
- anonymous identity absence;
- confidential identity isolation;
- manager access denial;
- artifact ACL inheritance;
- review-before-publish;
- duplicate publication protection;
- transactional publishing rollback;
- deletion propagation;
- retention policies;
- transcript editing;
- source-turn citation requirements;
- meeting/decision routing;
- audit metadata rules;
- existing permission regressions.

Add frontend tests for:

- mode and purpose selection;
- visibility rules;
- voice consent;
- recording state labels;
- pause/resume controls;
- permission-denied recovery;
- text conversation;
- finishing and processing;
- artifact inclusion/editing;
- publish confirmation;
- deletion confirmation;
- mobile navigation and no-overflow behavior.

Required final gates:

```bash
cd apps/api
../../.venv/bin/python -m pytest
../../.venv/bin/python -m ruff check .

cd ../..
pnpm --filter @brainchain/web typecheck
pnpm --filter @brainchain/web lint
pnpm --filter @brainchain/web test
pnpm --filter @brainchain/web build
```

Run build and standalone typecheck sequentially because both may interact with generated Next.js type files.

## Definition of done

The feature is complete only when:

1. A user can finish the named text vertical slice end to end.
2. Anonymous text is structurally anonymous and cohort protected.
3. Voice requires consent and cannot be labeled anonymous.
4. The local demo works without external API keys.
5. Employee review is mandatory before publication.
6. Published artifacts are permission-aware and source-cited.
7. Deletion and retention behavior is implemented and tested.
8. Meeting preparation uses the shared interview engine.
9. Desktop and mobile experiences pass visual and accessibility review.
10. All existing tests and the new interview tests pass.
11. Architecture, API, privacy, threat-model, connector/provider, and demo documentation are current.
12. No release-blocking security or privacy issue remains.

## Team operating protocol

The lead orchestrator maintains one shared plan with one owner per work item and explicit dependencies. Every team update must use this format:

### Status update

- **Workstream:**
- **Owner:**
- **State:** pending / in progress / blocked / complete
- **Completed since last update:**
- **Evidence:** files, tests, screenshots, or API results
- **Decisions made:**
- **Risks or privacy concerns:**
- **Dependency needed next:**
- **Next concrete action:**

Do not report completion based only on files being written. Completion requires relevant tests and observable evidence.

When a design or architecture choice is ambiguous:

1. Prefer the choice that gives the employee more control.
2. Prefer structural privacy over policy promises.
3. Prefer a smaller end-to-end vertical slice over broad partial scaffolding.
4. Prefer explicit citations and uncertainty over confident synthesis.
5. Prefer a provider abstraction and deterministic local path over mandatory external services.
6. Preserve the simple employee interface.

## Final team deliverable

When the entire feature is finished, provide one consolidated release report containing:

- product outcome;
- implemented user journeys;
- architecture and migration summary;
- privacy and security controls;
- model/transcription provider behavior;
- API surface;
- files changed;
- tests and exact results;
- visual QA results;
- known limitations;
- pilot instrumentation;
- the next recommended milestone.

Begin with Phase 0. Do not skip contract alignment or privacy tests. Then build the named text vertical slice before voice.

---

End of team prompt.
