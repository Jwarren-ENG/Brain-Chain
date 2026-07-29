# BrainChain

**A commercial company brain — shared intelligence for every team.**

BrainChain connects a company's structured and unstructured information, preserves the
original permissions of every record, and turns it into a living model of how the company
thinks and works. Employees use a simple front door to ask, share protected feedback,
prepare for meetings, and follow work; managers use aggregated signals and measured plans
to improve the organization.

The current product direction is **commercial-first**. Government and personal/private
editions are deferred. See [the product vision and build plan](docs/product-vision-and-build-plan.md)
for the company model, model strategy, privacy architecture, pilot scope, and hiring sequence.

The demo organization is **Helios Aerodyne**, a fictional aerospace & defense technology
company. All seed data is invented.

---

## Quick start (zero external dependencies)

Requirements: **Python 3.11+**, **Node 20+**, **pnpm**. No database server, no Docker,
no API keys needed — the dev profile uses SQLite and a fully local model provider.

```bash
# 1. Backend
python3 -m venv .venv
./.venv/bin/pip install -r apps/api/requirements-dev.txt
cd apps/api
../../.venv/bin/python -m app.seed          # create + seed the demo database
../../.venv/bin/python -m uvicorn app.main:app --port 8000   # http://localhost:8000
cd ../..

# 2. Frontend (second terminal)
pnpm install
pnpm dev:web                                 # http://localhost:3000
```

Open **http://localhost:3000** and sign in. Every seeded account uses the password
**`brainchain-demo`**:

| Account | Role | What they demonstrate |
|---|---|---|
| `avery.chen@heliosaerodyne.com` | Employee (Engineering, clearance L1) | Baseline access; cannot see confidential/restricted material |
| `morgan.reyes@heliosaerodyne.com` | Manager (Program Mgmt, L2) | Sees the confidential supply-chain assessment; feedback dashboard |
| `jordan.blake@heliosaerodyne.com` | Executive (COO, L2) | Executive insights & briefs; **no** restricted-document bypass |
| `taylor.brooks@heliosaerodyne.com` | Agent Approver + Manager (L2) | Approves/rejects agent actions (separation of duties enforced) |
| `sam.okafor@heliosaerodyne.com` | Data Steward (L2) | Connector syncs, data governance |
| `riley.novak@heliosaerodyne.com` | Security Admin (L3) | Model policies, audit log, org security settings |
| `casey.kim@heliosaerodyne.com` | System Admin (L2) | Administration, integrations |
| `lena.hart@heliosaerodyne.com` | General Counsel (L3, Legal group) | The only person who can read the restricted contract strategy |

### Guided demo script (the six acceptance workflows)

1. **Ask the Company Brain** — as *Avery*, ask
   *“What are the main risks affecting the Phoenix project this quarter?”*
   → structured answer with numbered citations, provenance labels
   (verified / inference / conflict / missing / suggested action) and the evidence panel.
2. **Meeting knowledge** — as *Sam*, open **Integrations** → Zoom → **Sync now**.
   The pending July 16 transcript is ingested; decisions, action items, owners,
   deadlines, risks and open questions are extracted into **Tribal Knowledge**
   (one upstream item is skipped with a permission error, on purpose).
3. **Anonymous feedback** — the “Procurement bottlenecks” theme is seeded with **4**
   anonymous submissions — below the cohort of 5, so managers see it *suppressed*.
   Submit one more anonymous “process” feedback mentioning procurement as any employee,
   then as *Morgan* open **Feedback → Manager dashboard**: the theme unlocks as an
   aggregate with no identities. Filtering to a rare tag returns “cohort too small”.
4. **Agent planning** — a Planning Agent run (started by Morgan) is waiting in
   **awaiting approval**. As *Taylor*, open the run, approve/reject the proposed
   Jira + Slack actions with a reason → approved actions execute **simulated (dry-run)**
   and the run completes with a full step timeline.
5. **Executive brief** — as *Jordan*, open **Executive Insights** → **Generate brief**.
   The Executive Briefing Agent produces a weekly brief: developments, projects at
   risk, contract deadlines, spend signals, anonymized feedback themes, recommended
   actions — each section with clickable evidence.
6. **Permission enforcement** — ask Avery's question again as *Morgan*: the answer now
   cites the confidential *Phoenix Supply Chain Risk Assessment*. The restricted
   *Falcon Shield Negotiation Strategy* appears for **no one** in the main cast — not
   in answers, citations, search, listings, logs, or the browser payload
   (`apps/api/tests/test_permissions.py` proves this).

