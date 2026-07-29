"use client";

import { useSession } from "@/components/providers";
import { Button, EmptyState, ErrorState, Input, Skeleton } from "@/components/ui";
import { api } from "@/lib/api";
import { ASSISTANT_NAME } from "@/lib/brand";
import { formatDate, hasRole } from "@/lib/utils";
import type { DecisionInfo, HomeData, MeetingInfo } from "@brainchain/shared";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";

/* Section header in the adopted design language. */
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[13px] font-semibold uppercase tracking-[0.06em] text-ink-2">{children}</h2>
  );
}

/**
 * The single large ask input. Deliberately self-contained: it only needs the
 * router (no data fetch of its own) so it can render — and work — even when
 * every other query on the page has failed.
 */
export function AskBox({ suggested }: { suggested: string[] }) {
  const router = useRouter();
  const [question, setQuestion] = React.useState("");

  const ask = (value: string) => {
    const trimmed = value.trim();
    if (trimmed) router.push(`/ask?q=${encodeURIComponent(trimmed)}`);
  };

  return (
    <div>
      <form
        className="flex items-center gap-3 rounded-xl border border-line-strong bg-panel p-1.5 pl-[18px]"
        onSubmit={(event) => {
          event.preventDefault();
          ask(question);
        }}
      >
        <Input
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder={`Ask ${ASSISTANT_NAME} anything about your company…`}
          aria-label={`Ask ${ASSISTANT_NAME} anything about your company`}
          className="h-auto min-w-0 flex-1 border-0 bg-transparent px-0 py-2.5 text-[14.5px] focus:border-0"
        />
        <Button type="submit" className="px-[18px]">
          Ask
        </Button>
      </form>
      {suggested.length > 0 && (
        <div className="mt-3.5 flex flex-wrap gap-2">
          {suggested.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => ask(prompt)}
              className="rounded-full border border-line px-3 py-1.5 text-[11px] text-ink-3 transition-colors hover:border-line-strong hover:text-ink"
            >
              {prompt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function LandingPage() {
  const { user } = useSession();
  const isManager = hasRole(user, "manager", "executive");

  const { data: home, isError, isLoading, refetch } = useQuery({
    queryKey: ["home"],
    queryFn: () => api<HomeData>("/home"),
  });
  const { data: meetings, isLoading: meetingsLoading } = useQuery({
    queryKey: ["meetings"],
    queryFn: () => api<{ items: MeetingInfo[] }>("/meetings"),
  });
  const { data: decisions } = useQuery({
    queryKey: ["decisions"],
    queryFn: () => api<{ items: DecisionInfo[] }>("/decisions"),
    enabled: isManager,
  });

  const recentMeetings = [...(meetings?.items ?? [])]
    .sort((a, b) => new Date(b.held_at ?? 0).getTime() - new Date(a.held_at ?? 0).getTime())
    .slice(0, 3);

  const proposed = (decisions?.items ?? []).filter((d) => d.status === "proposed");
  const proposedMeetingIds = Array.from(
    new Set(proposed.map((d) => d.meeting_id).filter((id): id is string => !!id)),
  );
  const reviewHref =
    proposedMeetingIds.length === 1 ? `/meetings/${proposedMeetingIds[0]}/review` : "/meetings";

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 py-10">
      {/* The ask box is unconditional: it must render (and work) even when
          every query below fails — it depends on nothing but the router. */}
      <AskBox suggested={(home?.suggested_questions ?? []).slice(0, 3)} />

      {/* ERROR-FIRST: the cards are built from `/home` (plus `/meetings` and
          `/decisions`), so a failed `/home` fetch surfaces a retry-able error
          instead of quietly rendering with undefined data. */}
      {isError ? (
        <ErrorState message="Couldn't load your home data. The API may be down." onRetry={() => refetch()} />
      ) : (
        <div className="flex flex-col gap-3.5">
          {isManager && proposed.length > 0 && (
            <Link
              href={reviewHref}
              className="flex items-center justify-between gap-3 rounded-xl border border-line bg-panel px-6 py-4 transition-colors hover:border-line-strong"
            >
              <span className="text-sm text-ink">
                {proposed.length} item{proposed.length === 1 ? "" : "s"} await your review
              </span>
              <ArrowRight className="size-4 shrink-0 text-ink-3" />
            </Link>
          )}

          <section className="rounded-xl border border-line bg-panel px-6 py-[22px]">
            <SectionTitle>Recent meetings</SectionTitle>
            <div className="mt-3.5 flex flex-col gap-2">
              {meetingsLoading || isLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-9 w-full" />
                  <Skeleton className="h-9 w-full" />
                </div>
              ) : recentMeetings.length > 0 ? (
                recentMeetings.map((meeting) => (
                  <Link
                    key={meeting.id}
                    href={`/meetings/${meeting.id}/review`}
                    className="flex items-center justify-between gap-3 rounded-lg px-2.5 py-2.5 transition-colors hover:bg-panel-2/60"
                  >
                    <span className="truncate text-sm text-ink">{meeting.title}</span>
                    <span className="shrink-0 text-xs text-ink-3">{formatDate(meeting.held_at)}</span>
                  </Link>
                ))
              ) : (
                <EmptyState
                  title="No meetings yet"
                  body={`Import one to give ${ASSISTANT_NAME} something to remember`}
                />
              )}
            </div>
          </section>

          <section className="rounded-xl border border-line bg-panel px-6 py-[22px]">
            <SectionTitle>Contribute</SectionTitle>
            <p className="mt-2 text-[12.5px] leading-relaxed text-ink-3">
              Import a transcript, share a reflection, or capture something only you know.
            </p>
            {/* Interim: Task 5 replaces this with the ContributeMenu. */}
            <Link
              href="/meetings"
              className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-lg bg-btn px-3.5 text-[13px] font-semibold text-btn-ink hover:opacity-90"
            >
              + Contribute
            </Link>
          </section>
        </div>
      )}

      <div className="text-center">
        <Link href="/library" className="text-[12.5px] text-accent hover:opacity-80">
          Browse the library →
        </Link>
      </div>
    </div>
  );
}
