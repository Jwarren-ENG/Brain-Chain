# ADR-0001: Build on the BrainChain codebase

Date: 2026-07-28 · Status: accepted

## Context
Three-agent audit (backend/frontend/docs) of this repo: real permission engine,
47-table schema, proposed→confirmed governance, provenance UX, 64 real backend
tests — but every AI capability was a deterministic fake and no write API existed.

## Decision
Build the Company Memory product on this codebase rather than rewriting.
Keep: schema, security/permissions.py, ingestion pipeline, state machines,
provenance UX, test scenarios. Replace behind the existing seams: embeddings,
LLM provider, extraction, connectors, transcription.

## Consequences
~4–8 weeks of sound foundation retained; all "cardboard" is replaced
incrementally behind protocols, so each replacement is env-gated and revertable.
