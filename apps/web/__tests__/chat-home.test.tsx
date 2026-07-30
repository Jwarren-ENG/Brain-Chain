import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Composer } from "../app/(app)/chat/composer";

describe("Composer", () => {
  it("sends trimmed text on submit and clears the input", () => {
    const onSend = vi.fn();
    render(<Composer onSend={onSend} />);
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "  why 7075?  " } });
    fireEvent.submit(input.closest("form")!);
    expect(onSend).toHaveBeenCalledWith("why 7075?");
    expect((input as HTMLInputElement | HTMLTextAreaElement).value).toBe("");
  });
  it("does not send empty input", () => {
    const onSend = vi.fn();
    render(<Composer onSend={onSend} />);
    fireEvent.submit(screen.getByRole("textbox").closest("form")!);
    expect(onSend).not.toHaveBeenCalled();
  });
  it("renders the plus slot", () => {
    render(<Composer onSend={vi.fn()} plusSlot={<button>PLUS</button>} />);
    expect(screen.getByRole("button", { name: "PLUS" })).toBeInTheDocument();
  });
});
