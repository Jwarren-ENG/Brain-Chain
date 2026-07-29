import { describe, expect, it } from "vitest";
import { ASSISTANT_NAME, PRODUCT_NAME } from "../lib/brand";

describe("brand constants", () => {
  it("exports a single renameable assistant name", () => {
    expect(ASSISTANT_NAME.length).toBeGreaterThan(0);
    expect(PRODUCT_NAME).toBe("BrainChain");
  });
});