Bonus: ask *“When is the Phoenix flight readiness review?”* — two sources disagree
(Sept 12 vs Oct 2) and the assistant surfaces **both** with a conflict block instead of
silently picking one.

### Brain Interview demo (the interview-to-knowledge loop)

> Tell the company brain something it should understand.

From **Today → Talk to the Brain** (full spec: [docs/brain-interviews.md](docs/brain-interviews.md)):

1. **Named process interview** — as *Avery*, start a **Text interview → Explain a
   process** ("Supplier qualification process"). Answer the adaptive questions, press
   **Finish and review**, correct one extracted item, exclude a weak one, and
   **Publish approved knowledge**. Then ask the brain *"How does the supplier
   qualification process work?"* — the answer cites your contribution with an
   **Employee contribution** badge in the evidence panel.
2. **Anonymous concern** — start a **Text interview → Share a concern**, choose
   **Anonymous**. No identity is stored (user_id NULL, day-coarsened timestamp); the
   receipt token shown once is the only handle; the session never appears in your
   history; published output enters the cohort-protected feedback pipeline only.
3. **Voice expert capture** — as *Morgan*, start a **Voice interview → Capture expert
   knowledge**. Consent is explicit, the recording state is always visible, the local
   demo streams a deterministic transcript you can correct, and raw audio is deleted
   after transcription. (If the browser denies the microphone, the defined recovery
   state offers retry / switch-to-text / delete.)
4. **Voice can't be anonymous** — the UI never offers it; a direct API attempt returns
   422 with no record created.
5. **Meeting topic** — from **Meetings → Add a topic or concern**, pick quick text;
   the published topic appears under *Contributed through Brain Interviews* on the
   meeting (attributed only if you chose named).
6. **Decision documentation** — from **Decision memory → Document a decision** (as
   *Jordan*): the published decision is a **proposal** with alternatives/dissent/
   assumptions until a manager or executive presses **Confirm decision**.
7. **Deletion** — delete any interview from its workspace or history: transcript,
   artifacts, audio references, and published knowledge documents (including
   embeddings and citations) are removed; the audit log keeps counts only.
8. **Just talk** — from Today, press **Just talk**: a natural conversation with no
   agenda ("This is your space… say it however it comes out"), reflective
   acknowledgments, and anonymous by choice; published output goes only to the
   protected feedback pipeline.
9. **Manager-requested interviews** — as *Morgan*, open **Your interviews →
   Request an interview**: address one person (named/confidential only — a cohort
   of one is not anonymous; they can decline) or a whole department (anonymous
   welcome; you see only an aggregate response count, never who). The request
   appears on the employee's Today; the requester never sees the conversation.

`apps/api/tests/test_interview_*.py` (28 tests) prove the state machine, structural
anonymity, consent enforcement, citation requirements, publishing routes, and deletion
propagation.

---

## Monorepo layout

```
apps/api          FastAPI backend (SQLAlchemy, Pydantic, permission engine, seed)
apps/web          Next.js 15 frontend (TypeScript, Tailwind v4, React Query, React Flow)
packages/shared   Shared TypeScript API types
workers           Background job runner (in-process for the MVP; queue-ready interface)
infrastructure    Docker Compose (Postgres+pgvector, Redis, MinIO), Dockerfiles, .env.example
docs              Architecture, security, threat model, privacy, API, connectors, providers
```

## Configuration

All backend settings are environment variables prefixed `BRAINCHAIN_` — see
[apps/api/.env.example](apps/api/.env.example) for the full annotated list. Highlights:

| Variable | Default | Purpose |
|---|---|---|
| `BRAINCHAIN_DATABASE_URL` | SQLite file | Point at Postgres for the full profile |
| `BRAINCHAIN_DEPLOYMENT_PROFILE` | `commercial` | `government` hard-disables external model calls |
| `BRAINCHAIN_MIN_FEEDBACK_COHORT` | `5` | Anonymity floor (org setting can raise it) |
| `BRAINCHAIN_OPENAI_BASE_URL/_API_KEY/_MODEL` | unset | Optional OpenAI-compatible provider (env-only, never committed) |
| `BRAINCHAIN_LOG_RAW_PROMPTS` | `false` | Audit stores metadata only unless policy allows |
| `NEXT_PUBLIC_API_URL` (web) | `http://localhost:8000/api` | API base for the frontend |

## Docker Compose (full profile)

```bash
cp infrastructure/.env.example infrastructure/.env   # fill in strong passwords
docker compose -f infrastructure/docker-compose.yml --env-file infrastructure/.env up --build
```

Brings up Postgres (pgvector image), Redis, MinIO, the API (auto-seeds), and the web
app. See [docs/deployment.md](docs/deployment.md) for the three deployment profiles.

