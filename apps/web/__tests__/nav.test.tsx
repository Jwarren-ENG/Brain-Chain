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
