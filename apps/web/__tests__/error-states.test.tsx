import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ErrorState } from "../components/ui";

describe("ErrorState", () => {
  it("renders a retry affordance", () => {
    const retry = vi.fn();
    render(<ErrorState message="Couldn't load the meeting" onRetry={retry} />);
    expect(screen.getByText(/couldn't load/i)).toBeInTheDocument();
    screen.getByRole("button", { name: /retry|try again/i }).click();
    expect(retry).toHaveBeenCalled();
  });

  it("renders without a retry button when onRetry is omitted", () => {
    render(<ErrorState message="Couldn't load the meeting" />);
    expect(screen.getByText(/couldn't load/i)).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
