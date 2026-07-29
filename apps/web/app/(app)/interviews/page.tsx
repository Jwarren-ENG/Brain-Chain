"use client";

import { PURPOSES } from "@/components/interview/shared";
import {
  Badge,
  Button,
  Card,
  CardSkeleton,
  Dialog,
  EmptyState,
  Input,
  Select,
  StatusChip,
  Textarea,
} from "@/components/ui";
import { useSession } from "@/components/providers";
import { api } from "@/lib/api";
import { formatDateTime, hasRole } from "@/lib/utils";
import type {
  InterviewAssignmentInfo,
  InterviewSessionInfo,
} from "@brainchain/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Brain,
  Building2,
  EyeOff,
  Inbox,
  Keyboard,
  Lock,
  Mic,
  Plus,
  Send,
  UserRound,
  Users,
  Zap,
} from "lucide-react";
import Link from "next/link";
import * as React from "react";

const MODE_ICON = {
  voice: <Mic className="size-3.5" />,
  quick_voice: <Mic className="size-3.5" />,
  text: <Keyboard className="size-3.5" />,
  quick_text: <Zap className="size-3.5" />,
} as const;

const VIS_ICON = {
  named: <UserRound className="size-3" />,
  confidential: <Lock className="size-3" />,
  anonymous: <EyeOff className="size-3" />,
} as const;

interface AssignmentsResponse {
  assigned_to_me: InterviewAssignmentInfo[];
  created_by_me: InterviewAssignmentInfo[];
}

export default function InterviewsPage() {
  const { user } = useSession();
  const isManager = hasRole(user, "manager", "executive");
  const [requestOpen, setRequestOpen] = React.useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["interviews"],
    queryFn: () => api<{ items: InterviewSessionInfo[] }>("/interviews"),
  });
  const { data: assignments } = useQuery({
    queryKey: ["interview-assignments"],
    queryFn: () => api<AssignmentsResponse>("/interview-assignments"),
  });

  const drafts = (data?.items ?? []).filter((s) =>
    ["draft", "consent_required", "active", "paused", "review_required", "failed"].includes(s.status),
  );
  const done = (data?.items ?? []).filter((s) => ["published", "discarded", "processing"].includes(s.status));

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-ink">
            <Brain className="size-5 text-accent" /> Your interviews
          </h1>
          <p className="mt-1 text-sm text-ink-3">
            Drafts, history, and requests. Anonymous interviews never appear here — they aren't
            linked to your account.
          </p>
        </div>
        <div className="flex gap-2">
          {isManager && (
            <Button variant="secondary" onClick={() => setRequestOpen(true)}>
              <Send className="size-4" /> Request an interview
            </Button>
          )}
          <Link
            href="/interviews/new"
            className="inline-flex h-9.5 items-center gap-1.5 rounded-lg bg-accent px-3.5 text-sm font-medium text-accent-ink hover:opacity-90"
          >
            <Plus className="size-4" /> Talk to the Brain
          </Link>
        </div>
      </header>

      {(assignments?.assigned_to_me.length ?? 0) > 0 && (
        <section aria-label="Assigned to you">
          <h2 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-ink-3">
            <Inbox className="size-3.5" /> Requested from you
          </h2>
          <div className="space-y-2">
            {assignments!.assigned_to_me.map((assignment) => (
              <AssignedCard key={assignment.id} assignment={assignment} />
            ))}
          </div>
        </section>
      )}

      {isManager && (assignments?.created_by_me.length ?? 0) > 0 && (
        <section aria-label="Requests you created">
          <h2 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-ink-3">
            <Users className="size-3.5" /> Requests you created
          </h2>
          <div className="space-y-2">
            {assignments!.created_by_me.map((assignment) => (
              <CreatedCard key={assignment.id} assignment={assignment} />
            ))}
          </div>
        </section>
      )}

      {isLoading && <CardSkeleton rows={3} />}

      {!isLoading && (
        <>
          <Section title="Continue" items={drafts} />
          <Section title="Finished" items={done} />
          {!drafts.length && !done.length && !(assignments?.assigned_to_me.length ?? 0) && (
            <EmptyState
              icon={<Brain className="size-6" />}
              title="Tell the company brain something it should understand"
              body="Explain a process, share a concern, prepare a meeting, just talk, or capture what only you know."
              action={
                <Link href="/interviews/new" className="text-sm font-medium text-accent hover:underline">
                  Start an interview
                </Link>
              }
            />
          )}
        </>
      )}

      <RequestDialog open={requestOpen} onClose={() => setRequestOpen(false)} />
    </div>
  );
}

