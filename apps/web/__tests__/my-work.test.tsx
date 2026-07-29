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
