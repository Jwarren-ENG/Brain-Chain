"use client";

import { useSession } from "@/components/providers";
import { Button, EmptyState, ErrorState, Skeleton, Textarea } from "@/components/ui";
import { api } from "@/lib/api";
import { formatDate, hasRole } from "@/lib/utils";
import type { FeedbackAggregate, HomeData, MeetingInfo, SurveyInfo, TaskInfo } from "@brainchain/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2, Keyboard, LockKeyhole, MessageSquareHeart, Mic, Send, Zap } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";

const MOODS = ["Struggling", "Stretched", "Steady", "Energized"] as const;

/* Section header in the adopted design language. */
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[13px] font-semibold uppercase tracking-[0.06em] text-ink-2">{children}</h2>
  );
}

function HeaderLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="text-[12.5px] text-accent hover:opacity-80">
      {children}
    </Link>
  );
}

export default function TodayPage() {
  const { user } = useSession();
  const router = useRouter();
  const [question, setQuestion] = React.useState("");
  const isManager = hasRole(user, "manager", "executive", "security_admin");

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["home"],
    queryFn: () => api<HomeData>("/home"),
  });
  const { data: meetings } = useQuery({
    queryKey: ["meetings"],
    queryFn: () => api<{ items: MeetingInfo[] }>("/meetings"),
  });
  const { data: surveys } = useQuery({
    queryKey: ["surveys"],
    queryFn: () => api<{ items: SurveyInfo[] }>("/surveys"),
  });
  const { data: signals } = useQuery({
    queryKey: ["feedback-aggregate-home"],
    queryFn: () => api<FeedbackAggregate>("/feedback/aggregate"),
    enabled: isManager,
  });
  const { data: assignments } = useQuery({
    queryKey: ["interview-assignments"],
    queryFn: () =>
      api<{ assigned_to_me: { id: string; title: string; created_by: { name: string } | null; scope: string }[] }>(
        "/interview-assignments",
      ),
  });

  const ask = (value: string) => {
    const trimmed = value.trim();
    if (trimmed) router.push(`/ask?q=${encodeURIComponent(trimmed)}`);
  };

  const pendingRequest = assignments?.assigned_to_me[0];
  const openSurvey = surveys?.items[0];
  const recentMeeting = meetings?.items[0];
  const topSignal = isManager && signals?.cohort_met ? signals.themes.find((t) => !t.suppressed) : null;
  const recentMeetings = [...(meetings?.items ?? [])]
    .sort((a, b) => new Date(b.held_at ?? 0).getTime() - new Date(a.held_at ?? 0).getTime())
    .slice(0, 3);

  // ERROR-FIRST: the home dashboard is built entirely from `/home`, so a
  // failed fetch must surface an error card rather than a permanent skeleton
  // or a page rendered with undefined data.
  if (isError) {
    return (
      <div className="mx-auto w-full max-w-[1060px]">
        <ErrorState message="Couldn't load your home dashboard. The API may be down." onRetry={() => refetch()} />
      </div>
    );
  }

  // Today's BLUF: the few one-liners that changed today, dot-coded by nature.
  const bluf: { dot: string; text: string; href: string }[] = [];
  if (pendingRequest)
    bluf.push({
      dot: "var(--accent)",
      text: `Interview request from ${pendingRequest.created_by?.name ?? "your manager"}: ${pendingRequest.title}`,
      href: "/interviews",
    });
  if (data?.deadlines[0])
    bluf.push({
      dot: "#e0a35c",
      text: `${data.deadlines[0].title} — ${formatDate(data.deadlines[0].date)}`,
      href: "/company",
    });
  if (topSignal)
    bluf.push({
      dot: (topSignal.negative_share ?? 0) >= 0.5 ? "#e0a35c" : "#3fb27f",
      text: `Team signal: ${topSignal.name} (${topSignal.count} protected responses)`,
      href: "/insights",
    });
  if (openSurvey)
    bluf.push({ dot: "#3fb27f", text: `Pulse open: ${openSurvey.title}`, href: "/feedback" });
  if (data?.integration_warnings[0])
    bluf.push({
      dot: "#e0a35c",
      text: `Connector “${data.integration_warnings[0].display_name}” is ${data.integration_warnings[0].health}`,
      href: "/integrations",
    });
  if (recentMeeting)
    bluf.push({
      dot: "var(--accent)",
      text: `${recentMeeting.title}: ${recentMeeting.extraction.decisions?.length ?? 0} decisions captured`,
      href: "/meetings",
    });

  const columns: { name: string; status: TaskInfo["status"]; tasks: TaskInfo[] }[] = [
    { name: "To do", status: "open", tasks: [] },
    { name: "In progress", status: "in_progress", tasks: [] },
    { name: "Waiting", status: "blocked", tasks: [] },
  ];
  for (const task of data?.my_tasks ?? []) {
    columns.find((c) => c.status === task.status)?.tasks.push(task);
  }

  return (
    <div className="mx-auto w-full max-w-[1060px]">
      <header className="mb-7">
        <h1 className="text-[26px] font-semibold tracking-[-0.02em] text-ink">
          {greeting()}, {data?.greeting_name ?? user?.name.split(" ")[0]}
        </h1>
        <p className="mt-1.5 text-sm text-ink-3">Your company context, work, and voice in one place.</p>
      </header>

      {/* Ask bar */}
      <form
        className="mb-3.5 flex items-center gap-3 rounded-xl border border-line-strong bg-panel p-1.5 pl-[18px]"
        onSubmit={(event) => {
          event.preventDefault();
          ask(question);
        }}
      >
        <input
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="Ask Company Brain anything…"
          aria-label="Ask the company brain"
          className="min-w-0 flex-1 bg-transparent py-2.5 text-[14.5px] text-ink outline-none placeholder:text-ink-3"
        />
        <span className="hidden rounded-[5px] border border-line-strong px-[7px] py-0.5 font-mono text-[11.5px] text-ink-3 sm:inline">
          ⌘K
        </span>
        <Button type="submit" className="px-[18px]">
          Ask
        </Button>
      </form>
      <div className="mb-6 flex flex-wrap gap-2">
        {(data?.suggested_questions ?? []).slice(0, 3).map((prompt) => (
          <button
            key={prompt}
            onClick={() => ask(prompt)}
            className="rounded-full border border-line px-3 py-1.5 text-[11px] text-ink-3 transition-colors hover:border-line-strong hover:text-ink"
          >
            {prompt}
          </button>
        ))}
      </div>

      {/* BLUF + Upcoming */}
      <div className="mb-3.5 grid gap-3.5 md:grid-cols-2">
        <section className="rounded-xl border border-line bg-panel px-6 py-[22px]">
          <div className="mb-3 flex items-baseline justify-between">
            <SectionTitle>Today&apos;s BLUF</SectionTitle>
            <HeaderLink href={isManager ? "/insights" : "/explorer"}>View all</HeaderLink>
          </div>
          <div className="-mx-2.5 flex flex-col">
            {isLoading && (
              <div className="space-y-2 px-2.5">
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-9 w-full" />
              </div>
            )}
            {bluf.slice(0, 4).map((item) => (
              <Link
                key={item.text}
                href={item.href}
                className="flex items-center justify-between gap-3 rounded-lg px-2.5 py-3 transition-colors hover:bg-panel-2/60"
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span className="size-1.5 shrink-0 rounded-full" style={{ background: item.dot }} aria-hidden />
                  <span className="truncate text-sm text-ink">{item.text}</span>
                </span>
                <span className="shrink-0 text-[15px] text-ink-3/70">›</span>
              </Link>
            ))}
            {!isLoading && !bluf.length && (
              <p className="px-2.5 py-6 text-center text-xs text-ink-3">Nothing new — the bottom line is quiet.</p>
            )}
          </div>
        </section>

        <section className="rounded-xl border border-line bg-panel px-6 py-[22px]">
          <div className="mb-4 flex items-baseline justify-between">
            <SectionTitle>Upcoming</SectionTitle>
            <HeaderLink href="/meetings">Full schedule</HeaderLink>
          </div>
          <div className="flex flex-col gap-2.5">
            {recentMeetings.length > 0 ? (
              recentMeetings.map((meeting) => (
                <UpcomingRow
                  key={meeting.id}
                  time={formatDate(meeting.held_at)}
                  length={`${meeting.attendees.length} attendee${meeting.attendees.length === 1 ? "" : "s"}`}
                  title={meeting.title}
                  people={meeting.attendees.slice(0, 3).join(", ") || "No attendees recorded"}
                  href={`/meetings/${meeting.id}/review`}
                />
              ))
            ) : (
              !isLoading && (
                <EmptyState
                  title="No meetings imported yet"
                  body="Import a transcript from the Meetings page to see it here."
                />
              )
            )}
            {(data?.deadlines ?? []).slice(0, 2).map((deadline) => (
              <UpcomingRow
                key={deadline.document_id + deadline.date}
                time={shortDate(deadline.date)}
                length="deadline"
                title={deadline.title}
                people="Renewal decision needed"
                href="/company"
              />
            ))}
          </div>
        </section>
      </div>

      {/* Task board */}
      <section className="mb-3.5 rounded-xl border border-line bg-panel px-6 py-[22px]">
        <div className="mb-4 flex items-baseline justify-between">
          <SectionTitle>Task board</SectionTitle>
          <HeaderLink href="/approvals">Open tasks</HeaderLink>
        </div>
        <div className="grid gap-5 sm:grid-cols-3">
          {columns.map((column) => (
            <div key={column.name}>
              <div className="mb-3 flex items-center gap-2">
                <span className="text-[12.5px] font-semibold text-ink-2">{column.name}</span>
                <span className="rounded bg-panel-2 px-1.5 py-px font-mono text-[11px] text-ink-3">
                  {column.tasks.length}
                </span>
              </div>
              <div className="flex flex-col gap-2">
                {column.tasks.slice(0, 3).map((task) => (
                  <Link
                    key={task.id}
                    href="/approvals"
                    className="rounded-[9px] border border-line bg-bg/40 px-3.5 py-3 transition-colors hover:border-line-strong"
                  >
                    <p className="text-[13.5px] font-medium leading-[1.35] text-ink">{task.title}</p>
                    <p className="mt-1.5 text-xs text-ink-3">
                      {task.project || task.source}
                      {task.due_date ? ` · ${shortDate(task.due_date)}` : ""}
                    </p>
                  </Link>
                ))}
                <Link
                  href="/approvals"
                  className="rounded-[9px] border border-dashed border-line-strong px-3.5 py-[9px] text-left text-[12.5px] text-ink-3 transition-colors hover:border-ink-3/50 hover:text-ink-2"
                >
                  + Add task
                </Link>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Talk to the Brain + weekly pulse */}
      <div className="grid gap-3.5 md:grid-cols-[1.4fr_1fr]">
        <section className="rounded-xl border border-line bg-panel px-6 py-[22px]">
          <SectionTitle>Talk to the Brain</SectionTitle>
          <p className="mt-2 max-w-lg text-[12.5px] leading-relaxed text-ink-3">
            Explain a process, share a concern, prepare for a meeting, or capture something only you
            know. You review everything before it enters company memory.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href="/interviews/new?mode=voice"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-btn px-3.5 text-[13px] font-semibold text-btn-ink hover:opacity-90"
            >
              <Mic className="size-3.5" /> Voice interview
            </Link>
            <Link
              href="/interviews/new?mode=text"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line-strong px-3.5 text-[13px] font-medium text-ink hover:bg-panel-2"
            >
              <Keyboard className="size-3.5" /> Text interview
            </Link>
            <Link
              href="/interviews/new?mode=quick_text"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line-strong px-3.5 text-[13px] font-medium text-ink hover:bg-panel-2"
            >
              <Zap className="size-3.5" /> Quick capture
            </Link>
            <Link
              href="/interviews/new?mode=text&purpose=open"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line-strong px-3.5 text-[13px] font-medium text-ink hover:bg-panel-2"
              title="No agenda, no form — say how things are going and the brain listens"
            >
              <MessageSquareHeart className="size-3.5" /> Just talk
            </Link>
          </div>
          <Link href="/interviews" className="mt-3 inline-block text-[12.5px] text-accent hover:opacity-80">
            Drafts &amp; history
          </Link>
        </section>

        <PulseCard />
      </div>
    </div>
  );
}

function UpcomingRow({
  time,
  length,
  title,
  people,
  href,
}: {
  time: string;
  length: string;
  title: string;
  people: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="flex gap-4 rounded-[9px] border border-line bg-bg/40 px-3.5 py-3 transition-colors hover:border-line-strong"
    >
      <span className="min-w-[52px] flex-none text-right">
        <span className="block font-mono text-sm font-semibold text-ink">{time}</span>
        <span className="block text-[11.5px] text-ink-3">{length}</span>
      </span>
      <span className="w-px bg-line-strong/70" aria-hidden />
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-ink">{title}</span>
        <span className="mt-0.5 block truncate text-xs text-ink-3">{people}</span>
      </span>
    </Link>
  );
}

function PulseCard() {
  const [mood, setMood] = React.useState<string | null>(null);
  const [note, setNote] = React.useState("");
  const [done, setDone] = React.useState(false);

  const submit = useMutation({
    mutationFn: () =>
      api("/feedback", {
        method: "POST",
        body: {
          body: `Weekly pulse: ${mood}.${note.trim() ? ` ${note.trim()}` : ""}`,
          visibility: "anonymous",
          category: "pulse",
          allow_followup: false,
        },
      }),
    onSuccess: () => setDone(true),
  });

  if (done) {
    return (
      <section className="flex flex-col items-center justify-center rounded-xl border border-line bg-panel px-6 py-[22px] text-center">
        <CheckCircle2 className="size-6 text-good" />
        <p className="mt-3 text-sm font-semibold text-ink">Your pulse is in</p>
        <p className="mt-1 text-xs leading-relaxed text-ink-3">
          Recorded anonymously — it only surfaces as part of a protected theme.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-line bg-panel px-6 py-[22px]">
      <SectionTitle>This week&apos;s pulse</SectionTitle>
      <p className="mt-2 text-[15px] font-medium text-ink">How are you feeling about this week?</p>
      <p className="mt-1 text-[12.5px] text-ink-3">
        Your response is private and only surfaces as an aggregate theme.
      </p>
      <div className="mt-4 flex gap-2" role="radiogroup" aria-label="How work feels">
        {MOODS.map((label) => (
          <button
            key={label}
            role="radio"
            aria-checked={mood === label}
            onClick={() => setMood(label)}
            className={`flex-1 rounded-[9px] border px-1.5 py-3 text-[12px] font-medium transition-colors ${
              mood === label
                ? "border-accent text-ink"
                : "border-line-strong text-ink-2 hover:border-ink-3/50 hover:text-ink"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {mood && (
        <div className="mt-3 space-y-2">
          <Textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={2}
            placeholder="Want to add context? Optional."
            aria-label="Optional pulse context"
          />
          <Button onClick={() => submit.mutate()} disabled={submit.isPending} className="w-full">
            {submit.isPending ? "Sharing…" : <><Send className="size-3.5" /> Share anonymously</>}
          </Button>
          {submit.isError && <p className="text-[11px] text-crit">{(submit.error as Error).message}</p>}
        </div>
      )}
      {!mood && (
        <p className="mt-3.5 flex items-center gap-1.5 text-[11px] text-ink-3">
          <LockKeyhole className="size-3 text-good" /> Anonymous — identity is not stored
        </p>
      )}
    </section>
  );
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function shortDate(iso: string): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(iso));
}
