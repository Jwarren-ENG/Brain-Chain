import {
  ArtifactReviewCard,
  RecordingIndicator,
  VisibilityPicker,
} from "@/components/interview/shared";
import type { InterviewArtifactInfo } from "@brainchain/shared";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

describe("VisibilityPicker", () => {
  it("never offers anonymous for voice modes and explains why", () => {
    render(<VisibilityPicker mode="voice" value="named" onChange={() => {}} />);
    expect(screen.queryByRole("radio", { name: /anonymous/i })).not.toBeInTheDocument();
    expect(screen.getByText(/can't be anonymous/i)).toBeInTheDocument();
  });

  it("offers all three visibilities for text", () => {
    render(<VisibilityPicker mode="text" value="named" onChange={() => {}} />);
    expect(screen.getAllByRole("radio")).toHaveLength(3);
    expect(screen.getByRole("radio", { name: /anonymous/i })).toBeInTheDocument();
  });

  it("hides anonymous for individually-assigned interviews with an honest reason", () => {
    render(
      <VisibilityPicker mode="text" value="named" onChange={() => {}} allowAnonymous={false} />,
    );
    expect(screen.queryByRole("radio", { name: /anonymous/i })).not.toBeInTheDocument();
    expect(screen.getByText(/cohort of one is not anonymous/i)).toBeInTheDocument();
  });
});

describe("RecordingIndicator", () => {
  it("labels the recording state with text, not color alone", () => {
    render(<RecordingIndicator state="recording" elapsedSeconds={65} />);
    expect(screen.getByRole("status")).toHaveTextContent("Recording — microphone is live");
    expect(screen.getByRole("status")).toHaveTextContent("1:05");
  });

  it("labels paused state", () => {
    render(<RecordingIndicator state="paused" elapsedSeconds={0} />);
    expect(screen.getByRole("status")).toHaveTextContent("Paused — microphone muted");
  });
});

const artifact: InterviewArtifactInfo = {
  id: "a1",
  kind: "risk",
  summary: "The approval queue is a schedule risk.",
  details: {},
  confidence: 0.8,
  provenance: "firsthand",
  selected: true,
  employee_edited: false,
  uncertain: false,
  supporting_turn_ids: ["t1"],
  excerpt: "…the approval queue is a schedule risk…",
  published_target_type: null,
  published_target_id: null,
};

describe("ArtifactReviewCard", () => {
  it("explains the extraction in plain language and toggles inclusion", () => {
    const onToggle = vi.fn();
    render(
      <ArtifactReviewCard
        artifact={artifact}
        onToggle={onToggle}
        onEdit={() => {}}
        onShowSource={() => {}}
      />,
    );
    expect(screen.getByText("The brain understood this as a risk.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox"));
    expect(onToggle).toHaveBeenCalledWith(false);
  });

  it("lets the employee correct the summary", () => {
    const onEdit = vi.fn();
    render(
      <ArtifactReviewCard
        artifact={artifact}
        onToggle={() => {}}
        onEdit={onEdit}
        onShowSource={() => {}}
      />,
    );
    fireEvent.click(screen.getByText("Correct this"));
    const box = screen.getByLabelText("Edit summary");
    fireEvent.change(box, { target: { value: "Corrected wording." } });
    fireEvent.click(screen.getByText("Save correction"));
    expect(onEdit).toHaveBeenCalledWith("Corrected wording.");
  });
});
