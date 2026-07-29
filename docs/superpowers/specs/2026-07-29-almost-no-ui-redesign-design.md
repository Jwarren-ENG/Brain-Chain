# "Almost No UI" — Product Surface Redesign

**Date:** 2026-07-29
**Status:** Approved by Jacob 2026-07-29
**Builds on:** the demo slice (spec 2026-07-28) — no backend/API changes in this slice.

---

## 0. North star

Conversation is the interface. The product is an AI colleague — think the Curator
from Ready Player One — that sits in meetings, takes notes, asks a question only
when necessary, answers when called by name, and remembers everything the company
has approved. Employees meet it in meetings; individuals reach it in Slack by text
(later voice). The web app is not the product: it is the **control room** — the
human approval gate and the admin controls — and it should be small enough that
most employees never need it.

Positioning: Glean is a search box you have to visit. This is a colleague already
in the room. The UI's minimalism is the pitch.

A new engineer gets value in under two minutes with zero training, and the first
screen contains zero internal jargon.

## 1. The product's surfaces (priority order)

1. **In meetings** (Zoom / Google Meet / Teams): the AI participant. Joins via
   the Otter-style pattern — connect calendar → auto-join scheduled meetings, or
   paste a meeting link to send it into a call. **Next engineering slice**; this
   redesign shapes the UI to receive it but builds none of it.
2. **Slack** (individuals): DM or @mention, text — shipped in the demo slice and
   now framed as the PRIMARY individual interface. Voice chat and huddle
   participation are follow-on slices.
3. **Web control room** (this slice's build): review queue, meetings timeline,
   sources & admin, plus one fallback ask box.

## 2. This slice: shrink the web app

### 2.1 Navigation (8+ engineer items → 2 + landing)

- Engineer nav: **Meetings** · **My work**, plus the landing page and a ⚙ menu.
- Landing page replaces the "Today" dashboard: a single ask box (fallback/demo
  surface — already built), the backend's suggested questions, and at most three
  quiet cards: pending reviews (reviewers only, deep-link to the review screen),
  recent meetings, and **"+ Contribute"**.
- **"+ Contribute" menu** (landing + meetings page) is the single entry to:
  *Import a meeting* · *Tell the brain* (interviews) · *Protected feedback*.
  The flows behind these entries are untouched.
- **Removed from the product entirely:** Plans & agents, agent runs, and agent
  approvals (they are Jacob's internal AI-staff tooling, not the product; backend
  code stays dormant). "My work" keeps human tasks/action items only.
- **Merged:** Explorer + Company context + Decision memory become one **Library**
  page (three tabs), reachable from landing links and citation cards, not nav.
- **Relocated under ⚙ (role-gated, pages unchanged):** Team signals, Connected
  sources, Data governance, Model policies, Audit log, Administration, Brain map.

### 2.2 Meetings — the hero surface, Otter-shaped

Layout top-to-bottom:

- **(a) "Invite the assistant to your meetings" panel** in the Otter pattern
  (calendar connect / auto-join / paste-a-link). In this slice it renders as ONE
  honest card: "Live joining arrives in the next release — today, import a
  recording or transcript," with the Import button inside it. No fake toggles,
  no fictional calendar data. When the live agent ships, real controls replace
  the card with no layout change.
- **(b) Meeting timeline:** one card per meeting — title, date, summary, counts
  of what was captured, review status, Review link, Contribute-a-topic link.
- Meeting detail keeps recap + the review queue exactly as built.

### 2.3 Review queue — unchanged, promoted

The review screen stays a dedicated page (approved earlier in this brainstorm —
not in-chat cards). It is the control room's reason to exist: humans approving
what becomes company memory. Reviewers reach it from the landing card, "My work",
and meeting cards.

### 2.4 Language pass (customer-visible copy only)

- "Brain Interviews" → "Tell the brain". No "knowledge objects", "artifacts",
  or "extraction" in customer-visible copy — say "what the assistant captured".
- Provenance labels (VERIFIED / INFERENCE / CONFLICT / MISSING) stay exactly
  as they are — they are the trust story, not jargon.
- The assistant's display name is a single exported constant
  (`ASSISTANT_NAME`, placeholder "the brain") so the eventual branding decision
  ("Jarvis" is not ownable) is a one-line change.

## 3. Explicitly out of scope (each gets its own spec later)

Live meeting bot for Zoom/Meet/Teams (calendar OAuth, auto-join, in-meeting
speech — inherits the Otter UX contract above); voice chat and Slack huddle
participation; real connectors (Confluence, SharePoint, OneDrive, Salesforce,
Oracle, Foundry, …); any backend/API change; any permission-model change;
mobile.

## 4. Error handling & testing

- UI-only reorganization: server-side role checks remain the enforcement; nav
  gating only mirrors them.
- Existing error-first patterns (ErrorState before skeletons) carry over to the
  landing and any touched page.
- Tests: update nav/role rendering tests; existing page tests survive (pages
  move or merge, they don't lose behavior); Library tab tests; landing card
  tests. Web suite + typecheck green; backend suite untouched and green.
- Update `docs/runbooks/demo-script.md` to the new navigation.

## 5. Success criteria

1. Engineer web nav = 2 items + landing; admin surfaces invisible until ⚙.
2. All six demo beats from the runbook still run end to end.
3. Zero fictional UI anywhere; the live-agent panel is one honest card.
4. No internal jargon on any customer-visible surface.
5. An engineer who only ever uses Slack loses nothing except review/admin.
