"use client";

import { ContributeMenu } from "@/components/contribute-menu";
import { DocumentDrawer } from "@/components/document";
import { EvidencePanel, SEGMENT_META, SegmentLegend } from "@/components/evidence";
import { useSession } from "@/components/providers";
import { Badge, Card, ErrorState, Select, Spinner } from "@/components/ui";
import { api, apiUpload } from "@/lib/api";
import { ASSISTANT_NAME_CAPITALIZED } from "@/lib/brand";
import { cn, hasRole } from "@/lib/utils";
import type {
  Classification,
  DecisionInfo,
  MeetingImportResponse,
  Message,
} from "@brainchain/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PanelRightOpen, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Composer } from "./composer";

export function ChatHome() {
  const { user } = useSession();
  const router = useRouter();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const isManager = hasRole(user, "manager", "executive");
  const canImport = hasRole(user, "manager", "data_steward", "system_admin");

  const [conversationId, setConversationId] = React.useState<string | null>(null);
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [providerId, setProviderId] = React.useState<string>("");
  const [selectedMessage, setSelectedMessage] = React.useState<string | null>(null);
  const [hoverOrd, setHoverOrd] = React.useState<number | null>(null);
  const [openDoc, setOpenDoc] = React.useState<string | null>(null);
  const [bannerDismissed, setBannerDismissed] = React.useState(false);
  const bottomRef = React.useRef<HTMLDivElement>(null);
  const hasInitializedRef = React.useRef(false);

  const { data: decisions } = useQuery({
    queryKey: ["decisions"],
    queryFn: () => api<{ items: DecisionInfo[] }>("/decisions"),
    enabled: isManager,
  });
  const { data: classifications } = useQuery({
    queryKey: ["gov-classifications"],
    queryFn: () => api<{ items: Classification[] }>("/governance/classifications"),
    enabled: canImport,
  });
  const { data: models } = useQuery({
    queryKey: ["models"],
    queryFn: () =>
      api<{ items: { id: string; name: string; model: string; is_external: boolean }[] }>(
        "/models",
      ),
    enabled: !!user,
    staleTime: 300_000,
  });

  const proposed = (decisions?.items ?? []).filter((d) => d.status === "proposed");
  const proposedMeetingIds = Array.from(
    new Set(proposed.map((d) => d.meeting_id).filter((id): id is string => !!id)),
  );
  const reviewHref =
    proposedMeetingIds.length === 1 ? `/meetings/${proposedMeetingIds[0]}/review` : "/meetings";

  const askMutation = useMutation({
    mutationFn: (query: string) =>
      api<{ conversation_id: string; message: Message }>("/ask", {
        method: "POST",
        body: {
          query,
          mode: "direct",
          conversation_id: conversationId,
          provider_id: providerId || null,
        },
      }),
    onSuccess: (data, query) => {
      const created = data.conversation_id !== conversationId;
      setConversationId(data.conversation_id);
      setMessages((prev) => [
        ...prev,
        {
          id: `local-${Date.now()}`,
          role: "user",
          content: query,
          mode: "direct",
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
      if (created) {
        queryClient.invalidateQueries({ queryKey: ["conversations"] });
      }
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 60);
    },
  });

  const submit = React.useCallback(
    (query: string) => {
      const trimmed = query.trim();
      if (!trimmed || askMutation.isPending) return;
      askMutation.mutate(trimmed);
    },
    [askMutation],
  );

  const loadConversation = React.useCallback(async (id: string) => {
    const data = await api<{ id: string; messages: Message[] }>(`/conversations/${id}`);
    setConversationId(data.id);
    setMessages(data.messages);
    const lastAssistant = [...data.messages].reverse().find((m) => m.role === "assistant");
    setSelectedMessage(lastAssistant?.id ?? null);
  }, []);

  const q = params.get("q");
  const c = params.get("c");

  // `ChatHome` is remounted (fresh component instance, fresh refs and state)
  // by its parent (`app/(app)/page.tsx`) whenever conversation identity
  // changes — a different `?c=<id>`, a new `?q=<query>`, or a bare `/` — via
  // a `key` prop derived from the URL. That means this effect only ever
  // needs to handle the identity this particular mount was born with, once:
  // there is no reactive `?c=`/`?q=` case to handle here anymore, because a
  // *change* to either always means a new mount with a fresh `hasInitializedRef`.
  // `hasInitializedRef` still exists (not just relying on "effect runs once")
  // solely to collapse React 18 StrictMode's dev-only double-invoke of
  // effects into a single `loadConversation`/`askMutation.mutate` call —
  // the ref persists across that fake unmount+remount cycle even though a
  // real remount (new `key`) would reset it along with everything else.
  React.useEffect(() => {
    if (hasInitializedRef.current) return;
    hasInitializedRef.current = true;
    if (c) {
      loadConversation(c);
    } else if (q) {
      askMutation.mutate(q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleImported(result: MeetingImportResponse) {
    queryClient.invalidateQueries({ queryKey: ["meetings"] });
    router.push(`/meetings/${result.meeting.id}/review`);
  }

  const evidenceMessage =
    messages.find((m) => m.id === selectedMessage) ??
    [...messages].reverse().find((m) => m.role === "assistant");

  const showEmptyState = !messages.length && !askMutation.isPending;

  return (
    <div className="mx-auto flex max-w-7xl gap-5">
      <div className="min-w-0 flex-1">
        {isManager && proposed.length > 0 && !bannerDismissed && (
          <div className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-line bg-panel px-4 py-2.5">
            <Link
              href={reviewHref}
              className="text-[12.5px] text-ink transition-colors hover:text-accent"
            >
              {proposed.length} item{proposed.length === 1 ? "" : "s"} await your review →
            </Link>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => setBannerDismissed(true)}
              className="shrink-0 text-ink-3 hover:text-ink"
            >
              <X className="size-3.5" />
            </button>
          </div>
        )}

        {showEmptyState ? (
          <div className="flex flex-col items-center justify-center gap-6 py-24 text-center">
            <Sparkles className="size-8 text-accent" />
            <h1 className="text-2xl font-semibold text-ink sm:text-[28px]">
              What does your company need to remember?
            </h1>
            <p className="max-w-md text-xs text-ink-3">
              {ASSISTANT_NAME_CAPITALIZED} answers only from sources you are authorized to read,
              with citations.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
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
              <ErrorState
                message={
                  askMutation.error instanceof Error
                    ? `The assistant request failed: ${askMutation.error.message}`
                    : "The assistant request failed. The API may be down."
                }
                onRetry={
                  askMutation.variables ? () => askMutation.mutate(askMutation.variables!) : undefined
                }
              />
            )}
            <div ref={bottomRef} />
          </div>
        )}

        {/* The sticky positioning and panel chrome live on THIS row, not on
            `<Composer>`'s own `<form>`: a `position: sticky` element's
            containing block is its nearest ancestor with a defined height it
            can be pinned within, so applying `sticky` inside a wrapper
            that's only ever as tall as the form itself (as it was before)
            has no room to stick and just scrolls away with the thread.
            Anchoring it here, inside the column that also holds the full
            message list, gives it that room. `items-end` (not
            `items-center`) keeps the mode select's bottom edge aligned with
            the composer's textarea/send button as the textarea grows
            multi-line, instead of drifting as the row's overall height
            changes. */}
        <div className="sticky bottom-4 mt-5 flex items-end gap-2 rounded-2xl border border-line-strong bg-panel p-2 shadow-lg">
          {(models?.items.length ?? 0) > 0 && (
            <Select
              aria-label="Model"
              value={providerId}
              onChange={(e) => setProviderId(e.target.value)}
              className="h-9.5 max-w-40 shrink-0"
            >
              <option value="">Auto</option>
              {(models?.items ?? []).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </Select>
          )}
          <Composer
            onSend={submit}
            disabled={askMutation.isPending}
            plusSlot={
              <ContributeMenu
                variant="icon"
                user={user}
                classifications={classifications?.items ?? []}
                onImported={handleImported}
                importFn={(form) => apiUpload<MeetingImportResponse>("/meetings/import", form)}
              />
            }
          />
        </div>
      </div>

      {!showEmptyState && (
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
      )}

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
