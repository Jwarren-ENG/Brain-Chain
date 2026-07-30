# Demo runbook — Company Memory (10 minutes)

This is the repeatable procedure for demoing the meeting-import → extraction → review →
Slack/web answer loop against Helios Aerodyne, the fictional demo organization. Run the
reset & preflight before every demo; the six beats below are the story.

## Reset & preflight (before every demo)

1. Reset to a clean fictional org:
   ```bash
   cd apps/api && ../../.venv/bin/python -m app.seed
   ```
2. Set environment (real model + real embeddings, external calls allowed):
   ```bash
   export BRAINCHAIN_ANTHROPIC_API_KEY=...
   export BRAINCHAIN_EMBEDDINGS_PROVIDER=voyage
   export BRAINCHAIN_VOYAGE_API_KEY=...
   export BRAINCHAIN_ALLOW_EXTERNAL_MODEL_CALLS=true
   export BRAINCHAIN_SLACK_SERVICE_TOKEN=<random-shared-secret>
   ```
   Then, as **casey.kim** (System Admin), go to **Administration → org settings** and turn
   on `external_models_enabled` — the env var alone is not enough; both gates must pass.
3. Re-embed the seed corpus with real embeddings:
   ```bash
   ../../.venv/bin/python -m app.reembed
   ```
4. Confirm extraction quality against the golden fixtures before you rely on them live:
   ```bash
   RUN_LIVE_MODEL_TESTS=1 ../../.venv/bin/python -m pytest tests/test_live_extraction.py -v
   ```
   Both tests must be green (not skipped — skipping here means the key/env didn't take).
5. Start all three surfaces:
   - API: `cd apps/api && ../../.venv/bin/python -m uvicorn app.main:app --port 8000`
   - Web: `pnpm dev:web` (`http://localhost:3000`)
   - Slack: `cd apps/slack && ../../.venv/bin/python app.py` (needs `SLACK_BOT_TOKEN`,
     `SLACK_APP_TOKEN`, `BRAINCHAIN_SERVICE_TOKEN` matching step 2's
     `BRAINCHAIN_SLACK_SERVICE_TOKEN` — see [apps/slack/README.md](../../apps/slack/README.md))
6. Warm-up: ask one throwaway question in the web app's chat (home page) so the first real-model call (slowest,
   cold) happens off-camera.
7. Slack sanity: DM the bot "ping" as the demo engineer's mapped Slack account and confirm
   a reply comes back before going live.

## The 6 beats (spec §2)

1. **IMPORT** — as **morgan.reyes**: Meetings → Contribute → Import a meeting →
   `apps/api/tests/fixtures/design_review.vtt` (title "Phoenix bracket design review",
   project Phoenix, classification Internal).
2. **EXTRACT** — open the review queue (`/meetings/{id}/review`): proposed decisions with
   rationale, alternatives, and the exact quoted turns they came from. If the "dropped by
   traceability check" note appears, point at it — it's the invariant that untraceable
   artifacts are never silently kept.
3. **APPROVE** — approve the bracket-material decision (edit the rationale live to show
   it's editable, not canned), reject one of the risks, leave the open question
   unresolved. Show the published decision record in the Library: what, why,
   who approved it, and its evidence link back to the meeting.
4. **SLACK** — as **avery.chen**'s mapped Slack account: DM *"Why did we switch the
   bracket material to 7075?"* → a segmented answer citing the new decision record and
   the source meeting, same as the web app would produce.
5. **PERMISSIONS** — ask about the restricted contract strategy (Falcon Shield
   Negotiation Strategy) as **avery**: the answer is "no authorized evidence", with no
   hint the document exists. Ask the identical question as **lena.hart** in the web app:
   a fully cited answer. Same question, same code path, permission-gated evidence — not a
   different answer engine.
6. **CONFLICT** — ask the seeded Phoenix readiness-review question ("When is the Phoenix
   flight readiness review?"): Project Plan v3 says September 12, the FRR Planning Note
   says October 2 — both sources are shown side by side, labelled **CONFLICT**, never
   silently resolved to one.

## Failure modes

- **Model 429 / timeout**: the answer degrades to a typed "model unavailable" state —
  acknowledge it out loud and retry once. Do **not** switch to the mock mid-demo; its
  answers are keyword-assembled and off-brand for "nothing canned" — it will read as a
  downgrade, not a fallback.
- **Slack down**: fall back to the identical question in the web app's chat (home page) — same
  memory, same citations, different surface. That parity *is* the platform point, so
  narrate it as a feature, not a workaround.
- **Full reset mid-demo**: re-run steps 1–3 of the preflight (seed, reembed) — about two
  minutes. Skip step 4 (goldens) if you're mid-demo and already confirmed them once.

## Keyless dry run

Everything above also works with no API keys at all (`BRAINCHAIN_ANTHROPIC_API_KEY` and
`BRAINCHAIN_VOYAGE_API_KEY` unset): the mock answer/extraction providers and the local
hashed-embedding provider produce deterministic, retrieval-grounded results end to end.
`tests/test_live_extraction.py` will report "2 skipped" in this mode — that's expected,
not a failure. Use the keyless path for muscle-memory rehearsal; use the live path (this
runbook's preflight) for the real demo.
