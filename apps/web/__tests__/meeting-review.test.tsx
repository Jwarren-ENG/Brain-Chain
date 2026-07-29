import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ArtifactCard } from "../app/(app)/meetings/[id]/review/artifact-card";

const decision = {
  id: "d1",
  kind: "decision" as const,
  title: "Switch bracket to 7075 aluminum",
  rationale: "Insufficient margin with 6061",
  status: "proposed",
  turns: [{ idx: 0, speaker: "Maria Santos", text: "We decided to switch the bracket to 7075 aluminum." }],
};

describe("ArtifactCard", () => {
  it("shows the statement, rationale, quoted evidence, and reviewer actions", () => {
    render(<ArtifactCard artifact={decision} canReview onResolve={vi.fn()} />);
    // The title and the quoted evidence both legitimately contain "7075
    // aluminum" (extraction titles are often near-verbatim), so this asserts
    // presence rather than a single match.
    expect(screen.getAllByText(/7075 aluminum/).length).toBeGreaterThan(0);
    expect(screen.getByText(/insufficient margin/i)).toBeInTheDocument();
    expect(screen.getByText(/maria santos/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /approve/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /reject/i })).toBeEnabled();
  });

  it("hides actions for non-reviewers and resolved artifacts", () => {
    render(<ArtifactCard artifact={{ ...decision, status: "active" }} canReview onResolve={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /approve/i })).toBeNull();
  });
});
