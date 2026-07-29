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
