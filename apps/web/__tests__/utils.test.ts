import { formatMoney, hasRole } from "@/lib/utils";
import { describe, expect, it } from "vitest";

describe("formatMoney", () => {
  it("scales to K and M", () => {
    expect(formatMoney(950)).toBe("$950");
    expect(formatMoney(62_000)).toBe("$62K");
    expect(formatMoney(5_300_000)).toBe("$5.3M");
  });
});

describe("hasRole", () => {
  const user = { roles: ["employee", "manager"] };
  it("matches any of the requested roles", () => {
    expect(hasRole(user, "manager")).toBe(true);
    expect(hasRole(user, "executive", "manager")).toBe(true);
    expect(hasRole(user, "security_admin")).toBe(false);
    expect(hasRole(null, "employee")).toBe(false);
  });
});
