import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MeetingHeader } from "../app/(app)/meetings/meeting-header";
import type { MeetingInfo } from "@brainchain/shared";

const meeting = {
  id: "m1",
  title: "Bracket design review",
  held_at: "2026-07-21T10:00:00Z",
  source: "upload",
  attendees: ["Maria Santos", "David Kim"],
  extraction: { turns: [] },
  transcript_document_id: "d1",
} as unknown as MeetingInfo;

describe("MeetingHeader", () => {
  it("keeps the contribute-a-topic entry point reachable", () => {
    render(<MeetingHeader meeting={meeting} onDetails={vi.fn()} onReflect={vi.fn()} />);
    const link = screen.getByRole("link", { name: /contribute a topic/i });
    expect(link).toHaveAttribute("href", "/interviews/new?purpose=meeting_prep&meeting=m1");
  });

  it("links to the review queue and shows meeting identity", () => {
    render(<MeetingHeader meeting={meeting} onDetails={vi.fn()} onReflect={vi.fn()} />);
    expect(screen.getByRole("link", { name: /review knowledge/i })).toHaveAttribute(
      "href",
      "/meetings/m1/review",
    );
    expect(screen.getByText(/bracket design review/i)).toBeInTheDocument();
    expect(screen.getByText(/2 attendees/i)).toBeInTheDocument();
  });
});
