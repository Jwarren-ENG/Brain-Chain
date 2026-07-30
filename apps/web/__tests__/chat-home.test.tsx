import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { Composer } from "../app/(app)/chat/composer";
import { ContributeMenu } from "../components/contribute-menu";

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

  // Regression test for a real bug: the ContributeMenu's `[+]` trigger had
  // no explicit `type`, so a plain `<button>` defaults to `type="submit"`.
  // Placed inside the composer's `<form>`, clicking it submitted whatever
  // draft the user had typed instead of opening the menu.
  it("does not submit the draft when the real ContributeMenu's [+] trigger is clicked", () => {
    const onSend = vi.fn();
    render(
      <Composer
        onSend={onSend}
        plusSlot={
          <ContributeMenu
            variant="icon"
            user={{ roles: [] }}
            classifications={[]}
            onImported={vi.fn()}
            importFn={vi.fn()}
          />
        }
      />,
    );
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "a draft in progress" } });
    fireEvent.click(screen.getByRole("button", { name: "Contribute" }));
    expect(onSend).not.toHaveBeenCalled();
    // Sanity check: the menu did open (it's the `[+]` trigger, not some
    // other inert button), confirming the click was actually exercised.
    expect(screen.getByText(/tell the brain/i)).toBeInTheDocument();
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

let askCounter = 0;

const apiMock = vi.fn(async (path: string, options?: { body?: { query: string } }) => {
  if (path === "/home") return { suggested_questions: [] };
  if (path === "/ask") {
    askCounter += 1;
    const query = options?.body?.query ?? "";
    return {
      conversation_id: `asked-conv-${askCounter}`,
      message: mockMessage(`asked-msg-${askCounter}`, `answer to: ${query}`),
    };
  }
  const conversationMatch = path.match(/^\/conversations\/(.+)$/);
  if (conversationMatch) {
    const id = conversationMatch[1];
    return { id, messages: [mockMessage(`${id}-msg`, `content for ${id}`)] };
  }
  throw new Error(`unexpected api call in test: ${path}`);
});

vi.mock("@/lib/api", () => ({
  api: (path: string, options?: unknown) => apiMock(path, options as { body?: { query: string } } | undefined),
  apiUpload: vi.fn(),
}));

describe("ChatHome ?c= reactivity", () => {
  beforeEach(() => {
    chatHomeState.searchParams = new URLSearchParams();
    apiMock.mockClear();
    askCounter = 0;
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

  // A thread started by typing at home never has a `?c=` (it only gets a
  // `conversation_id` in local state, from `/ask`'s response) — before this
  // fix, the clear-thread effect only reacted to `c` changing, so "+ New
  // chat" (`router.push("/")`, landing back on the already-bare `/`) was a
  // silent no-op for exactly this thread. It's covered here by depending on
  // the `searchParams` object itself: a genuine "+ New chat" click always
  // produces a fresh `URLSearchParams` from Next's router, even when the
  // destination URL is unchanged, so a freshly-constructed (contentwise
  // identical) instance is what a real navigation looks like from the
  // component's point of view.
  it("clears a thread started by typing at home when '+ New chat' navigates back to the bare '/'", async () => {
    const { QueryClient, QueryClientProvider } = await import("@tanstack/react-query");
    const { ChatHome } = await import("../app/(app)/chat/chat-home");
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const renderChatHome = () =>
      render(
        <QueryClientProvider client={queryClient}>
          <ChatHome />
        </QueryClientProvider>,
      );

    const { rerender } = renderChatHome();
    await waitFor(() =>
      expect(screen.getByText("What does your company need to remember?")).toBeInTheDocument(),
    );

    fireEvent.change(screen.getByRole("textbox", { name: "Question" }), {
      target: { value: "what killed the 7075 batch?" },
    });
    fireEvent.submit(screen.getByRole("textbox", { name: "Question" }).closest("form")!);
    await waitFor(() =>
      expect(screen.getByText("answer to: what killed the 7075 batch?")).toBeInTheDocument(),
    );

    // "+ New chat" → `router.push("/")`. The URL is already bare, but a real
    // navigation still hands the component a brand-new `searchParams`
    // instance — simulate that (not just re-rendering with the same object).
    chatHomeState.searchParams = new URLSearchParams();
    rerender(
      <QueryClientProvider client={queryClient}>
        <ChatHome />
      </QueryClientProvider>,
    );

    await waitFor(() =>
      expect(screen.getByText("What does your company need to remember?")).toBeInTheDocument(),
    );
    expect(screen.queryByText("answer to: what killed the 7075 batch?")).not.toBeInTheDocument();
  });

  // Before this fix, `?q=` auto-asked exactly once ever (a boolean ref), so
  // a second ⌘K palette ask from home (a fresh `?q=` while ChatHome stayed
  // mounted) was silently swallowed. It must now fire for every genuinely
  // NEW `?q=` value, while a page reload or back-navigation to the SAME
  // value must not re-ask.
  it("fires a fresh ask for each new ?q= palette search, but not for a repeat of the same value", async () => {
    const { QueryClient, QueryClientProvider } = await import("@tanstack/react-query");
    const { ChatHome } = await import("../app/(app)/chat/chat-home");
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const renderChatHome = () =>
      render(
        <QueryClientProvider client={queryClient}>
          <ChatHome />
        </QueryClientProvider>,
      );

    chatHomeState.searchParams = new URLSearchParams("q=a");
    const { rerender } = renderChatHome();
    await waitFor(() => expect(screen.getByText("answer to: a")).toBeInTheDocument());
    expect(apiMock.mock.calls.filter((c) => c[0] === "/ask")).toHaveLength(1);

    // Simulate the production `router.replace("/")` that fires once the `?q=`
    // is handled, stripping it from the URL — a re-render with the SAME `q`
    // value (still "a", now absent) must not trigger a second ask.
    chatHomeState.searchParams = new URLSearchParams();
    rerender(
      <QueryClientProvider client={queryClient}>
        <ChatHome />
      </QueryClientProvider>,
    );
    await new Promise((r) => setTimeout(r, 0));
    expect(apiMock.mock.calls.filter((c) => c[0] === "/ask")).toHaveLength(1);
    // Regression guard: the clear-thread effect (deps `[c, q, params]`) also
    // re-runs on this same re-render, since `router.replace("/")` handed
    // back a fresh `searchParams` object with neither `c` nor `q`. Without
    // `selfNavigationRef` distinguishing "we just stripped our own `?q=`"
    // from a genuine navigation to bare `/`, that effect would see
    // `!c && !q && conversationId` (conversationId was just set by the ask)
    // and wipe the thread it just created — the answer must still be here.
    expect(screen.queryByText("answer to: a")).toBeInTheDocument();

    // A genuinely NEW `?q=` value — e.g. a second ⌘K palette ask from home —
    // must fire again.
    chatHomeState.searchParams = new URLSearchParams("q=b");
    rerender(
      <QueryClientProvider client={queryClient}>
        <ChatHome />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByText("answer to: b")).toBeInTheDocument());
    expect(apiMock.mock.calls.filter((c) => c[0] === "/ask")).toHaveLength(2);
  });
});