/* ------------------------------------------------------- assigned to me */

function AssignedCard({ assignment }: { assignment: InterviewAssignmentInfo }) {
  const queryClient = useQueryClient();
  const [declineOpen, setDeclineOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const decline = useMutation({
    mutationFn: () =>
      api(`/interview-assignments/${assignment.id}/decline`, {
        method: "POST",
        body: { reason },
      }),
    onSuccess: () => {
      setDeclineOpen(false);
      queryClient.invalidateQueries({ queryKey: ["interview-assignments"] });
    },
  });
  const purpose = PURPOSES.find((p) => p.key === assignment.purpose);

  return (
    <Card className="border-accent/30 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">{assignment.title}</p>
          <p className="mt-0.5 text-[11px] text-ink-3">
            {assignment.created_by?.name} asked{" "}
            {assignment.scope === "department"
              ? `everyone in ${assignment.department}`
              : "you"}{" "}
            · {purpose?.label ?? assignment.purpose} · {formatDateTime(assignment.created_at)}
          </p>
        </div>
        <Badge tone="accent">request</Badge>
      </div>
      {assignment.note && (
        <p className="mt-2 rounded-lg bg-panel-2 px-3 py-2 text-xs leading-relaxed text-ink-2">
          “{assignment.note}”
        </p>
      )}
      <p className="mt-2 text-[11px] leading-relaxed text-ink-3">
        {assignment.scope === "individual"
          ? "This was addressed to you personally, so responses are named or confidential — a cohort of one is not anonymous. You can decline."
          : "Team request: respond named, confidential, or anonymous. The requester only ever sees how many people responded — never who."}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link
          href={`/interviews/new?assignment=${assignment.id}&purpose=${assignment.purpose}&mode=${assignment.suggested_mode}${assignment.scope === "individual" ? "&noanon=1" : ""}`}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 text-xs font-medium text-accent-ink hover:opacity-90"
        >
          Respond
        </Link>
        {assignment.scope === "individual" && (
          <Button size="sm" variant="ghost" onClick={() => setDeclineOpen(true)}>
            Decline
          </Button>
        )}
      </div>
      <Dialog open={declineOpen} onClose={() => setDeclineOpen(false)} title="Decline this request?">
        <div className="space-y-3">
          <p className="text-sm text-ink-2">
            Declining is always okay — a request is not an order. You can add an optional reason
            for {assignment.created_by?.name}.
          </p>
          <Textarea
            rows={2}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Optional reason"
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDeclineOpen(false)}>
              Keep it
            </Button>
            <Button onClick={() => decline.mutate()} disabled={decline.isPending}>
              Decline request
            </Button>
          </div>
        </div>
      </Dialog>
    </Card>
  );
}

/* ------------------------------------------------------ created by me */

function CreatedCard({ assignment }: { assignment: InterviewAssignmentInfo }) {
  const queryClient = useQueryClient();
  const cancel = useMutation({
    mutationFn: () =>
      api(`/interview-assignments/${assignment.id}/cancel`, { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["interview-assignments"] }),
  });
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex size-7 items-center justify-center rounded-lg bg-panel-2 text-ink-2">
          {assignment.scope === "department" ? <Building2 className="size-3.5" /> : <UserRound className="size-3.5" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink">{assignment.title}</p>
          <p className="text-[11px] text-ink-3">
            {assignment.scope === "department"
              ? `${assignment.department} · ${assignment.response_count ?? 0} response${(assignment.response_count ?? 0) === 1 ? "" : "s"} (aggregate only)`
              : `${assignment.assignee?.name ?? "—"}`}
          </p>
        </div>
        <StatusChip status={assignment.status} />
        {assignment.status === "open" && (
          <Button size="sm" variant="ghost" onClick={() => cancel.mutate()} disabled={cancel.isPending}>
            Cancel
          </Button>
        )}
      </div>
      {assignment.status === "declined" && assignment.decline_reason && (
        <p className="mt-2 text-[11px] italic text-ink-3">Declined: “{assignment.decline_reason}”</p>
      )}
    </Card>
  );
}

