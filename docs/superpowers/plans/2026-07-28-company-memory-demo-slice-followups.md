# Demo-slice follow-ups

Carried out of the 2026-07-29 implementation run (20 tasks, 28 commits, final
whole-branch review clean). Sources: per-task review ledger + final review triage.

## Required before the first live demo (not merge blockers)

- Run the live golden tests once with real keys and tune the extraction prompt if
  they fail: `RUN_LIVE_MODEL_TESTS=1 BRAINCHAIN_ANTHROPIC_API_KEY=... pytest tests/test_live_extraction.py -v`
- Full runbook dry-run (`docs/runbooks/demo-script.md`), including the manual
  browser pass: import → review → approve → `/ask` citation → Slack.
- Enable the org toggle for the demo org (Administration as casey.kim →
  `external_models_enabled: true`) — extraction and embeddings now correctly
  refuse external calls without it.
- Add a `[:2900]` clamp in `apps/slack/brainchain_slack/blocks.py` section text
  (Slack 3000-char block limit; a very long segment currently makes `say()` fail).
- Optional: add the Nimbus on-time-rate conflict (fixture line vs. seeded supplier
  record) to the runbook as a bonus Q&A beat; name morgan.reyes in beat 3.

## Before a design-partner pilot

- Audit events for: 401 service-token rejections (`/ask/on-behalf-of`), failed
  extraction retries (502 branch), and `GET /meetings/{id}/review` reads
  (parity with `document.viewed`).
- Test `_copy_acl` with a department-scoped (narrower-than-org) transcript ACL.
- Distinguish on-behalf-of asks in `ask_service`'s inner audit event (currently
  `actor_type="user"`; correlation ids in the service event mitigate).
- Normalize `User.email` casing at write time before building any invite flow.
- Exception-type logging (metadata only) in `AnthropicProvider`'s failure path.
- Per-section error states on the home dashboard (currently all-or-nothing).
- Product call: surface `GET /meetings/{id}/topics` in the meetings UI or retire it.

## Repo hygiene at merge time

- `apps/web/tsconfig.tsbuildinfo` has been tracked since the baseline commit —
  add to `.gitignore` and `git rm --cached` it.

## Accepted as-is (reviewed, ruled fine)

Dict-repr fallback text on double-malformed model output (labeled inference);
90s vs 60s Anthropic client timeouts (extraction inputs larger); shared
`["gov-classifications"]` query key across two pages; raw `turn_ids` alongside
resolved turns in review payload; redundant `transcript_doc` fetch in
`resolve_artifact`; retry-409 guard can't distinguish zero-artifact success from
never-ran; seeded July-10 meeting has turns-only extraction (tolerated, tested);
fixture persona Priya Raman titled Thermal Engineer while doing structural work.

## Redesign follow-ups (2026-07-29, post-merge fine)

- Tighten tests: nav.test.tsx dead loop; copy.test.tsx add artifact/extraction display-string patterns.
- Unify reviewer role set: landing pending-reviews card (manager|executive) vs Library decisions tab (+security_admin).
- Wrap the three redirect stubs (/explorer,/company,/tribal) in Suspense (useSearchParams build constraint class).
- Deduplicate ContributeMenu on the meetings page (header + invite panel both render one).
- Accessibility pass: keyboard arrow-nav/Escape for Contribute and gear menus (role=menu without keys is an ARIA smell).
- Landing recent-meetings card: add isError branch so a failed /meetings fetch doesn't render 'No meetings yet'.
