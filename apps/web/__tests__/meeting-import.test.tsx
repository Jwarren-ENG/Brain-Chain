import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ImportTranscriptDialog } from "../app/(app)/meetings/import-dialog";

describe("ImportTranscriptDialog", () => {
  it("renders required fields and disabled submit until file chosen", () => {
    render(
      <ImportTranscriptDialog
        open
        onClose={() => {}}
        classifications={[{ id: "c1", level: 1, name: "Internal" }]}
        onImported={() => {}}
        importFn={async () =>
          ({ meeting: { id: "m1" }, document_id: "d1", turn_count: 2, extraction_status: "pending" }) as never
        }
      />,
    );
    expect(screen.getByLabelText(/title/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/classification/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/transcript file/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /import/i })).toBeDisabled();
  });
});