/* ------------------------------------------------------- request dialog */

function RequestDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [scope, setScope] = React.useState<"individual" | "department">("individual");
  const [target, setTarget] = React.useState("");
  const [purpose, setPurpose] = React.useState("process");
  const [title, setTitle] = React.useState("");
  const [note, setNote] = React.useState("");

  const { data: targets } = useQuery({
    queryKey: ["assignment-targets"],
    queryFn: () =>
      api<{ people: { id: string; name: string; department: string | null }[]; departments: { id: string; name: string }[] }>(
        "/interview-assignments/targets",
      ),
    enabled: open,
  });

  const create = useMutation({
    mutationFn: () =>
      api("/interview-assignments", {
        method: "POST",
        body: {
          purpose,
          title,
          note,
          assignee_user_id: scope === "individual" ? target : null,
          department_id: scope === "department" ? target : null,
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["interview-assignments"] });
      onClose();
      setTitle("");
      setNote("");
    },
  });

  return (
    <Dialog open={open} onClose={onClose} title="Request an interview">
      <div className="space-y-3">
        <p className="text-xs leading-relaxed text-ink-3">
          Ask a person or a team to talk to the brain about something. It's a request, not an
          order: individuals can decline, team members can simply not respond, and you never see
          the conversation itself — only what they choose to publish
          {scope === "department" ? " and an aggregate response count" : ""}.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <Select value={scope} onChange={(e) => { setScope(e.target.value as typeof scope); setTarget(""); }} aria-label="Request scope">
            <option value="individual">One person</option>
            <option value="department">A department</option>
          </Select>
          <Select value={target} onChange={(e) => setTarget(e.target.value)} aria-label="Request target">
            <option value="">Choose…</option>
            {scope === "individual"
              ? targets?.people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.department ? ` (${p.department})` : ""}
                  </option>
                ))
              : targets?.departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
          </Select>
        </div>
        <Select value={purpose} onChange={(e) => setPurpose(e.target.value)} aria-label="Purpose" className="w-full">
          {PURPOSES.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label}
            </option>
          ))}
        </Select>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What do you want to understand? (shown to them verbatim)"
          maxLength={200}
          aria-label="Request title"
        />
        <Textarea
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Optional context — why you're asking"
          aria-label="Request note"
        />
        {scope === "individual" && (
          <p className="text-[11px] leading-relaxed text-ink-3">
            Personal requests can be answered named or confidentially, never anonymously — the
            recipient is told why.
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => create.mutate()}
            disabled={!target || title.trim().length < 3 || create.isPending}
          >
            <Send className="size-3.5" /> Send request
          </Button>
        </div>
        {create.isError && <p className="text-xs text-crit">{(create.error as Error).message}</p>}
      </div>
    </Dialog>
  );
}

/* --------------------------------------------------------------- history */

function Section({ title, items }: { title: string; items: InterviewSessionInfo[] }) {
  if (!items.length) return null;
  return (
    <section aria-label={title}>
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-3">{title}</h2>
      <div className="space-y-2">
        {items.map((session) => (
          <Card key={session.id} className="flex items-center gap-3 p-3.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-panel-2 text-ink-2">
              {MODE_ICON[session.mode]}
            </span>
            <div className="min-w-0 flex-1">
              <Link href={`/interviews/${session.id}`} className="block truncate text-sm font-medium text-ink hover:text-accent">
                {session.title || session.purpose.replace(/_/g, " ")}
              </Link>
              <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-ink-3">
                <Badge tone="neutral">{session.purpose.replace(/_/g, " ")}</Badge>
                <Badge tone="accent">
                  {VIS_ICON[session.visibility]} {session.visibility}
                </Badge>
                <span>{formatDateTime(session.created_at)}</span>
              </p>
            </div>
            <StatusChip status={session.status} />
            <Link href={`/interviews/${session.id}`}>
              <Button size="sm" variant="secondary">
                {session.status === "review_required" ? "Review" : session.status === "published" ? "View" : "Continue"}
              </Button>
            </Link>
          </Card>
        ))}
      </div>
    </section>
  );
}
