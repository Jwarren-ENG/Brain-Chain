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
// The chat home is remount-keyed: `app/(app)/page.tsx` derives a `key` from
// URL identity (`?c=`, `?q=`, or bare "/") and mounts a fresh
// `<ChatHome key={...} />` whenever that identity changes, instead of
// `ChatHome` reactively patching its own state via `?c=`/`?q=`-watching
// effects (see the fix history at the top of final-fix-report.md for why
// that effect/ref approach kept shifting a race instead of closing it).
// Tests that need to observe a remount — a different conversation loading,
// "+ New chat" clearing a thread — render the PAGE's default export and
// mutate the shared `useSearchParams()` mock between renders. Tests that
// only need mount-time behavior (auto-ask on `?q=`, composer/multi-turn
// behavior) render `ChatHome` directly: it still reads `?c=`/`?q=` itself,
// just once on mount, never reactively.

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

type AskBody = { query: string; conversation_id?: string | null };

const apiMock = vi.fn(async (path: string, options?: { body?: AskBody }) => {
  if (path === "/home") return { suggested_questions: [] };
  if (path === "/ask") {
    askCounter += 1;
    const query = options?.body?.query ?? "";
    // Continuing a conversation sends its `conversation_id` back; echo it so
    // multi-turn tests can assert the second turn stayed on the same thread.
    // A first turn (no `conversation_id` yet) gets a freshly minted one.
    const conversationId = options?.body?.conversation_id ?? `asked-conv-${askCounter}`;
    return {
      conversation_id: conversationId,
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
  api: (path: string, options?: unknown) => apiMock(path, options as { body?: AskBody } | undefined),
  apiUpload: vi.fn(),
}));

describe("HomePage conversation-identity remounts", () => {
  beforeEach(() => {
    chatHomeState.searchParams = new URLSearchParams();
    apiMock.mockClear();
    askCounter = 0;
  });

  it("remounts and loads a different conversation when ?c= changes, without refetching on an identical rerender", async () => {
    const { QueryClient, QueryClientProvider } = await import("@tanstack/react-query");
    const HomePage = (await import("../app/(app)/page")).default;
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    // A fresh element (not a shared/reused `const`) is created at each
    // render/rerender call site: JSX always allocates a new props object, so
    // React treats this as a genuine update and re-invokes HomePage — this
    // mirrors how Next's real router-driven `useSearchParams()` change
    // reaches the tree: some ancestor re-renders and hands down new
    // children, it's not a no-op update.
    const renderHomePage = () =>
      render(
        <QueryClientProvider client={queryClient}>
          <HomePage />
        </QueryClientProvider>,
      );

    chatHomeState.searchParams = new URLSearchParams("c=conv-1");
    const { rerender } = renderHomePage();
    await waitFor(() => expect(screen.getByText("content for conv-1")).toBeInTheDocument());

    // A sidebar link to a different conversation: `key` changes from
    // "conv-1" to "conv-2" → `ChatHome` unmounts and remounts fresh, and the
    // new mount's init effect loads conv-2.
    chatHomeState.searchParams = new URLSearchParams("c=conv-2");
    rerender(
      <QueryClientProvider client={queryClient}>
        <HomePage />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByText("content for conv-2")).toBeInTheDocument());
    expect(screen.queryByText("content for conv-1")).not.toBeInTheDocument();

    // Re-rendering with the SAME `c` keeps the same `key`, so no remount and
    // no refetch of the already-active conversation.
    const callsSoFar = apiMock.mock.calls.filter((c) => c[0] === "/conversations/conv-2").length;
    rerender(
      <QueryClientProvider client={queryClient}>
        <HomePage />
      </QueryClientProvider>,
    );
    await new Promise((r) => setTimeout(r, 0));
    expect(
      apiMock.mock.calls.filter((c) => c[0] === "/conversations/conv-2").length,
    ).toBe(callsSoFar);

    // Removing `c` (e.g. "+ New chat" navigating to `/`) changes the key to
    // "new:*" → remount → cleared thread.
    chatHomeState.searchParams = new URLSearchParams();
    rerender(
      <QueryClientProvider client={queryClient}>
        <HomePage />
      </QueryClientProvider>,
    );
    await waitFor(() =>
      expect(
        screen.getByText("What does your company need to remember?"),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByText("content for conv-2")).not.toBeInTheDocument();
  });

  // A thread started by typing directly into the composer at bare "/" never
  // touches the URL at all (it only gets a `conversation_id` in local
  // state, from `/ask`'s response). "+ New chat" (`shell.tsx`) pushes
  // `/?n=<timestamp>` rather than plain `/`, so the URL's CONTENT genuinely
  // changes on every click — unlike a bare `router.push("/")`, which Next
  // resolves to the SAME memoized `searchParams` instance when already
  // sitting on bare "/", and which a content-derived key could never detect.
  // Simulate that real navigation by changing the mock's URL content (adding
  // `n=123`), not by hand-constructing a fresh same-content `URLSearchParams`
  // instance (Next never does that for an unchanged URL, so a test relying
  // on it would pass for reasons the real router can't reproduce).
  it("clears a thread started by typing at home when '+ New chat' navigates to '/?n=...'", async () => {
    const { QueryClient, QueryClientProvider } = await import("@tanstack/react-query");
    const HomePage = (await import("../app/(app)/page")).default;
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const renderHomePage = () =>
      render(
        <QueryClientProvider client={queryClient}>
          <HomePage />
        </QueryClientProvider>,
      );

    const { rerender } = renderHomePage();
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

    // "+ New chat" → `router.push("/?n=<timestamp>")`. The mock's URL
    // content changes (a fresh `n`), which is what the pure content-derived
    // key in `page.tsx` actually keys off.
    chatHomeState.searchParams = new URLSearchParams("n=123");
    rerender(
      <QueryClientProvider client={queryClient}>
        <HomePage />
      </QueryClientProvider>,
    );

    await waitFor(() =>
      expect(screen.getByText("What does your company need to remember?")).toBeInTheDocument(),
    );
    expect(screen.queryByText("answer to: what killed the 7075 batch?")).not.toBeInTheDocument();
  });
});

describe("ChatHome mount-time ?q=/?c= handling and conversation continuity", () => {
  beforeEach(() => {
    chatHomeState.searchParams = new URLSearchParams();
    apiMock.mockClear();
    askCounter = 0;
  });

  // `tree` rebuilds a fresh element bound to the SAME `queryClient` and
  // `ChatHome` reference, for tests that need to `rerender` the identical
  // mounted instance (no key change, so no remount) rather than mount a
  // second one.
  const renderChatHome = async () => {
    const { QueryClient, QueryClientProvider } = await import("@tanstack/react-query");
    const { ChatHome } = await import("../app/(app)/chat/chat-home");
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const tree = () => (
      <QueryClientProvider client={queryClient}>
        <ChatHome />
      </QueryClientProvider>
    );
    return { ...render(tree()), tree };
  };

  // `?q=` auto-asks exactly once per mount, and the answer is never wiped
  // afterward — there's no more post-ask `router.replace("/")` to race
  // against a clear-thread effect (that effect no longer exists at all: a
  // genuinely new `?q=` value only ever reaches `ChatHome` via a fresh
  // mount, key'd by `HomePage`, with its own fresh `hasInitializedRef`).
  it("auto-asks once for a ?q= on mount, and the answer persists (no re-ask on a same-mount rerender)", async () => {
    chatHomeState.searchParams = new URLSearchParams("q=a");
    const { rerender, tree } = await renderChatHome();
    await waitFor(() => expect(screen.getByText("answer to: a")).toBeInTheDocument());
    expect(apiMock.mock.calls.filter((c) => c[0] === "/ask")).toHaveLength(1);

    // Re-rendering the SAME mounted instance (no key change, so no remount)
    // with the same `?q=` must not fire a second ask — `hasInitializedRef`
    // guards this within a single mount, independent of remount-keying.
    rerender(tree());
    await new Promise((r) => setTimeout(r, 0));
    expect(apiMock.mock.calls.filter((c) => c[0] === "/ask")).toHaveLength(1);
    expect(screen.getByText("answer to: a")).toBeInTheDocument();
  });

  it("loads the conversation for a ?c= present on mount", async () => {
    chatHomeState.searchParams = new URLSearchParams("c=conv-9");
    await renderChatHome();
    await waitFor(() => expect(screen.getByText("content for conv-9")).toBeInTheDocument());
    expect(apiMock.mock.calls.filter((c) => c[0] === "/conversations/conv-9")).toHaveLength(1);
  });

  // Continuing a conversation (a second send within the same mount) must
  // stay on the same thread: `conversationId` is local state set by the
  // first ask's response, not derived from the URL, so it survives across
  // sends without any key change or remount.
  it("continues a conversation across two sends: the second /ask carries conversation_id and both answers remain", async () => {
    await renderChatHome();
    await waitFor(() =>
      expect(screen.getByText("What does your company need to remember?")).toBeInTheDocument(),
    );

    const askText = (text: string) => {
      fireEvent.change(screen.getByRole("textbox", { name: "Question" }), {
        target: { value: text },
      });
      fireEvent.submit(screen.getByRole("textbox", { name: "Question" }).closest("form")!);
    };

    askText("first question");
    await waitFor(() => expect(screen.getByText("answer to: first question")).toBeInTheDocument());
    const firstAskCall = apiMock.mock.calls.find(
      (c) => c[0] === "/ask" && (c[1] as { body?: AskBody })?.body?.query === "first question",
    );
    expect((firstAskCall?.[1] as { body?: AskBody })?.body?.conversation_id).toBeFalsy();

    askText("second question");
    await waitFor(() =>
      expect(screen.getByText("answer to: second question")).toBeInTheDocument(),
    );
    const secondAskCall = apiMock.mock.calls.find(
      (c) => c[0] === "/ask" && (c[1] as { body?: AskBody })?.body?.query === "second question",
    );
    expect((secondAskCall?.[1] as { body?: AskBody })?.body?.conversation_id).toBe("asked-conv-1");

    // Both turns' answers are visible in the same thread.
    expect(screen.getByText("answer to: first question")).toBeInTheDocument();
    expect(screen.getByText("answer to: second question")).toBeInTheDocument();
  });
});
