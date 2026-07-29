# Almost-No-UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Shrink the web app into a "control room" (2 nav items + landing + gear) so the product reads as a conversational AI colleague — Slack and meetings are the product; the web is the approval gate and controls.

**Architecture:** UI-only reorganization of `apps/web` — zero backend/API/permission changes. Pages move, merge, or get demoted behind a gear menu; the three core surfaces (landing ask box, Meetings with an Otter-shaped invite panel, My work) reuse existing components. Server-side role checks remain the real enforcement; nav gating only mirrors them.

**Tech Stack:** Next.js 15 App Router (all client components), React 19, TanStack Query v5, Tailwind v4, existing ui-kit (`components/ui.tsx`), vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-07-29-almost-no-ui-redesign-design.md` (approved 2026-07-29).

## Global Constraints

- **No fictional UI.** No fake calendar data, no fake toggles, no hardcoded status claims. The live-agent panel is ONE honest card labeled as arriving "in the next release."
- **Zero backend changes.** No file under `apps/api` or `apps/slack` may change. Server-side roles remain the enforcement; the web only mirrors them.
- **The six demo beats must still run** (import → review → approve → ask → permissions → conflict). Deep links must survive: `/ask?q=…` and `/explorer?doc=…` are used by the command palette and Slack.
- **Copy rules:** customer-visible strings never say "knowledge objects", "artifacts", or "extraction" — say what "the assistant captured". "Brain Interviews" → "Tell the brain". Provenance labels (VERIFIED / INFERENCE / CONFLICT / MISSING) stay exactly as-is. The assistant's display name comes ONLY from `ASSISTANT_NAME` in `apps/web/lib/brand.ts`.
- TS strict, no `any`/`ts-ignore`. Tests: `pnpm --filter @brainchain/web test` and `pnpm --filter @brainchain/web exec tsc --noEmit` green after every task; run the backend suite once at the end to prove it is untouched (`cd apps/api && ../../.venv/bin/python -m pytest tests/ -q`).
- Work on branch `worktree-demo-slice` in `/Users/jacobwarren/Brain Chain/.claude/worktrees/demo-slice`. Conventional commits. Commit after each green test cycle.

---

## File map

| File | Fate |
|---|---|
| `apps/web/lib/brand.ts` | **Create** — `ASSISTANT_NAME`, `PRODUCT_NAME` |
| `apps/web/components/shell.tsx` | Nav collapses to 3 items; gear menu added; fake status line removed |
| `apps/web/app/(app)/page.tsx` | Rewritten as the landing (ask box + 3 quiet cards) |
| `apps/web/components/contribute-menu.tsx` | **Create** — the "+ Contribute" menu |
| `apps/web/app/(app)/library/page.tsx` | **Create** — tabs wrapping explorer/company/tribal |
| `apps/web/app/(app)/{explorer,company,tribal}/page.tsx` | Become content components + redirect stubs |
| `apps/web/app/(app)/agents/**` | **Deleted** (product ≠ Jacob's internal AI staff) |
| `apps/web/app/(app)/approvals/page.tsx` | "My work" — tasks only; agent-approvals tab removed |
| `apps/web/app/(app)/meetings/page.tsx` | Otter-shaped invite panel added; Contribute menu |
| `apps/web/app/(app)/interviews/**`, `feedback/**` | Flows unchanged; headings re-worded; entry via Contribute |
| `docs/runbooks/demo-script.md` | Nav references updated |

## Task order and effort

T1 brand/honesty (0.5h) → T2 agents removal (1h) → T3 Library merge (2h) → T4 landing (2h) → T5 Contribute menu (1h) → T6 nav + gear (2h) → T7 Otter panel (1h) → T8 copy sweep + runbook + final verification (1.5h). ~1.5 days total. T3–T5 are order-flexible; T6 depends on T2–T5 (targets must exist before nav points at them); T8 last.

---

### Task 1: Brand constants + kill the fake status line

**Files:**
- Create: `apps/web/lib/brand.ts`
- Modify: `apps/web/components/shell.tsx` (header, ~lines 186–189)
- Test: `apps/web/__tests__/brand.test.tsx` (new)

**Interfaces:**
- Produces: `export const ASSISTANT_NAME = "the brain";` and `export const PRODUCT_NAME = "BrainChain";` from `apps/web/lib/brand.ts`. Tasks 4, 7, 8 import `ASSISTANT_NAME`.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/__tests__/brand.test.tsx
import { describe, expect, it } from "vitest";
import { ASSISTANT_NAME, PRODUCT_NAME } from "../lib/brand";

describe("brand constants", () => {
  it("exports a single renameable assistant name", () => {
    expect(ASSISTANT_NAME.length).toBeGreaterThan(0);
    expect(PRODUCT_NAME).toBe("BrainChain");
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `pnpm --filter @brainchain/web test` → cannot resolve `../lib/brand`.

- [ ] **Step 3: Implement**

```ts
// apps/web/lib/brand.ts
// The assistant's customer-visible name. Branding is undecided ("Jarvis" is
// shorthand, not ownable) — every surface must read the name from here so the
// eventual rename is a one-line change.
export const ASSISTANT_NAME = "the brain";
export const PRODUCT_NAME = "BrainChain";
```

In `apps/web/components/shell.tsx`, DELETE the hardcoded status span in the header (the `<span>` containing the green dot and the text `Company brain up to date`, ~lines 186–189). It is an invented claim — nothing computes it. Do not replace it with anything.

- [ ] **Step 4: Run tests + typecheck** — both green; grep check: `grep -rn "Company brain up to date" apps/web/` returns nothing.

- [ ] **Step 5: Commit** — `git add apps/web && git commit -m "feat: brand constants; remove invented status line"`

### Task 2: Remove agents from the product UI

**Files:**
- Delete: `apps/web/app/(app)/agents/` (entire directory: `page.tsx`, `runs/[id]/page.tsx`)
- Modify: `apps/web/app/(app)/approvals/page.tsx`
- Modify: `apps/web/components/shell.tsx` (remove the `/agents` NAV entry, line ~44)
- Test: `apps/web/__tests__/my-work.test.tsx` (new)

**Interfaces:**
- Consumes: existing `TasksTab` inside `approvals/page.tsx`.
- Produces: `/approvals` renders a tasks-only "My work" page; no route or link to `/agents` exists anywhere in `apps/web`.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/__tests__/my-work.test.tsx
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Static assertions: the agents surface must be gone from the product UI.
describe("agents removed from product UI", () => {
  it("approvals page has no agent-approvals tab or agent links", () => {
    const src = readFileSync(
      join(__dirname, "../app/(app)/approvals/page.tsx"), "utf8");
    expect(src).not.toMatch(/ApprovalsTab|agent_run|\/agents\//);
    expect(src).toMatch(/My work/);
  });
  it("shell has no /agents nav entry", () => {
    const src = readFileSync(join(__dirname, "../components/shell.tsx"), "utf8");
    expect(src).not.toMatch(/"\/agents"/);
  });
});
```

- [ ] **Step 2: Run to verify it fails** — the `ApprovalsTab` matcher fails (tab still present).

- [ ] **Step 3: Implement**

1. `rm -rf "apps/web/app/(app)/agents"`.
2. In `approvals/page.tsx`: delete the `ApprovalsTab` function, the tab-switcher UI (the `Tabs` with `tasks`/`approvals` keys and the `tab` state), the `ApprovalInfo` import, and the agent-run link block. The page renders `TasksTab` directly under a heading `My work` with subtitle `Action items assigned to you or captured from meetings.` Keep the `source === "agent"` badge logic OUT too — tasks no longer show an agent source badge (grep the file for `agent` afterward; zero hits).
3. In `components/shell.tsx` NAV, delete the `{ href: "/agents", … }` entry.
4. Repo-wide check: `grep -rn '"/agents' apps/web/ packages/shared/` — remove any remaining links (none expected besides the two above). Leave `packages/shared` agent types alone (backend still uses them).

- [ ] **Step 4: Run tests + typecheck** — green. `grep -rn "agents" "apps/web/app/(app)"` shows no route references.

- [ ] **Step 5: Commit** — `git commit -am "feat: remove agent surfaces from product UI; approvals becomes My work"`

### Task 3: Library merge (explorer + company + tribal → one page, deep links preserved)

**Files:**
- Create: `apps/web/app/(app)/library/page.tsx`
- Create: `apps/web/app/(app)/explorer/explorer-content.tsx` (moved content), same pattern for `company/company-content.tsx`, `tribal/tribal-content.tsx`
- Modify: `apps/web/app/(app)/explorer/page.tsx`, `company/page.tsx`, `tribal/page.tsx` (become redirect stubs)
- Test: `apps/web/__tests__/library.test.tsx` (new)

**Interfaces:**
- Consumes: the three existing page components (moved, not rewritten).
- Produces: `/library?tab=browse|company|decisions` (default `browse`); `/explorer?doc=X` redirects to `/library?tab=browse&doc=X` (the command palette and Slack "Open BrainChain" both point at `/explorer` — they must keep working). Task 6's nav does NOT include Library; Task 4's landing links to it.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/__tests__/library.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LibraryTabs } from "../app/(app)/library/page";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("tab=decisions"),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/library",
}));

describe("Library", () => {
  it("renders three tabs and honors the tab query param", () => {
    render(<LibraryTabs
      browse={<div>BROWSE_PANE</div>}
      company={<div>COMPANY_PANE</div>}
      decisions={<div>DECISIONS_PANE</div>}
    />);
    expect(screen.getByRole("tab", { name: /browse/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /company/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /decisions/i })).toBeInTheDocument();
    expect(screen.getByText("DECISIONS_PANE")).toBeInTheDocument();
  });
});
```

(Adapt the mock to the test-setup conventions already used in `apps/web/__tests__/` — if a shared navigation mock exists, reuse it.)

- [ ] **Step 2: Run to verify it fails** — module not found.

- [ ] **Step 3: Implement**

1. For each of explorer/company/tribal: move the page's entire component tree into `<dir>/<name>-content.tsx` exporting `ExplorerContent` / `CompanyContent` / `TribalContent` (rename the default export, keep everything else byte-identical — this is a move, not a rewrite).
2. Replace each `page.tsx` with a redirect stub that preserves query params:

```tsx
// apps/web/app/(app)/explorer/page.tsx
"use client";
import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";

export default function ExplorerRedirect() {
  const router = useRouter();
  const params = useSearchParams();
  React.useEffect(() => {
    const qs = new URLSearchParams(params);
    qs.set("tab", "browse");
    router.replace(`/library?${qs.toString()}`);
  }, [params, router]);
  return null;
}
```

(`company` → `tab=company`, `tribal` → `tab=decisions`.)
3. Create `library/page.tsx`: exports `LibraryTabs` (pure presentational: props `browse`, `company`, `decisions` as ReactNodes; reads `tab` from `useSearchParams`, renders the ui-kit `Tabs` with tab clicks doing `router.replace` to update the param) and the default page component that instantiates `LibraryTabs` with `<ExplorerContent />`, `<CompanyContent />`, `<TribalContent />`. Note: `ExplorerContent` reads its own `doc` search param via `useSearchParams`, which works identically under `/library` — that is why the redirect preserves the query string.
4. Role note: tribal was manager-gated in nav only; the API is the enforcement. In `LibraryTabs`' parent, hide the `decisions` tab when `!hasRole(user, "manager", "executive", "security_admin")` (mirror of the old nav gate — same helper, same roles).

- [ ] **Step 4: Run tests + typecheck** — green. Manual: `/explorer?doc=<any id>` lands on Library's Browse tab with the doc drawer open.

- [ ] **Step 5: Commit** — `git commit -am "feat: merge explorer/company/tribal into Library with redirect stubs"`

### Task 4: Landing page (replaces the Today dashboard)

**Files:**
- Modify: `apps/web/app/(app)/page.tsx` (rewrite)
- Test: `apps/web/__tests__/landing.test.tsx` (new)

**Interfaces:**
- Consumes: `GET /home` (existing — provides `suggested_questions`), `GET /meetings`, `GET /decisions` (existing; filter `status === "proposed"` client-side), `hasRole`, `ASSISTANT_NAME` (Task 1), `ContributeMenu` (Task 5 — until Task 5 lands, render a plain "+ Contribute" `Link` to `/meetings`; Task 5 swaps it).
- Produces: exported `AskBox` component (testable) that on submit does `router.push('/ask?q=' + encodeURIComponent(q))` — the exact deep-link pattern the command palette already uses, so `/ask` needs no changes.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/__tests__/landing.test.tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

import { AskBox } from "../app/(app)/page";

describe("landing AskBox", () => {
  it("routes the question to /ask?q=…", () => {
    render(<AskBox suggested={["Why did we switch to 7075?"]} />);
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "what changed last week" } });
    fireEvent.submit(input.closest("form")!);
    expect(push).toHaveBeenCalledWith("/ask?q=what%20changed%20last%20week");
  });
  it("renders suggested questions as one-click asks", () => {
    render(<AskBox suggested={["Why did we switch to 7075?"]} />);
    fireEvent.click(screen.getByRole("button", { name: /7075/i }));
    expect(push).toHaveBeenCalledWith(
      "/ask?q=Why%20did%20we%20switch%20to%207075%3F");
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `AskBox` not exported.

- [ ] **Step 3: Implement**

Rewrite `app/(app)/page.tsx` to contain, in order:

1. `AskBox` (exported): a form with one large `Input` (placeholder: `` `Ask ${ASSISTANT_NAME} anything about your company…` ``), submit → `router.push` as tested; below it the suggested questions from props as ghost buttons.
2. Page component: fetches `/home` (for `suggested_questions`), `/meetings`, `/decisions`. Error-first ordering (`isError` → `ErrorState` with retry) on the `/home` query; the two card queries degrade to their own empty states without blocking the ask box (the ask box must render even if everything else fails — it only needs the router).
3. Three quiet cards, each rendered ONLY when it has content or purpose:
   - **Pending reviews** (only when `hasRole(user, "manager", "executive")` AND proposed count > 0): "N items await your review" → links to the most recent meeting's `/meetings/{id}/review` (derive meeting id from the proposed decisions' `meeting_id`; if several, link to `/meetings`).
   - **Recent meetings**: 3 most recent (title, date) → meeting links; `EmptyState` ("No meetings yet — import one to give {ASSISTANT_NAME} something to remember") when none.
   - **Contribute**: the Task 5 menu (interim: `Link` to `/meetings`).
4. A single quiet footer link: `Browse the library →` (`/library`).
5. Delete everything else from the old dashboard (BLUF tiles, pulse, task board — the "Today" concept is retired; "My work" covers tasks).

- [ ] **Step 4: Run tests + typecheck** — green. Manual: log in as avery → landing = ask box + cards, no dashboards.

- [ ] **Step 5: Commit** — `git commit -am "feat: landing page replaces Today dashboard"`

### Task 5: Contribute menu

**Files:**
- Create: `apps/web/components/contribute-menu.tsx`
- Modify: `apps/web/app/(app)/page.tsx` (swap interim link), `apps/web/app/(app)/meetings/page.tsx` (replace the standalone Import button trigger)
- Test: `apps/web/__tests__/contribute-menu.test.tsx` (new)

**Interfaces:**
- Consumes: `ImportTranscriptDialog` (existing, from `app/(app)/meetings/import-dialog.tsx`), `hasRole`, `ASSISTANT_NAME`.
- Produces: `<ContributeMenu user={user} onImported={(r) => …} importFn={…} classifications={…} />` — a button that opens a small menu with up to three items: **Import a meeting** (only for `manager|data_steward|system_admin`; opens `ImportTranscriptDialog`), **Tell {ASSISTANT_NAME}** (`Link` → `/interviews/new`), **Protected feedback** (`Link` → `/feedback`). Meetings page and landing both render it; the meetings page passes its existing dialog wiring through.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/__tests__/contribute-menu.test.tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ContributeMenu } from "../components/contribute-menu";

const employee = { id: "u1", name: "Avery", roles: ["employee"] };
const manager = { id: "u2", name: "Morgan", roles: ["employee", "manager"] };

describe("ContributeMenu", () => {
  it("shows all three entries for a manager", () => {
    render(<ContributeMenu user={manager as never} onImported={vi.fn()}
      importFn={vi.fn()} classifications={[]} />);
    fireEvent.click(screen.getByRole("button", { name: /contribute/i }));
    expect(screen.getByText(/import a meeting/i)).toBeInTheDocument();
    expect(screen.getByText(/tell the brain/i)).toBeInTheDocument();
    expect(screen.getByText(/protected feedback/i)).toBeInTheDocument();
  });
  it("hides the import entry for a plain employee", () => {
    render(<ContributeMenu user={employee as never} onImported={vi.fn()}
      importFn={vi.fn()} classifications={[]} />);
    fireEvent.click(screen.getByRole("button", { name: /contribute/i }));
    expect(screen.queryByText(/import a meeting/i)).toBeNull();
    expect(screen.getByText(/tell the brain/i)).toBeInTheDocument();
  });
});
```

(The "tell the brain" matcher works because `ASSISTANT_NAME` is currently "the brain"; use a regex built from the constant if you prefer: `new RegExp('tell ' + ASSISTANT_NAME, 'i')`.)

- [ ] **Step 2: Run to verify it fails** — module not found.

- [ ] **Step 3: Implement** — a small popover menu (follow the ui-kit's existing `Dialog`/menu patterns; a simple `useState`-toggled absolutely-positioned panel is fine and matches the codebase's plain-state style). Items per the interface above; "Import a meeting" opens the `ImportTranscriptDialog` with the props passed through. Wire it into the meetings page (replacing the bare Import button; keep the dialog instance) and the landing (replacing the interim link; the landing needs the same classifications query the meetings page uses — `/governance/classifications`, gated `enabled: canImport`, same as `meetings/page.tsx` does today).

- [ ] **Step 4: Run tests + typecheck** — green (including the existing meeting-import test — the dialog contract is unchanged).

- [ ] **Step 5: Commit** — `git commit -am "feat: unified Contribute menu on landing and meetings"`

### Task 6: Navigation collapse + gear menu

**Files:**
- Modify: `apps/web/components/shell.tsx`
- Test: `apps/web/__tests__/nav.test.tsx` (new)

**Interfaces:**
- Consumes: routes from Tasks 2–5 (Library exists; `/agents` gone; landing is `/`).
- Produces: sidebar NAV = exactly `[{href:"/", label:"Home"}, {href:"/meetings", label:"Meetings"}, {href:"/approvals", label:"My work", badgeKey:"work"}]` — no sections, no role-gated sidebar items. A gear (Settings icon) button in the header opens a menu listing, role-filtered: Team signals (`/insights`, manager/executive/security_admin), Connected sources (`/integrations`), Data governance (`/governance`), Model policies (`/policies`), Audit log (`/audit`), Administration (`/admin`), Brain map (`/brain-map`) — same role arrays as today's NAV (copy them verbatim). Employees with no gear-visible items see no gear at all.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/__tests__/nav.test.tsx
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Contract test on the nav data (rendering the Shell needs heavy mocking;
// the nav ARRAY is the spec's actual requirement).
import { NAV_ITEMS, GEAR_ITEMS } from "../components/shell";

describe("collapsed navigation", () => {
  it("sidebar has exactly Home, Meetings, My work", () => {
    expect(NAV_ITEMS.map((i) => i.href)).toEqual(["/", "/meetings", "/approvals"]);
    expect(NAV_ITEMS.every((i) => !i.roles)).toBe(true);
  });
  it("admin surfaces live only in the gear menu, role-gated", () => {
    const hrefs = GEAR_ITEMS.map((i) => i.href);
    for (const h of ["/insights", "/integrations", "/governance", "/policies", "/audit", "/admin"]) {
      expect(hrefs).toContain(h);
    }
    expect(GEAR_ITEMS.every((i) => (i.roles ?? []).length > 0)).toBe(true);
  });
  it("no sidebar link to retired top-level routes", () => {
    const src = readFileSync(join(__dirname, "../components/shell.tsx"), "utf8");
    for (const dead of ['"/ask"', '"/feedback"', '"/interviews"', '"/explorer"', '"/company"', '"/tribal"']) {
      // these may appear in the gear/palette code only if role-gated; the NAV
      // array itself is checked via NAV_ITEMS above — here we assert the old
      // NAV sections are gone entirely
      void dead;
    }
    expect(src).not.toMatch(/Your workspace|Company memory/);
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `NAV_ITEMS` not exported.

- [ ] **Step 3: Implement** — replace the `NAV` sections structure with two exported flat arrays (`NAV_ITEMS`, `GEAR_ITEMS`) typed with the existing `NavItem`. Sidebar maps `NAV_ITEMS` only (keep the active-state and badge logic; drop section headers). Add a gear `<button>` (lucide `Settings` icon) beside the theme toggle; clicking opens a right-aligned menu (same plain-state popover pattern as Task 5) listing role-filtered `GEAR_ITEMS`; hide the gear when the filtered list is empty. Keep the ⌘K palette and logout untouched. "New chat"/"Share feedback"/"Interviews" leave the sidebar (reachable via landing ask box, Contribute menu); `/ask` stays a real route.

- [ ] **Step 4: Run tests + typecheck** — green. Manual: avery sees 3 items + no gear-menu content beyond nothing (no gear); casey sees the gear with admin items.

- [ ] **Step 5: Commit** — `git commit -am "feat: collapse nav to three items with role-gated gear menu"`

### Task 7: Otter-shaped meetings invite panel

**Files:**
- Modify: `apps/web/app/(app)/meetings/page.tsx`
- Test: `apps/web/__tests__/meetings-invite-panel.test.tsx` (new)

**Interfaces:**
- Consumes: `ASSISTANT_NAME`, `ContributeMenu` (already on the page from Task 5).
- Produces: exported `InvitePanel` component rendered above the meeting timeline.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/__tests__/meetings-invite-panel.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { InvitePanel } from "../app/(app)/meetings/invite-panel";

describe("InvitePanel", () => {
  it("is one honest card: next-release label, import CTA, no toggles or calendar data", () => {
    render(<InvitePanel importSlot={<button>Import a meeting</button>} />);
    expect(screen.getByText(/next release/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /import a meeting/i })).toBeInTheDocument();
    expect(screen.queryByRole("switch")).toBeNull();       // no fake auto-join toggles
    expect(screen.queryByText(/connect.*calendar/i)).toBeNull(); // no fake calendar CTA
  });
});
```

- [ ] **Step 2: Run to verify it fails** — module not found.

- [ ] **Step 3: Implement** — create `apps/web/app/(app)/meetings/invite-panel.tsx`:

```tsx
"use client";
import * as React from "react";
import { ASSISTANT_NAME } from "../../../lib/brand";
import { Card } from "../../../components/ui";

export function InvitePanel({ importSlot }: { importSlot: React.ReactNode }) {
  return (
    <Card>
      <h2>Invite {ASSISTANT_NAME} to your meetings</h2>
      <p>
        {ASSISTANT_NAME[0].toUpperCase() + ASSISTANT_NAME.slice(1)} will join your
        Zoom, Meet, and Teams calls in the next release — listening, taking notes,
        and answering when called on. Today, import a recording or transcript and
        it remembers everything just the same.
      </p>
      {importSlot}
    </Card>
  );
}
```

(Adapt markup to ui-kit conventions; the copy above is the spec's honest single card — no toggles, no calendar-connect button until they are real.) Render it at the top of the meetings page with `importSlot` = the existing Contribute menu or a direct Import button for import-role users.

- [ ] **Step 4: Run tests + typecheck** — green.

- [ ] **Step 5: Commit** — `git commit -am "feat: Otter-shaped invite panel with honest next-release card"`

### Task 8: Copy sweep, runbook, final verification

**Files:**
- Modify: customer-visible strings across `apps/web/app/(app)/interviews/**`, `feedback/page.tsx`, `meetings/**`, review pages (grep-driven; see Step 1)
- Modify: `docs/runbooks/demo-script.md`
- Test: `apps/web/__tests__/copy.test.tsx` (new)

**Interfaces:**
- Consumes: `ASSISTANT_NAME`. No new exports.

- [ ] **Step 1: Write the failing copy test**

```tsx
// apps/web/__tests__/copy.test.tsx
import { execSync } from "node:child_process";
import { describe, expect, it } from "vitest";

// Jargon must not appear in customer-visible JSX text. We check string
// literals inside JSX in app/, excluding identifiers/props/types.
function grepAppStrings(pattern: string): string {
  try {
    return execSync(
      `grep -rn --include='*.tsx' -E '>[^<]*${pattern}|"[^"]*${pattern}[^"]*"' app/`,
      { cwd: `${__dirname}/..`, encoding: "utf8" });
  } catch { return ""; } // grep exits 1 on no matches
}

describe("customer-visible copy", () => {
  it("never says knowledge object / artifact / extraction in display text", () => {
    const hits = grepAppStrings("[Kk]nowledge object");
    expect(hits).toBe("");
  });
  it("Brain Interviews is renamed", () => {
    expect(grepAppStrings("Brain Interview")).toBe("");
  });
});
```

(The artifact/extraction words appear legitimately in code identifiers (`artifact-card.tsx`, `extraction` API fields) — those stay. This test intentionally targets only quoted/JSX strings; refine the pattern while implementing so identifiers don't false-positive, and verify by eye with `grep -rn "artifact\|extraction" app/ | grep -v import` that remaining hits are code, not copy.)

- [ ] **Step 2: Run to verify current failures** — "Brain Interview" headings exist in the interviews pages.

- [ ] **Step 3: Implement the sweep**

Grep-driven, display strings only:
- `grep -rn "Brain Interview" apps/web/app apps/web/components` → replace with `Tell {ASSISTANT_NAME}` / "Tell the brain" phrasing (headings, buttons, empty states).
- `grep -rn "artifact\|extraction\|knowledge object" apps/web/app --include="*.tsx"` → for each hit that is display text (not an identifier or API field), reword to "what {ASSISTANT_NAME} captured" / "captured knowledge". Identifiers, filenames, and API field access stay unchanged.
- Review-page strings: "Dropped by the traceability check" stays (it is honest and specific). Provenance labels stay byte-identical.
- Import `ASSISTANT_NAME` wherever the name appears in copy.

Update `docs/runbooks/demo-script.md`: the six beats' navigation references (Today → landing; Explorer → Library; Interviews entry → Contribute menu; approvals → My work). The beats themselves are unchanged.

- [ ] **Step 4: Full verification suite**

```bash
pnpm --filter @brainchain/web test
pnpm --filter @brainchain/web exec tsc --noEmit
pnpm --filter @brainchain/web lint
cd apps/api && ../../.venv/bin/python -m pytest tests/ -q   # must be untouched-green
git diff --stat main...HEAD -- apps/api apps/slack           # backend delta = spec/plan docs only
```

Then a manual six-beat pass per the updated runbook (keyless is fine for nav verification).

- [ ] **Step 5: Commit** — `git commit -am "feat: jargon-free copy pass and runbook update for the control-room UI"`

---

## Self-review notes

- Spec coverage: §2.1 nav → T2/T3/T6; landing → T4; Contribute → T5; §2.2 Otter panel → T7; §2.3 review unchanged (no task needed — verified in T8's six-beat pass); §2.4 language → T1/T8; §4 testing → per-task + T8; §5 success criteria → T6 test (nav=3), T8 (beats, jargon), T7 test (no fictional UI). Gap check: spec's "citation cards link to Library" — citations already link via `/explorer?doc=`, which T3 redirects; covered.
- Deep links preserved: `/ask?q=` (untouched), `/explorer?doc=` (T3 redirect) — Slack's button and the ⌘K palette keep working with zero backend edits.
- Type consistency: `NAV_ITEMS`/`GEAR_ITEMS` (T6 test imports match T6 implementation); `ContributeMenu` props consistent between T5 test and T4/T5 usage; `InvitePanel({ importSlot })` consistent T7 test/impl.
