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

  it("counts actions and questions from the persist_extraction shape (imported/connector-synced meetings)", () => {
    // apps/api/app/services/meeting_extraction.py::persist_extraction writes
    // `actions` / `questions`, not the hand-authored seed's `action_items` /
    // `open_questions` — the card must count from whichever pair is present.
    const importedMeeting: MeetingInfo = {
      id: "m2",
      title: "Imported transcript meeting",
      held_at: "2026-07-21T10:00:00Z",
      source: "upload",
      attendees: ["Maria Santos", "Avery Chen"],
      extraction: {
        decisions: [{ text: "Switch bracket material", speaker: "Maria Santos" }],
        actions: [
          { task_id: "t1", turn_ids: [1], owner_name: "Avery Chen", due_hint: "Friday" },
          { task_id: "t2", turn_ids: [2], owner_name: "Maria Santos", due_hint: "" },
        ],
        risks: [{ text: "Supplier delay", speaker: "Maria Santos" }],
        questions: [
          { qid: "q1", text: "Requalify Supplier C?", raised_by: "Avery Chen", status: "proposed", turn_ids: [3] },
        ],
      },
      transcript_document_id: "d2",
    };
    render(<MeetingCard meeting={importedMeeting} onOpen={vi.fn()} onReflect={vi.fn()} />);
    expect(screen.getByText("2")).toBeInTheDocument(); // Actions
    // Decisions, Risks, and Questions each count 1 from the persist_extraction shape.
    expect(screen.getAllByText("1")).toHaveLength(3);
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });
});
