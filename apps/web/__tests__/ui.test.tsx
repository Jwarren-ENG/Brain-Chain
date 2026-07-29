import { ClassificationBadge, StatusChip } from "@/components/ui";
import { SegmentLegend } from "@/components/evidence";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

describe("StatusChip", () => {
  it("renders human-readable status text", () => {
    render(<StatusChip status="awaiting_approval" />);
    expect(screen.getByText("awaiting approval")).toBeInTheDocument();
  });
});

describe("ClassificationBadge", () => {
  it("shows the classification name and level tooltip", () => {
    render(
      <ClassificationBadge
        classification={{ id: "x", name: "Restricted", level: 3, color: "red" }}
      />,
    );
    const badge = screen.getByText("Restricted");
    expect(badge).toBeInTheDocument();
    expect(badge.closest("span")).toHaveAttribute(
      "title",
      expect.stringContaining("level 3"),
    );
  });
});

describe("SegmentLegend", () => {
  it("labels every provenance type present, once", () => {
    render(
      <SegmentLegend
        segments={[
          { type: "verified", text: "a", citations: [1] },
          { type: "verified", text: "b", citations: [2] },
          { type: "conflict", text: "c", citations: [1, 2] },
          { type: "missing", text: "d", citations: [] },
        ]}
      />,
    );
    expect(screen.getAllByText("Verified company information")).toHaveLength(1);
    expect(screen.getByText("Conflicting sources")).toBeInTheDocument();
    expect(screen.getByText("Missing information")).toBeInTheDocument();
    expect(screen.queryByText("Model inference")).not.toBeInTheDocument();
  });
});
