# The Curator — Product Design (target state + Slice 1)

**Date:** 2026-07-30
**Status:** Approved by Jacob 2026-07-30 (design); S1 detail below is the next build.
**Supersedes:** the employee-facing portions of the 2026-07-29 almost-no-UI spec and its chat addendum. Backend invariants from the 2026-07-28 demo-slice spec stand except where §4 amends the approval gate.

---

## 0. North star

**Glean's brain + Otter's ears, wrapped in ChatGPT's body, named the Curator.**

The Curator is an AI colleague that knows everything the company can reach —
past meetings, Confluence, drives, databases, Slack, and the internet — and is
present where work happens: in meetings (text and voice) and in a chat you talk
to like a person. Employees never manage knowledge; they just talk. Capture
happens naturally, the way a human colleague remembers things.

The assistant's name is decided: **the Curator** (`ASSISTANT_NAME = "the Curator"`).

## 1. Surfaces

### 1.1 Employee app — the only UI employees ever see
A ChatGPT-style app with a **Chat | Meetings** switcher at the top (pattern:
the ChatGPT↔Codex toggle in OpenAI's app; match Jacob's screenshot when
provided — not yet received as of this writing).

- **Chat:** one conversation surface. The Curator infers intent like a human:
  - Question → answer with **footnote citations** `[1][2]` (small chips; tap to
    peek at the source — meeting moment, document, connector record). Conflicts
    are stated in plain prose ("two sources disagree: …"), never silently
    resolved. No labeled provenance panels in the default view; full provenance
    stays in the payload.
  - Statement/knowledge → captured naturally, acknowledged in the moment
    ("Noted — I'll remember the bracket switch to 7075" with quiet
    **fix / remove** affordances). No Contribute button, no modes.
- **Model picker** in the composer: choose among company-enabled LLMs
  (admin-configured, BYO keys; enforced by the existing model-policy layer —
  the picker can never select something policy forbids).
- **Voice mode** toggle (ChatGPT-style live voice) — Slice 3; no mic UI ships
  before it works.
- **Meetings tab:** the meetings *you attended* — recap, what the Curator
  captured (with the same fix/remove affordances), links to moments; upcoming
  meetings from the connected calendar with "the Curator will join" (Slice 2+4).
- Nothing else. No My work, no Library, no task UI, no gear for employees.

### 1.2 The Curator in meetings (Otter half) — Slice 2
Joins Zoom/Meet/Teams the standard bot way (calendar auto-join or paste a
link). Listens, takes notes, captures decisions/actions/risks. **Answers when
addressed** — first by meeting-chat text, later by voice — and interjects only
when something said conflicts materially with what it knows.

### 1.3 Knowledge (Glean half)
Memory = meetings + connectors (Confluence, SharePoint/Drive, Slack,
Salesforce, Oracle, databases; Slice 4 starts with calendar + Confluence +
Drive) + internet search (Slice 5). Always permission-aware: the Curator never
shows anyone what they couldn't open in the source system (permission filter
before retrieval — unchanged, non-negotiable).

### 1.4 Admin console (Glean-style) — separate from the employee app
Connections/OAuth, model providers & keys, permissions/governance, the
knowledge-review dashboard (§4), audit. Today's gear-menu pages promoted into a
standalone role-gated `/admin` area; admins reach it from their user menu.

### 1.5 Tasks & actions — Slice 6
No task UI of ours. The Curator exports action items to the company's existing
PM tools (Jira/Linear/…) and reads calendars. Until S6, action items appear
only inside meeting recaps.

## 2. Slices (each gets its own plan)

S1 employee-app reshape (detailed in §5) → S2 live meeting bot → S3 voice mode
→ S4 first real connectors (calendar, Confluence, Drive) → S5 internet search
→ S6 task export. Slack surface continues throughout and adopts Curator naming.

## 3. Conversations render like ChatGPT/Claude/Gemini

