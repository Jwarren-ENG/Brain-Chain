import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { InvitePanel } from "../app/(app)/meetings/invite-panel";

describe("InvitePanel", () => {
  it("is one honest card: next-release label, import CTA, no toggles or calendar data", () => {
    render(<InvitePanel importSlot={<button>Import a meeting</button>} />);
    // Check that "next release" appears in a badge
    expect(screen.getAllByText(/next release/i)).toHaveLength(2); // badge + body text
    expect(screen.getByRole("button", { name: /import a meeting/i })).toBeInTheDocument();
    expect(screen.queryByRole("switch")).toBeNull();       // no fake auto-join toggles
    expect(screen.queryByText(/connect.*calendar/i)).toBeNull(); // no fake calendar CTA
  });
});
