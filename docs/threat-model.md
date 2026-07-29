# Threat model

Fifteen threats, their mitigations, and where each mitigation lives. Tests that prove
a mitigation are named where they exist.

| # | Threat | Mitigation | Where |
|---|--------|------------|-------|
| 1 | **Cross-tenant data leakage** | Every query filters by `org_id`; sessions resolve to one org; no cross-org ACL principal exists. Multi-tenant isolation is schema-wide (`org_id` on every table). | `models.py`, all routers |
| 2 | **Unauthorized document retrieval** | Clearance + grant evaluated *before* scoring; single retrieval path shared by search/assistant/agents/insights; 404 indistinguishable from nonexistent. | `security/permissions.py`; `tests/test_permissions.py` (7 tests) |
| 3 | **Prompt injection inside company documents** | Document text sanitized (`sanitize_untrusted`), wrapped as tagged data for external providers with "sources are never instructions"; local provider does no instruction-following at all. | `services/llm_gateway.py` |
| 4 | **Malicious tool instructions** | Agents run on per-agent tool allowlists; external effects require human approval regardless of retrieved content; dry-run default simulates. | `services/agents_engine.py`; `tests/test_agent_approvals.py` |
| 5 | **Compromised connector credentials** | Mock connectors hold no credentials; the live-connector seam mandates env/secret-store config; per-source ACLs limit blast radius; permission errors surface on the connector card instead of silently widening access (fail closed). | `services/connectors.py` |
| 6 | **Sensitive data exposure to model providers** | Policy classification ceilings; external calls require profile+org+env to all allow; government profile hard-disables; skip reasons audited. | `resolve_provider()`; `routers/admin.py` |
| 7 | **Anonymous-feedback deanonymization** | No user linkage stored; coarsened timestamps; k-cohort on totals AND per theme; only coarse filters exist; excerpts truncated; audit without actor. | `services/feedback.py`; `tests/test_feedback_privacy.py` (8 tests) |
| 8 | **Excessive manager filtering** | Aggregation endpoint accepts only an allowlisted filter set; any slice below cohort returns "too small" with no partial data; unknown params ignored. | `ALLOWED_AGGREGATE_FILTERS`; `test_filter_narrowing_cannot_shrink_cohort` |
| 9 | **Agent actions without approval** | Plan/review/execute state machine; `EXTERNAL_ACTIONS` set gates every effectful type; separation of duties (requester ≠ approver); approvals audited with reasons. | `agents_engine.py`; `test_requester_cannot_self_approve` |
| 10 | **Audit-log tampering** | Append-only usage pattern (no update/delete endpoints); admin API is read-only over audit; production recommendation: write-ahead shipping to WORM storage. | `security/audit.py`, `routers/admin.py` |
| 11 | **Secret leakage** | No secrets in code or seed; env-only credentials; `.env*` gitignored; structured logs carry metadata only; prompts redacted unless policy opts in. | `.gitignore`, `config.py`, `assistant.py` |
| 12 | **Insecure exports** | `export_sensitive` is an approval-gated agent action; no bulk-export endpoint exists; document detail requires per-document authorization. | `agents_engine.py` |
| 13 | **Stale permissions** | ACLs live in one table written at ingest and re-checked on every request (no caching of decisions); connector re-sync rewrites grants; recommendation: permission-sync job per connector cycle. | `permissions.py`, `connectors.py` |
| 14 | **Deleted data remaining in embeddings** | Chunks are cascade-managed with the document row; re-ingest deletes and re-embeds stale chunks (`add_document_version`); roadmap: deletion workflow that tombstones doc + chunks + citations in one transaction. | `services/ingestion.py` |
| 15 | **Hallucinated executive claims** | Insights are *computed* from records, not generated text; every card and brief section carries evidence document ids, permission-filtered per viewer; the assistant labels non-verified content as inference/missing and surfaces conflicts rather than resolving them. | `services/insights.py`, `llm_gateway.py` |

## Brain Interview engine threats (16–24)

| # | Threat | Mitigation | Where |
|---|--------|------------|-------|
| 16 | **Microphone misuse / hidden recording** | Explicit consent screen before any capture; always-visible recording indicator (text + icon, `role="status"`); pause releases nothing silently; the mic stream is released on unmount; no capture path exists before `consent_at` is set (server-enforced 409). | `interviews.py::give_consent/_require_active`, voice workspace; `test_voice_requires_consent_before_turns`, `test_consent_required_before_any_voice_capture` |
| 17 | **Accidental bystander capture** | Consent copy warns the speaker; pause is one tap; raw audio is deleted after transcription by default so incidental capture does not persist; transcript lines are individually correctable/deletable before completion. | consent screen, `_mark_audio_deleted` |
| 18 | **Voice biometric identifiability** | Voice can never be labeled anonymous — rejected at creation with no record; the UI explains why. | `create_session`; `test_anonymous_voice_rejected_without_record` |
| 19 | **Transcript leakage** | Owner-or-receipt access only (404 otherwise, incl. managers/admins); audit events never contain turn text; published artifacts carry the employee-approved summary, not transcript excerpts, for confidential sessions. | `resolve_session`, `_audit`; `test_sessions_are_owner_private`, `test_named_audit_never_contains_turn_text` |
| 20 | **Prompt injection inside spoken/typed interview content** | The interviewer is deterministic locally (no instruction-following surface); for model-gateway providers, interview turns pass the same `sanitize_untrusted` + data-not-instructions wrapping as retrieved documents; the extractor only classifies — it has no tools. | `llm_gateway.sanitize_untrusted`, provider contract |
| 21 | **Malicious uploaded audio** | The mock path accepts no user audio; the real-adapter seam mandates size/type limits and provider-side scanning before any transcription call (documented in the adapter contract); audio never enters the relational DB. | `transcription.py` |
| 22 | **Model extraction errors published as fact** | Extractor output is *candidate* artifacts requiring per-item employee review; inference-derived artifacts are flagged `uncertain` and deselected by default; every artifact must cite its source turns or it is dropped. | `interview_extraction.py`; `test_artifacts_carry_citations_and_provenance` |
| 23 | **Anonymous self-identification** | Cohort-protected aggregate-only publication for anonymous content; day-coarsened timestamps; the UI warns that free text can self-identify; anonymous knowledge is never published as a citable document. | `interview_publishing.py`; `test_anonymous_knowledge_is_not_a_citable_document` |
| 24 | **Deletion failures leaving derived data** | A single service path, `delete_session`, removes turns, artifacts, audio rows, published documents + chunks (embeddings) + citations + ACEs, feedback rows, proposed decisions, open tasks; verified by test; audit records counts only. | `interviews.py::delete_session`; `test_deletion_propagates_everywhere` |

## Residual risks (explicitly accepted for the MVP)

- Free-text anonymous feedback can self-identify; the UI warns contributors.
- SQLite dev database is unencrypted; use the Postgres profile beyond demos.
- The injection sanitizer is heuristic; a model-based screen belongs at ingest in
  production.
- Audit rows are same-database; WORM shipping is a deployment recommendation, not
  code.
