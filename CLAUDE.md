# BrainChain — instructions for AI engineers

## What this is
BrainChain is a permission-aware company-memory platform. Meetings and documents
are captured, knowledge is extracted by LLMs as *proposals*, humans approve what
becomes company memory, and employees retrieve it with citations via web and Slack.
North Star: docs/superpowers/specs/2026-07-28-engineering-memory-demo-slice-design.md §0.

## Layout
- apps/api — FastAPI backend. Routers → services → SQLAlchemy models.
- apps/web — Next.js 15 App Router frontend (all client components, TanStack Query).
- apps/slack — slack-bolt Socket Mode bot (thin client of the API).
- packages/shared — hand-written TS types mirroring API serializers.
- docs/ — product/architecture/security docs. docs/decisions/ — ADRs.

## Non-negotiable invariants (do not "improve" these away)
1. Permission filtering runs BEFORE retrieval scoring (security/permissions.py →
   services/retrieval.py). Never rank, cite, or prompt with unauthorized text.
2. Extracted knowledge lands as status="proposed". Only human approval endpoints
   promote it. Proposed artifacts are never published as retrievable documents.
3. Every artifact carries source references (turn_ids / document ids). Drop and
   log anything untraceable.
4. Conflicting sources are surfaced side by side, never silently resolved.
5. Unauthorized fetches return the same 404 as missing resources (no existence oracle).
6. No transcript/prompt text in logs. Metadata only.
7. The keyless path (no API keys set) must run the full demo and test suite
   deterministically via the mock providers.

## Conventions
- Python: ruff, type hints, thin routers, logic in services. Tests in apps/api/tests
  via TestClient against the seeded SQLite fixture (see tests/conftest.py).
- TS: strict, no `any`. Server state via TanStack Query. UI primitives from
  components/ui.tsx; provenance rendering from components/evidence.tsx.
- Run backend tests: cd apps/api && ../../.venv/bin/python -m pytest tests/ -q
- Run web tests: pnpm --filter @brainchain/web test

## Prohibited for agents
No merges, deploys, external messages, or purchases. No committing secrets or
.db files. No new heavy dependencies without an ADR.
