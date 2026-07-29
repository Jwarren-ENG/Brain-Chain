# Agent operating rules for this repo

Read CLAUDE.md first; its invariants govern all agents.

- Agents may: write code on branches, open PRs, run tests, create issues/docs.
- Agents may not: merge, deploy, send external messages, alter permissions
  models without an approved spec, or weaken any invariant in CLAUDE.md.
- Every PR: tests included, suite green keyless, no secrets, no .db changes.
- Completion claims require observable evidence (test output), not file lists.
- Ambiguity tiebreakers: prefer employee control; structural privacy over policy
  promises; a smaller end-to-end slice over broad scaffolding; explicit citations
  and uncertainty over confident synthesis; deterministic local paths over
  mandatory external services.
