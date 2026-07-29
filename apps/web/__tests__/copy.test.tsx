import { execSync } from "node:child_process";
import { describe, expect, it } from "vitest";

// Jargon must not appear in customer-visible JSX text. We check string
// literals inside JSX in app/, excluding identifiers/props/types.
//
// The two structural regexes below only look inside JSX text nodes
// (`>...text...<`) and quoted string literals (`"...text..."`) — they
// never match bare property access like `artifact.kind` or component/type
// names like `ArtifactCard`, since those never appear between `>`/`<` or
// inside quotes as prose. The one place quoted strings legitimately contain
// these words is `import ... from "./artifact-card"` style module
// specifiers, so import lines are filtered out after the grep runs.
function grepAppStrings(pattern: string): string {
  try {
    const raw = execSync(
      `grep -rn --include='*.tsx' -E '>[^<]*${pattern}|"[^"]*${pattern}[^"]*"' app/`,
      { cwd: `${__dirname}/..`, encoding: "utf8" },
    );
    return raw
      .split("\n")
      .filter((line) => line && !/^[^:]+:\d+:\s*import /.test(line))
      .join("\n");
  } catch {
    return ""; // grep exits 1 on no matches
  }
}

describe("customer-visible copy", () => {
  it("never says knowledge object / artifact / extraction in display text", () => {
    const hits = grepAppStrings("[Kk]nowledge object");
    expect(hits).toBe("");
  });
  it("Brain Interview is renamed", () => {
    expect(grepAppStrings("Brain Interview")).toBe("");
  });
});