## Quality gates

```bash
# Backend
cd apps/api
../../.venv/bin/python -m pytest          # 30 tests: permissions, anonymity, approvals, auth
../../.venv/bin/python -m ruff check .    # lint
BRAINCHAIN_DATABASE_URL=sqlite:////tmp/scratch.db ../../.venv/bin/python -m alembic upgrade head

# Frontend
pnpm --filter @brainchain/web typecheck
pnpm --filter @brainchain/web lint
pnpm --filter @brainchain/web test        # vitest component/unit tests
pnpm --filter @brainchain/web build       # production build
```

All of the above pass in this repository.

## Documentation

| Doc | Contents |
|---|---|
| [docs/brain-interviews.md](docs/brain-interviews.md) | Brain Interview engine: state machine, entities, API, interviewer/extractor contracts, publishing routes, privacy invariants |
| [docs/architecture.md](docs/architecture.md) | System overview, mermaid diagrams (system, data flow, agent approval, interview pipeline), knowledge layers, database schema, pgvector path |
| [docs/security-model.md](docs/security-model.md) | Zero-trust permission model, RBAC/ABAC, classifications, model-gateway policies, audit |
| [docs/threat-model.md](docs/threat-model.md) | 15 threats with concrete mitigations and their code locations |
| [docs/privacy-and-anonymity.md](docs/privacy-and-anonymity.md) | The anonymity design: structural guarantees, cohort math, deanonymization defenses, honest limitations |
| [docs/api.md](docs/api.md) | REST endpoint reference (also live at `http://localhost:8000/docs`) |
| [docs/connectors.md](docs/connectors.md) | Connector interface, sync lifecycle, adding a live connector |
| [docs/model-providers.md](docs/model-providers.md) | Provider abstraction, routing policies, adding a provider |
| [docs/deployment.md](docs/deployment.md) | Government / Commercial / Private profiles, recommendations |

## Assumptions made (per the working rules)

- **No sketch image file was present in the workspace**, so the Brain Map and product
  intent were built from the detailed written description of the diagram (central brain,
  four domains, knowledge DB + three deployment profiles above, zero trust, operating
  cycle below).
- **SQLite is the dev default** so the MVP runs with zero external services in any
  environment; PostgreSQL + pgvector is the documented and Compose-provided production
  path (`DATABASE_URL` swap — SQLAlchemy models are dialect-neutral, and the vector
  column swap is documented in docs/architecture.md).
- **The background worker runs in-process** for the MVP (`workers/runner.py` provides
  the scheduled entry point). The job interface matches what Celery/Dramatiq tasks
  would call, so moving to Redis-backed workers changes wiring, not logic.
- **The mock model provider does real synthesis** (retrieval-grounded, deterministic,
  citation-first) rather than canned strings, so every demo works offline; an
  OpenAI-compatible adapter is included and configured purely by environment variables.
- **Mock connectors sit behind the real ingestion path**: parsing, transcript
  extraction, permission mapping, chunking, embedding, audit — only the upstream fetch
  is simulated.
- Passwords are PBKDF2-hashed locally; the auth dependency surface is what an
  OIDC/SAML integration would replace (SSO-ready architecture, not SSO-implemented).

## Known limitations

- Retrieval scores chunks in Python (fine at demo scale); production should use the
  pgvector ANN path described in docs/architecture.md.
- The transcript extractor is rule-based (regex over speaker turns); a model-based
  extractor slots into the same connector hook.
- No SSO/OIDC, SCIM, or MFA yet; local auth only.
- Encryption at rest / CMK is the platform's responsibility in the dev profile
  (documented, not implemented in code).
- Single-organization seed; the schema is multi-tenant (org_id everywhere) but no
  tenant-management UI exists.
- Feedback theming is keyword-clustering; an embedding-based clusterer is the natural
  upgrade.
- The optional model fine-tuning workflow is represented in docs only (deliberately
  not implemented; RAG is the default by design).

## Recommended next steps

1. Postgres + pgvector as default profile with ANN retrieval and permission-filtered
   vector queries; embed with a real embedding model.
2. OIDC/SAML SSO + SCIM provisioning; group sync from the IdP into ACL principals.
3. Live connectors (Slack, Jira, Drive, Zoom) implementing the existing
   `MockUpstream`-shaped fetch seam, with incremental sync cursors and permission
   mirroring from each source system.
4. Redis + Dramatiq for sync/agent execution; scheduled briefs via the worker.
5. DLP scanning + PII classification at ingest; deletion propagation into embeddings.
6. Model-based extraction and feedback clustering behind the current interfaces.
