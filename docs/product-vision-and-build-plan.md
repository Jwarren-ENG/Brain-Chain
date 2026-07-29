# Company Brain: commercial product vision and build plan

**Status:** commercial-first product definition  
**Scope:** one product for mid-market and enterprise organizations. Government and private/personal editions are explicitly deferred.

## 1. The product in one sentence

Company Brain is a living, permission-aware model of how a company thinks and works. It combines connected company systems, explicit employee input, meetings, decisions, plans, and measured outcomes so every employee can make better decisions and managers can improve the organization without losing trust.

This is not just enterprise search, a chatbot over documents, an employee survey product, or an autonomous-agent platform. Those are surfaces on top of one shared operating memory.

## 2. The core promise

Every employee should be able to ask:

- What does the company know about this decision?
- What are engineering, finance, supply chain, and the affected business lines optimizing for?
- What changed, what conflicts, and what is still unknown?
- What did we try before, why did we try it, and did it work?
- What does my manager need me to prioritize now?

Every manager should be able to ask:

- What are people experiencing that is not being said in the room?
- Is this problem local to my team or appearing across the hierarchy?
- Which plan is most likely to improve the outcome, and what evidence supports it?
- Was the approved plan actually implemented, and did it help?

The company should gain a compounding memory of facts, relationships, decisions, procedures, exceptions, experiments, and outcomes.

## 3. Why now and where the market is going

Y Combinator's 2026 Company Brain request frames the missing layer as a living map of how a company works, not company-wide search or a chatbot over documents. It calls for fragmented knowledge to be structured, kept current, and turned into executable skills that AI systems can use safely.

The market is already forming around pieces of that thesis:

