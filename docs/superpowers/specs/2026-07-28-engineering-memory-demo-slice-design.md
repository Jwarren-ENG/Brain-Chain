# Engineering Memory Demo Slice — Design

**Date:** 2026-07-28
**Status:** Draft for review
**Goal served:** A convincing live demo of the Company Jarvis core loop for design partners/investors, on the path to (not a detour from) a real pilot.
**Scope authority:** The AI-staff operating plan, "Weeks 3–6: build only" — transcript upload, meeting summary, decision & rationale extraction, human approval of memories, search over approved memories, answers with source citations, basic Slack interface.

---

## 1. Context

BrainChain (this repo) is a high-quality demo scaffold: real permission-before-retrieval enforcement, a 47-table schema, proposed→confirmed decision governance, provenance-segmented answers with citations, and ~64 real backend tests. But every AI capability is a deterministic fake (hashed bag-of-words "embeddings", a template-engine "LLM", regex extraction, seeded mock connectors), there is no Slack surface, and the only way data enters the system is the seed script.

The audit (2026-07-28, three-agent review of backend, frontend, docs) concluded: build on it. The seams — `ModelProviderClient`, `EmbeddingProvider`, `TranscriptionProvider` protocols, the shared ingestion pipeline, the permission chokepoint, the state machines — are in the right places. This slice replaces what is behind three of those seams with real implementations and adds the first two write surfaces the product has ever had.

## 2. What the demo must show (success criteria)

A ~10-minute live demo, end to end, with no canned answers:

1. **Ingest:** Upload a Zoom/Meet transcript export of a fictional aerospace design review (Helios Aerodyne).
2. **Extract:** The system produces *proposed* decisions (with rationale and alternatives considered), action items (with owners), risks, and open questions — each citing the exact speaker turns it came from.
3. **Approve:** A manager reviews the proposals, edits one, rejects one, approves the rest. Approved items become confirmed, searchable memory.
4. **Ask in Slack:** An engineer DMs the bot "Why did we switch the bracket material to 7075?" and gets a real LLM answer with numbered citations linking back to the meeting turns and documents.
5. **Permissions:** A lower-clearance user asks about a restricted topic and gets "no authorized evidence" — with no hint the restricted material exists.
6. **Honesty:** A question with conflicting sources returns both sources labeled as a conflict, not a confident synthesis.

Every step runs live against the real model. Nothing in the demo path is scripted output.

## 3. Approaches considered

- **A. Real-loop demo (chosen).** Make the core loop real but narrow: real LLM + embeddings, transcript upload (no live meeting bot), LLM extraction, existing approval workflow, Slack Socket Mode bot. Highest credibility per unit effort; every hour also counts toward the pilot.
- **B. Live meeting bot showpiece.** Recall.ai-style bot joining Zoom live. Most theatrical, but a heavy external dependency, flaky in live demos, and it still requires all of A's extraction/answer work underneath. Deferred to the next slice — also matches the operating plan ("automatic meeting ingestion" is Weeks 7–10, voice is "Later").
- **C. Polished scripted demo.** Keep the mocks, add surfaces, script the story. Fastest, but shatters under one off-script question from a technical audience, and moves nothing toward a pilot. Rejected.

## 4. Architecture

No new services beyond one small Slack app. The monorepo gains:

```
apps/api        FastAPI (existing) — new provider adapters, upload endpoint, extraction service
apps/web        Next.js (existing) — meeting upload + review queue screens, demo hardening
apps/slack      NEW — Python slack-bolt app, Socket Mode, talks to the API over HTTP
```

Data flow:

```
Transcript file (VTT/TXT with speakers)
  → POST /meetings/import  (parse, create Meeting + Document, chunk, embed, ACLs)
  → extraction service (Claude, structured output)
  → proposed Decisions / Tasks / Risks / OpenQuestions with turn-level source refs
  → review queue (web) — approve / edit / reject          [human gate]
  → confirmed memory (searchable, citable)
  → /ask (web) and Slack bot → permission filter → retrieval → Claude → segmented answer + citations
```

The permission pre-filter stays exactly where it is: ACL intersection happens before ranking, so unauthorized text is never scored, never in model context, never in a citation. The Slack surface inherits this for free because it calls the same `/ask` path as the web app.

## 5. Components

### 5.1 Real model provider (`AnthropicProvider`)

