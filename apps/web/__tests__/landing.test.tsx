import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

import { AskBox } from "../app/(app)/ask-box";

describe("landing AskBox", () => {
  it("routes the question to /ask?q=…", () => {
    render(<AskBox suggested={["Why did we switch to 7075?"]} />);
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "what changed last week" } });
    fireEvent.submit(input.closest("form")!);
    expect(push).toHaveBeenCalledWith("/ask?q=what%20changed%20last%20week");
  });
  it("renders suggested questions as one-click asks", () => {
    render(<AskBox suggested={["Why did we switch to 7075?"]} />);
    fireEvent.click(screen.getByRole("button", { name: /7075/i }));
    expect(push).toHaveBeenCalledWith(
      "/ask?q=Why%20did%20we%20switch%20to%207075%3F");
  });
});
