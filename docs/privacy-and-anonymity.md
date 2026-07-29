# Anonymity & privacy design

> This document covers the feedback system and the **Brain Interview engine**
> (see also docs/brain-interviews.md §9 for the interview-specific invariants).

## Brain Interview privacy summary

- **Voice can never be anonymous.** The UI never offers it; the API rejects it
  with a validation error before any record exists. A voice can identify its
  speaker regardless of stored metadata, so the promise would be false.
- **Microphone consent is explicit** and precedes any capture; the recording
  state is always indicated with text + icon; raw audio is deleted after
  transcription by default (retention requires org policy + per-session
  consent).
- **Anonymous interview sessions are structurally anonymous**: `user_id` is
  NULL, creation time is day-coarsened, and the only handle is a receipt token
  returned once to the author. Anonymous sessions never appear in
  account-linked history — even the author's account cannot enumerate them.
- **Confidential sessions** keep identity for protected follow-up only;
  published artifacts are unattributed and carry no session reference in any
  API-visible field.
- **No manager path to individual interviews exists.** Owner-or-receipt is the
  only access rule; everyone else receives the same 404 as a missing session.
  Security admins audit event metadata, which never contains authorship for
  anonymous sessions because it is not stored.
- **Employee review is mandatory** before anything publishes, and anonymous
  publications route only to the cohort-protected feedback pipeline — never to
  citable documents (stylometry risk).
- **Interview audit events carry identifiers and counts, never turn text.**
- **Deletion propagates**: transcript, artifacts, audio references, published
  documents with their chunks/embeddings/citations, feedback submissions,
  proposed decisions, and open interview tasks (confirmed decisions survive
  with interview linkage scrubbed — documented retention semantics).
- **Honest limitation, shown in the UI**: free text can identify its author if
  it contains identifying details; timestamps are coarsened but writing style
  is not normalized.

The feedback system's promise is enforced by structure, not by UI styling. This
document explains exactly what is and is not protected.

## Three visibility levels

| | Named | Confidential | Anonymous |
|---|---|---|---|
| `user_id` stored | yes | yes | **NULL — never stored** |
| Visible to managers | as aggregate + attributed items in `/mine` views | aggregate only; identity never in manager-facing endpoints | aggregate only |
| Follow-up possible | opt-in | opt-in | **forced off** (server ignores the flag) |
| Timestamp | exact | exact | **coarsened to day** (anti-correlation) |
| Author's own status view | account (`/feedback/mine`) | account | **receipt token only** — the sole link, held by the author |

## The cohort rule (k-anonymity)

- Aggregates unlock at **min_feedback_cohort** submissions (floor 2, default 5,
  org-configurable in Administration; changes audited).
- The rule applies to the **whole result** and to **each theme bucket**
  independently: a theme with fewer members appears only as
  "*Fewer than N responses — details withheld*" with no counts and no text.
- Confidence is reported (`medium`/`high`) so managers know how much to trust a
  barely-unlocked aggregate.

## Anti-deanonymization measures

1. **Filter allowlist.** The aggregation API accepts only `category`,
   `department_tag`, `project_tag`, `survey_id`. Author-level filters do not exist;
   unknown parameters are ignored (verified by `test_author_only_filters_are_ignored`).
2. **No partial leakage on narrow slices.** Any filter combination that lands below
   the cohort returns a "cohort too small" object containing *no* themes, *no*
   sentiment, *no* excerpts — not a reduced version
   (`test_filter_narrowing_cannot_shrink_cohort`).
3. **Structural identity absence.** For anonymous rows there is nothing to leak:
   no user id, no email, no exact timestamp. A database dump identifies no one.
4. **Excerpt hygiene.** Sample excerpts render only above the cohort floor, truncated
   to 180 characters.
5. **Audit without actor.** The audit trail records that an anonymous submission
   happened (`actor_user_id = NULL`, empty target) — accountability without identity.
   Aggregate *views* are audited with the manager's identity and filters, so probing
   behavior is itself observable.

## Honest limitations (also shown to employees in the UI)

- Free text can identify its author if it contains identifying details. The composer
  says so explicitly.
- The receipt token is the only link to an anonymous submission. Lose it and status
  lookup is impossible — by design.
- Tags are optional precisely because a rare department+project combination could
  narrow a cohort; the cohort rule catches this, but leaving tags empty is safer
  still.
- k-anonymity does not defend against a manager who *already knows* who said what
  from outside the system.

## Prompt/observability privacy

- Assistant audit events store metadata (mode, provider, source count, latency) and
  redact query text unless `log_raw_prompts` is explicitly enabled at org or platform
  level.
- Request logs are structured metadata only — no bodies, no document text.
- Executive insights consume feedback exclusively through the same cohort-protected
  aggregator managers use; there is no privileged path to individual anonymous
  voices anywhere in the codebase.
