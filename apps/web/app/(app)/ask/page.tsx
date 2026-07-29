"use client";

import { DocumentDrawer } from "@/components/document";
import { EvidencePanel, SEGMENT_META, SegmentLegend } from "@/components/evidence";
import { Badge, Button, Card, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { Message } from "@brainchain/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { History, PanelRightOpen, Plus, Send, Sparkles } from "lucide-react";
import { useSearchParams } from "next/navigation";
import * as React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const MODES: { key: string; label: string }[] = [
  { key: "direct", label: "Direct answer" },
  { key: "detailed", label: "Detailed analysis" },
  { key: "executive", label: "Executive summary" },
  { key: "action_plan", label: "Action plan" },
  { key: "research", label: "Research report" },
  { key: "compare", label: "Compare sources" },
  { key: "tasks", label: "Create tasks" },
  { key: "meeting_prep", label: "Prepare meeting" },
];

function AskPageInner() {
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const [conversationId, setConversationId] = React.useState<string | null>(null);
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [input, setInput] = React.useState("");
  const [mode, setMode] = React.useState("direct");
  const [selectedMessage, setSelectedMessage] = React.useState<string | null>(null);
  const [hoverOrd, setHoverOrd] = React.useState<number | null>(null);
  const [openDoc, setOpenDoc] = React.useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const bottomRef = React.useRef<HTMLDivElement>(null);
  const autoAsked = React.useRef(false);

  const { data: conversations } = useQuery({
    queryKey: ["conversations"],
    queryFn: () =>
      api<{ items: { id: string; title: string; created_at: string }[] }>("/conversations"),
  });

  const askMutation = useMutation({
    mutationFn: (query: string) =>
      api<{ conversation_id: string; message: Message }>("/ask", {
        method: "POST",
        body: { query, mode, conversation_id: conversationId },
      }),
    onSuccess: (data, query) => {
      setConversationId(data.conversation_id);
      setMessages((prev) => [
        ...prev,
        {
          id: `local-${Date.now()}`,
          role: "user",
          content: query,
          mode,
          provider: "",
          model: "",
          segments: [],
          citations: [],
          tokens_in: 0,
          tokens_out: 0,
          cost_estimate: 0,
          latency_ms: 0,
          created_at: new Date().toISOString(),
        },
        data.message,
      ]);
      setSelectedMessage(data.message.id);
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 60);
    },
  });

  const submit = React.useCallback(
    (q?: string) => {
      const query = (q ?? input).trim();
      if (!query || askMutation.isPending) return;
      setInput("");
      askMutation.mutate(query);
    },
    [input, askMutation],
  );

  React.useEffect(() => {
    const q = params.get("q");
    if (q && !autoAsked.current) {
      autoAsked.current = true;
      askMutation.mutate(q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const loadConversation = async (id: string) => {
    const data = await api<{ id: string; messages: Message[] }>(`/conversations/${id}`);
    setConversationId(data.id);
    setMessages(data.messages);
    const lastAssistant = [...data.messages].reverse().find((m) => m.role === "assistant");
    setSelectedMessage(lastAssistant?.id ?? null);
    setHistoryOpen(false);
  };

  const evidenceMessage =
    messages.find((m) => m.id === selectedMessage) ??
    [...messages].reverse().find((m) => m.role === "assistant");

  return (
    <div className="mx-auto flex max-w-7xl gap-5">
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-lg font-semibold text-ink">
              <Sparkles className="size-5 text-accent" /> Ask the Brain
            </h1>
            <p className="text-xs text-ink-3">
              Answers come only from sources you are authorized to read, with citations.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => setHistoryOpen((v) => !v)}>
              <History className="size-3.5" /> History
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setConversationId(null);
                setMessages([]);
                setSelectedMessage(null);
              }}
            >
              <Plus className="size-3.5" /> New
            </Button>
          </div>
        </div>

        {historyOpen && (
          <Card className="mt-3 max-h-52 overflow-y-auto scroll-thin">
            {conversations?.items.map((c) => (
              <button
                key={c.id}
                onClick={() => loadConversation(c.id)}
                className="block w-full border-b border-line px-4 py-2 text-left text-xs text-ink-2 last:border-0 hover:bg-panel-2"
              >
                {c.title}
              </button>
            ))}
            {!conversations?.items.length && (
              <p className="px-4 py-4 text-center text-xs text-ink-3">No previous conversations.</p>
            )}
          </Card>
        )}

        <div className="mt-3 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Response mode">
          {MODES.map((m) => (
            <button
              key={m.key}
              role="radio"
              aria-checked={mode === m.key}
              onClick={() => setMode(m.key)}
              className={cn(
                "rounded-full border px-3 py-1 text-[11.5px] font-medium transition-colors",
                mode === m.key
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-line bg-panel text-ink-2 hover:border-line-strong",
              )}
            >
              {m.label}
            </button>
          ))}
        </div>

        <div className="mt-4 space-y-4">
          {!messages.length && !askMutation.isPending && (
            <Card className="p-8 text-center">
              <Sparkles className="mx-auto size-6 text-accent" />
              <p className="mt-3 text-sm font-medium text-ink">Ask about anything the company knows</p>
              <p className="mx-auto mt-1 max-w-md text-xs text-ink-3">
                Project risks, contract deadlines, decisions, supplier exposure, meeting outcomes.
                Every claim is labeled — verified, inferred, conflicting or missing — and backed by
                the evidence panel.
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-1.5">
                {[
                  "What are the main risks affecting the Phoenix project this quarter?",
                  "When is the Phoenix flight readiness review?",
                  "Which contracts expire in the next 90 days?",
                ].map((q) => (
                  <button
                    key={q}
                    onClick={() => submit(q)}
                    className="rounded-full border border-line px-3 py-1 text-[11.5px] text-ink-2 hover:border-accent hover:text-accent"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </Card>
          )}

          {messages.map((message) =>
            message.role === "user" ? (
              <div key={message.id} className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-accent px-4 py-2.5 text-sm text-accent-ink">
                  {message.content}
                </div>
              </div>
            ) : (
              <AssistantMessage
                key={message.id}
                message={message}
                selected={evidenceMessage?.id === message.id}
                onSelect={() => setSelectedMessage(message.id)}
              />
            ),
          )}

          {askMutation.isPending && (
            <Card className="flex items-center gap-3 p-4">
              <Spinner />
              <div className="text-xs text-ink-3">
                Retrieving authorized sources → applying model policy → synthesizing answer…
              </div>
            </Card>
          )}
          {askMutation.isError && (
            <Card className="border-crit/40 p-4 text-xs text-crit">
              The assistant request failed: {(askMutation.error as Error).message}
            </Card>
          )}
          <div ref={bottomRef} />
        </div>

        <form
          className="sticky bottom-4 mt-5 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question about company knowledge…"
            aria-label="Question"
            className="h-11 flex-1 rounded-xl border border-line-strong bg-panel px-4 text-sm text-ink shadow-lg placeholder:text-ink-3 focus:border-accent"
          />
          <Button type="submit" className="h-11" disabled={askMutation.isPending || !input.trim()}>
            <Send className="size-4" />
          </Button>
        </form>
      </div>

      <aside className="sticky top-20 hidden w-80 shrink-0 self-start lg:block">
        <div className="mb-2 flex items-center gap-2">
          <PanelRightOpen className="size-4 text-ink-3" />
          <h2 className="text-sm font-semibold text-ink">Evidence</h2>
          {evidenceMessage && (
            <Badge tone="neutral">{evidenceMessage.citations.length} sources</Badge>
          )}
        </div>
        <div className="max-h-[calc(100vh-8rem)] overflow-y-auto scroll-thin pr-1">
          <EvidencePanel
            citations={evidenceMessage?.citations ?? []}
            highlightedOrd={hoverOrd}
            onHover={setHoverOrd}
            onOpenDocument={setOpenDoc}
          />
          {evidenceMessage && (
            <p className="mt-3 text-[10.5px] leading-relaxed text-ink-3">
              Answered by {evidenceMessage.provider} · {evidenceMessage.latency_ms}ms ·{" "}
              {evidenceMessage.tokens_in + evidenceMessage.tokens_out} tokens · est. $
              {evidenceMessage.cost_estimate.toFixed(4)}. Permission filtering ran before any text
              reached the model.
            </p>
          )}
        </div>
      </aside>

      <DocumentDrawer docId={openDoc} onClose={() => setOpenDoc(null)} />
    </div>
  );
}

function AssistantMessage({
  message,
  selected,
  onSelect,
}: {
  message: Message;
  selected: boolean;
  onSelect: () => void;
}) {
  const [showSegments, setShowSegments] = React.useState(false);
  return (
    <Card
      className={cn("p-4 transition-colors", selected && "border-accent/50")}
      onClick={onSelect}
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Badge tone="accent">{message.mode.replace(/_/g, " ")}</Badge>
        <SegmentLegend segments={message.segments} />
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowSegments((v) => !v);
          }}
          className="ml-auto text-[11px] font-medium text-accent hover:underline"
        >
          {showSegments ? "Rendered view" : "Provenance view"}
        </button>
      </div>

      {showSegments ? (
        <div className="space-y-2">
          {message.segments.map((segment, i) => {
            const meta = SEGMENT_META[segment.type];
            return (
              <div
                key={i}
                className={cn("rounded-lg border-l-[3px] bg-panel-2/60 px-3 py-2", meta?.className)}
              >
                <p className={cn("mb-1 flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wide", meta?.className)}>
                  {meta?.icon}
                  {meta?.label}
                  {segment.citations.length > 0 && (
                    <span className="text-ink-3">· sources {segment.citations.map((c) => `[${c}]`).join(" ")}</span>
                  )}
                </p>
                <p className="text-[13px] leading-relaxed text-ink-2">{segment.text}</p>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="prose-answer text-ink-2">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
        </div>
      )}
    </Card>
  );
}

export default function AskPage() {
  return (
    <React.Suspense fallback={<Spinner label="Loading…" />}>
      <AskPageInner />
    </React.Suspense>
  );
}