Clean bubbles, streaming feel, no jargon, no segment labels in the default
view. History sidebar stays (already built). The evidence machinery is not
deleted — it powers the footnote peeks and the admin review dashboard.

## 4. The trust gate, made conversational (amends "no unapproved knowledge")

Old rule: everything lands `proposed`; a manager approves before it is citable.
New rule (approved by Jacob): **the person who said it confirms it, in the
conversation where they said it.**

- Chat capture: the Curator's "Noted — …" acknowledgement carries fix/remove.
  Uncorrected captures confirm (attributed to the speaker); fixed captures
  confirm as edited; removed captures are discarded. Every capture keeps full
  provenance (who said it, where, when) internally.
- Meeting captures: surfaced in the recap ("here's what I captured") with the
  same fix/remove; attendees can correct anything.
- **Sensitive categories still require formal review** in the admin dashboard
  before becoming retrievable: anything from restricted-classification
  sources, HR/people topics, and categories admins configure. The
  proposed→confirmed machinery stays as the implementation underneath.
- Answers must still be traceable to evidence, and the Curator still says when
  it doesn't know. Those invariants are untouched.

## 5. Slice 1 in detail — employee-app reshape (next build)

UI-heavy with two real backend changes (intent capture; model picker).

1. **Curator naming:** `ASSISTANT_NAME = "the Curator"` (+ capitalized
   variant); sweep is automatic since all copy already routes through brand.ts.
   Slack bot copy adopts it too (string-only change permitted in apps/slack).
2. **Top switcher:** header gains Chat | Meetings toggle; sidebar = history +
   "+ New chat" only (bottom pinned links removed for employees). Admin-role
   users get an "Admin console" entry in their user menu → `/admin` section
   containing today's gear pages + Library + review dashboard entry.
   `/meetings` becomes the Meetings tab (same routes, new chrome); the
   my-work/approvals page leaves the employee surface (route stays, reachable
   from admin console for managers until S6 removes the need).
3. **Meetings tab scoped to attendance:** list filters to meetings where the
   caller is an attendee (matching by attendee email/user mapping; backend gets
   a `mine=true` filter on `GET /meetings`). Reviewers additionally see
   meetings pending review. Recap page absorbs the review queue's fix/remove
   for attendees (approve/edit/reject renamed to keep/fix/remove in copy).
4. **Footnote citations:** answers render as clean prose with `[n]` chips;
   tapping opens a compact source peek (title, quote, link). The old evidence
   panel and segment labels leave the default employee view; conflict and
   missing-evidence segments render as plain prose sentences. Payload
   unchanged.
5. **Conversational capture (backend):** the ask pipeline gains intent
   handling — classify each message (question / statement / mixed) with the
   configured LLM (keyless mock: heuristic). Statements route through the
   existing extraction machinery to `proposed` artifacts and the reply
   acknowledges with fix/remove chips wired to the existing
   confirm/edit/reject endpoints (auto-confirm on acknowledgement per §4,
   except sensitive categories). Questions answer as today. Mixed does both.
6. **Model picker (backend + UI):** `GET /models` returns the providers the
   caller's policies allow; composer dropdown; `POST /ask` accepts an optional
   `provider_id` honored only within policy (resolve_provider gains a
   requested-provider parameter; policy gates remain authoritative).
7. **Runbook + demo script updated;** six beats survive re-phrased (review beat
   becomes the recap keep/fix/remove flow).

Out of scope for S1: everything in S2–S6; real streaming; mobile; admin
console redesign beyond re-homing existing pages.

## 6. Testing & invariants for S1

Keyless deterministic path must fully work (mock intent heuristic + mock
extraction + mock answers). Permission filter before retrieval untouched.
No fictional UI (no mic, no calendar promises beyond the honest next-release
card). Existing suites stay green; new tests: intent routing, capture
acknowledgement wiring, models endpoint policy gating, attendance filter,
footnote rendering. Zero-jargon copy rule continues.
