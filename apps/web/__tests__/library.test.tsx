import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LibraryTabs } from "../app/(app)/library/library-tabs";

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
