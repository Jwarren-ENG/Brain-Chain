import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MeetingCard } from "../app/(app)/meetings/page";
import type { MeetingInfo } from "@brainchain/shared";

const meeting: MeetingInfo = {
  id: "m1",
  title: "Weekly program review",
  held_at: "2026-07-20T10:00:00Z",
  source: "zoom",
  attendees: ["Maria Santos", "Avery Chen"],
  extraction: {
    decisions: [{ text: "Switch bracket material", speaker: "Maria Santos" }],
  },
  transcript_document_id: "d1",
};

describe("MeetingCard", () => {
  it("links 'Contribute a topic' to the real meeting-prep interview flow", () => {
    render(<MeetingCard meeting={meeting} onOpen={vi.fn()} onReflect={vi.fn()} />);
    const link = screen.getByRole("link", { name: /contribute a topic/i });
    expect(link).toHaveAttribute("href", "/interviews/new?purpose=meeting_prep&meeting=m1");
  });

  it("still links to review and shows the decision count — no fictional data", () => {
    render(<MeetingCard meeting={meeting} onOpen={vi.fn()} onReflect={vi.fn()} />);
    expect(screen.getByRole("link", { name: /review knowledge/i })).toHaveAttribute(
      "href",
      "/meetings/m1/review",
    );
    expect(screen.getByText("1")).toBeInTheDocument();
  });
});