- [Hyper](https://www.ycombinator.com/companies/hyper-4) focuses on a self-maintaining knowledge graph that feeds company context back into AI tools.
- [Hyperspell](https://www.ycombinator.com/companies/hyperspell) focuses on a live, permissioned context graph for agents with source traceability.
- [Klarity](https://www.ycombinator.com/companies/klarity) maps how work and approvals happen, then reallocates work between people and agents.
- [YC's Company Brain RFS](https://www.ycombinator.com/rfs) describes the opportunity as the layer between raw company data and reliable AI automation.

Company Brain should not try to win by being a broader connector catalog. Its wedge is the closed organizational learning loop:

> listen to people and systems → connect signals through the organization → recommend a plan → require approval → track execution → measure the outcome → preserve the lesson

The differentiated asset is outcome-linked decision memory: not merely what the company knows, but what it tried, under which conditions, and whether it worked.

## 4. Product principles

### 4.1 One simple front door

The normal employee experience has five primary destinations:

1. **Today** — a personalized view of what deserves attention.
2. **New chat** — a Codex-like conversation with the company brain.
3. **Share feedback** — an always-open voluntary input channel and assigned surveys.
4. **Meetings** — contribute before a meeting and reflect afterward.
5. **My work** — priorities, tasks, requested follow-up, and approvals.

Knowledge browsing is secondary. Team signals, plans, agents, integrations, governance, and audit are visible only to the roles that need them.

### 4.2 Earn truth; do not demand surveillance

The system should never claim that it “knows everything about an employee.” That framing will destroy adoption and invites harmful people analytics. The product learns company work context while preserving purpose limits:

- Voluntary feedback is distinct from observed system activity.
- Anonymous feedback is structurally anonymous, not merely hidden in the interface.
- Individual performance scoring, covert emotion inference, keystroke monitoring, and hidden employee ranking are out of scope.
- Workload and capacity suggestions use transparent team-level evidence and remain reviewable by people.
- Employees can see what sources shaped an answer and which data the system holds about them.

Trust is not a policy page. It is a product behavior visible in every answer, survey, meeting, and recommendation.

### 4.3 Permissions travel with the data

Connecting a source does not make it universally readable. The brain must preserve source permissions at the document, record, and derived-claim level. A user cannot retrieve, summarize, infer, or inspect evidence they could not access upstream.

### 4.4 Evidence before confidence

Every material answer separates:

- verified fact;
- model inference;
- conflicting source;
- missing information;
- recommendation;
- proposed action.

Recommendations cite the underlying evidence and identify which departments or objectives are affected.

### 4.5 Autonomy grows through measured trust

Agents begin in suggestion or dry-run mode. External writes require scoped approval. More autonomy is earned for a specific action type only after the system demonstrates predictable execution and acceptable outcomes.

## 5. The company model

The company brain is not one fine-tuned model. It is a governed system of records and models.

### 5.1 Six linked memory layers

1. **Source memory**
   - Original records from Slack, Teams, email, Zoom, Jira, Confluence, OneDrive, ERP, CRM, and internal databases.
   - Immutable lineage, source ACL, version, retention class, and sync cursor.

2. **Company graph**
   - People, teams, reporting lines, business lines, projects, goals, suppliers, customers, systems, policies, and relationships.
   - Effective-dated edges so reorganizations do not rewrite history.

3. **Claim memory**
   - Atomic facts extracted from sources with validity windows, confidence, citations, and conflict groups.
   - Example: “Phoenix readiness review is Oct 2” linked to the two sources that agree and the one source that says Sep 12.

4. **Decision and process memory**
   - Decisions, rationale, alternatives, approvers, procedures, exceptions, skills, and reusable workflows.
   - This is the executable “how the company works” layer described in the YC thesis.

5. **Human signal memory**
   - Named, confidential, and anonymous employee input; survey responses; pre-meeting topics; post-meeting reflections.
   - Anonymous raw text lives in a separately controlled privacy boundary. Manager products consume only thresholded aggregates.

6. **Outcome memory**
   - Plans, interventions, task execution, metrics before and after, employee reaction, confounders, and retrospective judgment.
   - This lets the brain learn which actions worked under which organizational conditions.

### 5.2 Hierarchy-aware signal propagation

Reporting structure and business lines should be represented as effective-dated graph edges:

`employee → team → manager → function → business line → executive owner → company`

Signal roll-up follows strict rules:

- A manager sees only an aggregate for an eligible cohort.
- A parent manager receives the aggregate of eligible child cohorts, not the raw submissions used to produce it.
- The same issue can be clustered across business lines without revealing which small team produced it.
- Filters that would shrink a cohort below its privacy threshold return suppression, not data.
- Time windows are coarsened and query budgets prevent differencing attacks.
- Themes carry prevalence, direction, confidence, and representative redacted excerpts—never a guessed author.

The product should explain this flow to employees in plain language: “Your input can move upward as a protected pattern, never as your identity.”

## 6. Model strategy

### 6.1 Do not start by training a company LLM

Fine-tuning is a poor first mechanism for changing facts, permissions, deletions, or auditability. The first production architecture should use retrieval-augmented generation over the permissioned memory layers. Fine-tuning can later improve stable behaviors such as company writing style, classification, or workflow selection, but should not be the canonical store of company facts.

### 6.2 Runtime answer path

1. Authenticate the user and resolve role, group, project, region, and source entitlements.
2. Classify the request by intent, risk, and required tools.
3. Plan retrieval across claim, graph, decision, outcome, and source memory.
4. Apply access filters before semantic retrieval and again before returning evidence.
5. Retrieve diverse evidence, including potentially conflicting and stale sources.
6. Synthesize an answer with typed segments and citations.
7. Run policy, privacy, and grounding checks.
8. Return the answer, uncertainty, affected objectives, and optional next actions.
9. Log metadata and evidence identifiers without storing sensitive raw prompts by default.

### 6.3 Ingestion and synthesis path

1. Receive incremental source events.
2. Normalize content, identity, ACLs, timestamps, and retention.
3. Scan for secrets, regulated data, and deletion obligations.
4. Chunk content while preserving structural boundaries.
5. Extract entities, claims, decisions, tasks, risks, procedures, and relationships.
6. Link extracted objects to the company graph.
7. Detect duplicates, supersession, conflicts, and staleness.
8. Produce embeddings and sparse indexes.
9. Run source-specific and end-to-end quality evaluations.
10. Publish only after lineage and access metadata are complete.

### 6.4 Separate model jobs

Use different evaluated models or routes for:

- extraction and classification;
- embedding and reranking;
- conversational synthesis;
- long-context meeting analysis;
- feedback theme clustering and redaction;
- planning and tool selection;
- outcome analysis;
- safety and policy checks.

A single frontier model may initially perform several jobs, but the interfaces and evaluations should stay separate so cost, privacy, and quality can be optimized independently.

### 6.5 Evaluation suite

Before pilots, build repeatable tests for:

- permission leakage and inference leakage;
- citation precision and citation completeness;
- conflict recall;
- temporal freshness and superseded-fact handling;
- retrieval precision/recall by connector;
- meeting decision/action extraction;
- anonymous feedback cohort enforcement;
- theme stability and redaction quality;
- plan feasibility and action safety;
- outcome attribution calibration;
- deletion propagation from source through indexes and caches.

The system should prefer “I do not have enough authorized evidence” over a polished unsupported answer.

## 7. Meeting loop

### Before

- Import the calendar event, agenda, attendee permissions, relevant project changes, unresolved actions, and prior decisions.
- Let each attendee submit a topic, question, concern, or desired decision by name or anonymously.
- Cluster overlapping topics and produce a ranked draft agenda.
- Generate a private attendee brief using only evidence that attendee may access.

### During

- Record only when the organization and participants have authorized it.
- Transcribe with speaker labels and mark decisions, rationale, owners, deadlines, risks, objections, and unresolved questions.
- Let the facilitator confirm consequential decisions rather than silently treating model extraction as final.

### After

- Ask attendees whether the decision was clear, whether concerns were addressed, and what remained unsaid.
- Publish a permission-aware recap and create draft tasks.
- Require approval before writing tasks or messages into external systems.
- Revisit the meeting when deadlines pass and connect execution results back to the decision.

## 8. Plan-to-outcome loop

Every proposed organizational change becomes a structured experiment:

- problem statement and affected cohort;
- evidence and baseline metrics;
- objective and guardrail metrics;
- proposed actions, owners, cost, and dependencies;
- approvals and dissent;
- rollout stages;
- implementation telemetry;
- pulse and qualitative feedback;
- outcome measurement window;
- retrospective: worked, failed, mixed, or inconclusive;
- reusable lessons and conditions.

Agents may draft and coordinate this loop. Humans own consequential approval, labor decisions, policy changes, external communications, and budget commitments.

## 9. Cross-company learning

Do not share raw customer records, embeddings, free text, named entities, rare combinations, or model weights trained on identifiable tenant data. “Anonymous” is not a sufficient technical claim for enterprise data sharing.

The safer progression is:

1. **Opt-in benchmark reports** using minimum cohort and tenant thresholds.
2. **Curated playbook exchange** where a customer approves an abstracted intervention template.
3. **Differentially private aggregate learning** for common patterns with explicit privacy budgets.
4. **Federated or confidential-compute training** only if a later use case justifies the complexity.

An exported playbook contains a generalized problem, organizational conditions, intervention, metrics, results band, and confidence. It excludes names, exact dates, customer-specific systems, proprietary text, and small-cohort attributes. A privacy review and a customer approver gate every export.

Discounts can reward participation, but consent must be separately revocable and cannot be bundled into ordinary service acceptance.

## 10. Commercial MVP

### Pilot wedge

Start with 100–1,000 person organizations in project-heavy, cross-functional environments where decisions span engineering, finance, operations, and supply chain. Sell a 10–12 week design pilot around one business line and one measurable operating problem.

### Included

- SSO/SCIM and organization hierarchy sync.
- Slack or Teams, Jira, Confluence or OneDrive, Zoom or Teams Meetings.
- Permission-aware chat with citations and conflict handling.
- Always-open anonymous/confidential/named feedback.
- Pre-meeting input, recap, confirmed decisions, and task drafts.
- Manager theme roll-ups across the reporting hierarchy.
- One plan-to-outcome workflow with human approvals.
- Admin access review, audit, retention, and deletion controls.

### Deferred

- General autonomous execution without approvals.
- Individual performance scoring or automated employment decisions.
- A marketplace of customer-derived playbooks.
- Customer-specific fine-tuned fact models.
- Government and personal/private editions.
- Dozens of long-tail connectors.

### Pilot success metrics

- At least 60% weekly active use in the pilot cohort.
- At least 35% weekly voluntary pulse participation without manager chasing.
- 70% of recurring meetings receive pre-meeting input.
- 90% of confirmed decisions have an owner and follow-up date.
- 30% reduction in time spent finding context or preparing recurring meetings.
- Citation correctness above the agreed target on a customer-authored eval set.
- Zero permission leaks and zero anonymity threshold violations.
- One measurable intervention with an attributable operating improvement.

## 11. Hiring sequence

### Founding team: first 4–5 people

1. **Founder/CEO or product founder** — enterprise discovery, product judgment, design partners, trust narrative, and sales.
2. **Founding AI/platform engineer** — retrieval, knowledge/claim graph, model routing, evaluation, and agent runtime.
3. **Founding full-stack/product engineer** — employee experience, meeting workflows, integrations, and rapid pilot iteration.
4. **Founding security/data infrastructure engineer** — identity, permissions, audit, retention, privacy boundaries, and enterprise deployment.
5. **Product designer or unusually design-strong product engineer** — simple front door, employee trust, accessibility, and manager information architecture.

The platform and security roles should be first-class hires, not postponed until procurement asks for them.

### After two credible design partners

- Forward-deployed engineer for connector and workflow adaptation.
- Applied scientist or ML engineer for graph extraction, feedback clustering, and outcome evaluation.
- Enterprise product lead or customer success lead who can turn pilot learning into a repeatable deployment.
- Security/compliance lead for SOC 2, vendor review, privacy impact assessments, and customer control mapping.

### After repeatable pilots

- Integration engineers.
- Site reliability/platform engineer.
- Enterprise account executive with technical workflow sales experience.
- Privacy counsel or dedicated privacy lead before cross-company learning ships.

## 12. Ninety-day execution plan

### Days 0–30: trustable memory

- Choose one pilot workflow and four connectors.
- Add SSO/SCIM and effective-dated organization hierarchy.
- Implement permission-filtered hybrid retrieval and deletion propagation.
- Create a customer-authored truth set and adversarial permission tests.
- Instrument citation precision, freshness, and retrieval failure.

### Days 31–60: human signal and meetings

- Ship always-open feedback with structural anonymity and cohort roll-up.
- Add pre-meeting input, recording consent, extracted recap, and confirmation.
- Link decisions and action items to source evidence.
- Run employee trust interviews, not only buyer interviews.

### Days 61–90: measured action

- Select one recurring organizational problem.
- Let the brain propose a plan with evidence, assumptions, and metrics.
- Approve and execute in dry-run or staged mode.
- Track implementation and post-change feedback.
- Produce the first outcome retrospective and reusable internal playbook.

## 13. The product test

The product is working when an employee can open a calm, simple interface and make a better decision because the company brain understands the relevant teams, history, goals, constraints, and current sentiment—and when every person affected can inspect the evidence, understand the privacy boundary, and challenge the recommendation.

The product is not working if it merely returns a plausible answer, produces another dashboard, or collects employee data without creating visible value and trust for employees themselves.