- Implements the existing `ModelProviderClient` protocol in `apps/api/app/services/llm_gateway.py`.
- Model: `claude-sonnet-5` for answers and extraction (config-overridable). SDK: `anthropic` Python package, not raw httpx.
- Configured via env (`BRAINCHAIN_PROVIDER=anthropic`, `BRAINCHAIN_ANTHROPIC_API_KEY`, `BRAINCHAIN_ANTHROPIC_MODEL`). `MockProvider` remains the default when no key is set, so the zero-key dev path and the deterministic test suite survive unchanged.
- Preserves the segmented `GatewayAnswer` contract the frontend depends on: the model is prompted to return structured JSON — segments typed `verified | inference | conflict | missing | suggested_action`, each with citation ordinals into the retrieved chunks. Validated with Pydantic; one retry on parse failure; final fallback is a single `inference` segment containing the plain answer (never a 500).
- The existing `resolve_provider` policy routing (classification ceiling, deployment-profile gating of external calls) stays in front of it unchanged. Restricted-classification queries keep refusing to leave the box.
- Timeouts, retry-with-backoff on 429/5xx, and a per-request token/cost log line (metadata only, no prompt text, honoring `BRAINCHAIN_LOG_RAW_PROMPTS=false`).

### 5.2 Real embeddings

- `VoyageEmbeddings` behind the existing `EmbeddingProvider` protocol (`voyage-3.5`, env-configured); hashed fallback remains the no-key default.
- Storage stays in the existing JSON column; scoring stays in Python. At demo scale (< ~10k chunks) this is fine; pgvector is deliberately deferred.
- Re-embedding: a one-shot management command (`python -m app.reembed`) regenerates embeddings for all chunks when the provider changes. Seed data gets re-embedded once with the real provider before demos.

### 5.3 Meeting transcript import (first real write path)

- `POST /meetings/import` (multipart): transcript file + metadata (title, date, project, attendee emails, classification, data-source). Accepts WebVTT and `Speaker: text` plain text — the two formats Zoom/Meet actually export.
- Parser normalizes to speaker turns with stable turn IDs and timestamps (when present). Attendee emails map to existing users where they match; unknown speakers stay as labeled strings.
- Reuses the existing ingestion pipeline (`services/ingestion.py`) to create the `Meeting`, backing `Document`, chunks, embeddings, and ACLs from the chosen classification + project scope.
- Role-gated (manager or data-steward for the demo). Audit event on import.
- Web UI: an "Import transcript" action on `/meetings` (replaces part of the currently-hardcoded prep tab).

### 5.4 LLM knowledge extraction (replaces the regex extractor for meetings)

- New `services/meeting_extraction.py`: one structured-output call (tool-use / JSON schema) over the turn-labeled transcript producing:
  - **Decisions** — statement, rationale, alternatives considered, who decided, source turn IDs
  - **Action items** — description, owner (mapped to user where possible), due date if stated, source turns
  - **Risks** — description, severity if stated, source turns
  - **Open questions** — question, who raised it, source turns
  - **Summary** — short meeting recap
- Invariant carried over from the interview engine: *no artifact without source-turn references.* Artifacts whose turn refs don't resolve are dropped and logged, never silently kept.
- Long transcripts are chunked by turns with overlap; extraction runs per chunk and results are merged/deduped by the model in a second pass only if needed (demo transcripts fit one call).
- Everything lands as `status="proposed"`. The regex extractor is deleted for meetings (the connector-transcript path routes through this service); interview extraction is untouched in this slice.
- Runs synchronously in the import request for the demo (target < ~60s); the response streams status so the UI can show progress. A background queue is explicitly deferred.

### 5.5 Review & approval queue

- New `/meetings/[id]/review` screen listing all proposed artifacts from the extraction, grouped by type, each showing its quoted source turns.
- Per artifact: **Approve** / **Edit then approve** / **Reject**, reusing the interview `ReviewPanel` interaction pattern and the existing `POST /decisions/{id}/confirm` semantics; equivalent confirm endpoints added for tasks/risks/questions where missing.
- Approval is role-gated (manager+), audited, and is the only path from proposed to confirmed — same separation-of-duties spirit as agent approvals.
- Retrieval/answering only cites confirmed artifacts and source documents; proposed artifacts are excluded from `/ask` context.

### 5.6 Slack interface (`apps/slack`)

