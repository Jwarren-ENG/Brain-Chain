import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
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

// ---------------------------------------------------------------------
// ChatHome's `?c=` handling must be reactive to VALUE changes, not just
// mount: Task 2's sidebar links to `/?c=<id>` while ChatHome may already be
// mounted (same-route search-param navigation doesn't remount in the App
// Router). `?q=`, by contrast, must fire exactly once ever. These two
// mechanisms are independent (a single "already handled" ref would make the
// second `?c=` navigation silently no-op — see task-1-fix-report.md).

const chatHomeState = vi.hoisted(() => ({
  searchParams: new URLSearchParams(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => chatHomeState.searchParams,
}));

vi.mock("@/components/providers", () => ({
  useSession: () => ({ user: { id: "u1", name: "Avery", roles: ["employee"] } }),
}));

function mockMessage(id: string, content: string) {
  return {
    id,
    role: "assistant" as const,
    content,
    mode: "direct",
    provider: "test",
    model: "test",
    segments: [],
    citations: [],
    tokens_in: 0,
    tokens_out: 0,
    cost_estimate: 0,
    latency_ms: 0,
    created_at: "2026-01-01T00:00:00Z",
  };
}

const apiMock = vi.fn(async (path: string, _options?: unknown) => {
  if (path === "/home") return { suggested_questions: [] };
  const conversationMatch = path.match(/^\/conversations\/(.+)$/);
  if (conversationMatch) {
    const id = conversationMatch[1];
    return { id, messages: [mockMessage(`${id}-msg`, `content for ${id}`)] };
  }
  throw new Error(`unexpected api call in test: ${path}`);
});

vi.mock("@/lib/api", () => ({
  api: (path: string, options?: unknown) => apiMock(path, options),
  apiUpload: vi.fn(),
}));

describe("ChatHome ?c= reactivity", () => {
  beforeEach(() => {
    chatHomeState.searchParams = new URLSearchParams();
    apiMock.mockClear();
  });

  it("loads a different conversation when ?c= changes while already mounted", async () => {
    const { QueryClient, QueryClientProvider } = await import("@tanstack/react-query");
    const { ChatHome } = await import("../app/(app)/chat/chat-home");
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    // A fresh element (not a shared/reused `const`) is created at each
    // render/rerender call site: JSX always allocates a new props object, so
    // React treats this as a genuine update and re-invokes ChatHome — a
    // reused element reference would let React bail out via its referential
    // props optimization and never re-run the component, defeating the
    // point of this test (this mirrors how Next's real router-driven
    // `useSearchParams()` change reaches the component: some ancestor
    // re-renders and hands down new children, it's not a no-op update).
    const renderChatHome = () =>
      render(
        <QueryClientProvider client={queryClient}>
          <ChatHome />
        </QueryClientProvider>,
      );

    chatHomeState.searchParams = new URLSearchParams("c=conv-1");
    const { rerender } = renderChatHome();
    await waitFor(() => expect(screen.getByText("content for conv-1")).toBeInTheDocument());

    // Simulate the sidebar linking to a second conversation while ChatHome
    // stays mounted — no remount, just a new `useSearchParams()` value.
    chatHomeState.searchParams = new URLSearchParams("c=conv-2");
    rerender(
      <QueryClientProvider client={queryClient}>
        <ChatHome />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByText("content for conv-2")).toBeInTheDocument());
    expect(screen.queryByText("content for conv-1")).not.toBeInTheDocument();

    // Re-rendering with the SAME `c` must not refetch the active conversation.
    const callsSoFar = apiMock.mock.calls.filter((c) => c[0] === "/conversations/conv-2").length;
    rerender(
      <QueryClientProvider client={queryClient}>
        <ChatHome />
      </QueryClientProvider>,
    );
    await new Promise((r) => setTimeout(r, 0));
    expect(
      apiMock.mock.calls.filter((c) => c[0] === "/conversations/conv-2").length,
    ).toBe(callsSoFar);

    // Removing `c` (e.g. "+ New chat" navigating to `/`) clears the thread.
    chatHomeState.searchParams = new URLSearchParams();
    rerender(
      <QueryClientProvider client={queryClient}>
        <ChatHome />
      </QueryClientProvider>,
    );
    await waitFor(() =>
      expect(
        screen.getByText("What does your company need to remember?"),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByText("content for conv-2")).not.toBeInTheDocument();
  });
});