- Python `slack-bolt`, **Socket Mode** (no public ingress needed for a demo), single workspace.
- Surfaces: DM the bot, or `@Jarvis <question>` in a channel it's invited to.
- Identity: Slack user's email → BrainChain user. No match → polite "you don't have a BrainChain account" (no guest access). The bot authenticates to the API with a service token and calls a new `POST /ask/on-behalf-of` endpoint restricted to that service principal; permissions are evaluated as the *mapped user*, so Slack answers are exactly as restricted as web answers.
- Response format: Block Kit — answer text with provenance labels, then numbered citation blocks (source title, quoted excerpt, classification badge, deep link into the web app's document drawer / meeting recap).
- Channel answers add a visibility guard: v1 rule is to evaluate permissions as the asker and prefix the answer with "based on what *you* have access to" — an explicit signal that other channel members might not be authorized to see the cited material. Restricting channel answers to the intersection of all members' permissions is deferred and recorded as a known limitation.
- Permission-denied and conflict behaviors are identical to web ("I don't have authorized evidence…", both sources shown).

### 5.7 Demo hardening (web)

- Delete the hardcoded meetings-prep hero and home-page "Upcoming" meeting, or back them with real data from imported meetings. No fictional JSX in the demo path.
- Wire `ErrorState` (currently dead code) into the `useQuery` paths on the pages the demo touches (`/ask`, `/meetings`, review queue); fix the unreachable error branch in `interviews/[id]/page.tsx`.
- Update seed: keep Helios Aerodyne, but the flagship demo meeting arrives via live import during the demo, not the seed.
- A written demo runbook at `docs/runbooks/demo-script.md` covering the six steps in §2, including reset instructions (`python -m app.seed`).

### 5.8 Repo operating setup (Weeks 1–2 track, cheap and included)

- `CLAUDE.md` + `AGENTS.md` at repo root: what the product does, coding conventions, security boundaries (permission filter is inviolable; no logging of transcript text; mock provider must keep working keyless), required tests, prohibited actions (no merges/deploys/external sends by agents).
- `docs/decisions/` ADR directory, seeded with ADR-0001 (build on BrainChain, per audit) and ADR-0002 (this slice's scope and approach choice).
- Keep `SAFETY_AND_PRIVACY_RULES.md` clearly labeled as an *agent-operating* policy, distinct from product security docs.

## 6. Error handling

- **Provider failures** (429/5xx/timeout): retry with backoff; on exhaustion, `/ask` returns a typed "model unavailable" answer state (web + Slack render it honestly); import marks the meeting `extraction_failed` with a visible retry button — the imported transcript/document is kept either way.
- **Malformed structured output:** one re-prompt with the validation error; then degrade (answers → single inference segment; extraction → fail the extraction step, keep the transcript).
- **Bad transcript files:** parser rejects with a specific message (unsupported format, no speaker labels found) before anything is persisted.
- **Slack:** unmapped user, API-down, and slow-answer (progress reaction, then edit-in answer) paths all have explicit handling; the bot never silently drops a question.

## 7. Testing

- The deterministic suite keeps running keyless: `MockProvider`/hashed embeddings remain the test default; all 64 existing tests must stay green.
- New unit tests: transcript parser (VTT + plain text, edge cases), extraction-artifact validation (turn-ref invariant, dropped-artifact logging), `/meetings/import` permissions and audit, on-behalf-of endpoint (service principal only, permission evaluation as mapped user — adversarial cases), Slack handler logic with a stubbed API client.
- Extraction quality: 3 golden transcript fixtures with expected-artifact assertions, run against the real model behind an env flag (`RUN_LIVE_MODEL_TESTS=1`), not in the default suite.
- Frontend: tests for the review queue actions and the wired error states.
- Pre-demo checklist in the runbook doubles as the manual E2E pass.

## 8. Out of scope (deliberately)

Live meeting bot / real-time joining; voice and ASR; SSO/SCIM/MFA; Postgres/pgvector migration; real connectors (Zoom/Jira/Drive OAuth); Microsoft Teams; background job queue; expert discovery; onboarding paths; hiring/interview features beyond the existing engine; autonomous agent actions; multi-tenant admin; cross-member permission intersection for Slack channels; email ingestion; CAD/PLM anything. Each returns only after the core loop is trusted (per the operating plan's "Later" list).

## 9. Security notes for this slice

- Demo data is fictional; still, real-model calls mean text leaves the machine — external calls remain gated by the existing model-policy layer, and restricted-classification content stays on the local provider path.
- New write endpoints (`/meetings/import`, `/ask/on-behalf-of`) are role/principal-gated and audited; the service token lives in env, never in the repo.
- No transcript text in logs (existing flag honored by the new provider and extraction code).
- Known accepted risks for demo phase (unchanged from audit): localStorage sessions, no SSO, SQLite. These are pilot blockers, not demo blockers, and are on the record for the next slice.

## 10. Build order

1. Repo operating setup (§5.8) + `AnthropicProvider` + real embeddings (§5.1–5.2) — the loop becomes real behind existing UIs immediately.
2. Transcript import + parser (§5.3).
3. LLM extraction service (§5.4).
4. Review queue (§5.5).
5. Slack app (§5.6).
6. Demo hardening + runbook (§5.7), golden-fixture pass, dry-run demo.
