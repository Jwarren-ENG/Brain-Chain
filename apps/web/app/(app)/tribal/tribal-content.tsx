"use client";

import { DocumentDrawer } from "@/components/document";
import {
  Badge,
  Card,
  CardSkeleton,
  Dialog,
  EmptyState,
  StatusChip,
  Tabs,
} from "@/components/ui";
import { useSession } from "@/components/providers";
import { api } from "@/lib/api";
import { formatDate, hasRole } from "@/lib/utils";
import type { DecisionInfo, MeetingInfo } from "@brainchain/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import {
  CalendarDays,
  CircleHelp,
  GitBranch,
  Landmark,
  ListChecks,
  TriangleAlert,
  Users,
  Video,
} from "lucide-react";
import * as React from "react";

export default function TribalContent() {
  const [tab, setTab] = React.useState("meetings");
  const [openMeeting, setOpenMeeting] = React.useState<MeetingInfo | null>(null);
  const [openDoc, setOpenDoc] = React.useState<string | null>(null);
  const { user } = useSession();
  const canConfirm = hasRole(user, "manager", "executive");
  const queryClient = useQueryClient();

  const { data: meetings, isLoading: meetingsLoading } = useQuery({
    queryKey: ["meetings"],
    queryFn: () => api<{ items: MeetingInfo[] }>("/meetings"),
  });
  const { data: decisions, isLoading: decisionsLoading } = useQuery({
    queryKey: ["decisions"],
    queryFn: () => api<{ items: DecisionInfo[] }>("/decisions"),
  });
  const confirm = useMutation({
    mutationFn: (decisionId: string) =>
      api(`/decisions/${decisionId}/confirm`, { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["decisions"] }),
  });

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-semibold text-ink">
            <Users className="size-5 text-accent" /> Tribal Knowledge
          </h1>
          <p className="text-xs text-ink-3">
            What usually lives in people's heads: meetings, conversations and decisions — captured,
            extracted and queryable.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/interviews/new?purpose=decision&mode=text"
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line-strong bg-panel px-3 text-xs font-medium text-ink hover:bg-panel-2"
          >
            <Landmark className="size-3.5 text-accent" /> Document a decision
          </Link>
          <Tabs
            tabs={[
              { key: "meetings", label: "Meetings" },
              { key: "decisions", label: "Decision Memory" },
            ]}
            value={tab}
            onChange={setTab}
          />
        </div>
      </div>

      {tab === "meetings" && (
        <div className="grid gap-3 md:grid-cols-2">
          {meetingsLoading && (
            <>
              <CardSkeleton />
              <CardSkeleton />
            </>
          )}
          {meetings?.items.map((m) => {
            const e = m.extraction;
            return (
              <Card
                key={m.id}
                className="cursor-pointer p-4 transition-colors hover:border-accent"
                onClick={() => setOpenMeeting(m)}
                role="button"
                tabIndex={0}
                onKeyDown={(ev) => ev.key === "Enter" && setOpenMeeting(m)}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-ink">{m.title}</p>
                  <Badge tone="neutral">
                    <Video className="size-3" /> {m.source}
                  </Badge>
                </div>
                <p className="mt-1 flex items-center gap-1.5 text-[11px] text-ink-3">
                  <CalendarDays className="size-3" /> {formatDate(m.held_at)} ·{" "}
                  {m.attendees.length} attendees
                </p>
                <div className="mt-3 grid grid-cols-4 gap-2 text-center">
                  <ExtractStat label="Decisions" value={e.decisions?.length ?? 0} />
                  <ExtractStat label="Actions" value={e.action_items?.length ?? 0} />
                  <ExtractStat label="Risks" value={e.risks?.length ?? 0} warn />
                  <ExtractStat label="Questions" value={e.open_questions?.length ?? 0} />
                </div>
              </Card>
            );
          })}
          {meetings && !meetings.items.length && (
            <EmptyState
              title="No meetings ingested yet"
              body="Sync the Zoom connector from Integrations to ingest the pending transcript."
            />
          )}
        </div>
      )}

      {tab === "decisions" && (
        <div className="space-y-3">
          {decisionsLoading && <CardSkeleton rows={4} />}
          {decisions?.items.map((d) => (
            <Card key={d.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex items-start gap-2.5">
                  <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
                    <Landmark className="size-3.5" />
                  </span>
                  <div>
                    <p className="text-sm font-medium leading-snug text-ink">{d.title}</p>
                    <p className="mt-0.5 text-[11px] text-ink-3">
                      Decided {formatDate(d.decided_at)}
                      {d.project ? ` · ${d.project}` : ""} · involved:{" "}
                      {d.owners.join(", ") || "unrecorded"}
                    </p>
                  </div>
                </div>
                <StatusChip status={d.status} />
              </div>
              {d.rationale && (
                <p className="mt-2 border-l-2 border-line pl-3 text-xs leading-relaxed text-ink-2">
                  <span className="font-medium text-ink-3">Why: </span>
                  {d.rationale}
                </p>
              )}
              {d.status === "proposed" && Object.keys(d.details ?? {}).length > 0 && (
                <div className="mt-2 space-y-1 rounded-lg bg-panel-2 p-2.5 text-[11px] text-ink-2">
                  {(d.details.alternatives as string[] | undefined)?.map((alt, i) => (
                    <p key={`alt-${i}`}><span className="font-medium text-ink-3">Alternative: </span>{alt}</p>
                  ))}
                  {(d.details.dissent as string[] | undefined)?.map((item, i) => (
                    <p key={`dis-${i}`}><span className="font-medium text-warn">Dissent: </span>{item}</p>
                  ))}
                  {(d.details.assumptions as string[] | undefined)?.map((item, i) => (
                    <p key={`asm-${i}`}><span className="font-medium text-ink-3">Assumes: </span>{item}</p>
                  ))}
                  {(d.details.success_metrics as string[] | undefined)?.map((item, i) => (
                    <p key={`met-${i}`}><span className="font-medium text-good">Success: </span>{item}</p>
                  ))}
                </div>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px]">
                {d.supersedes_id && (
                  <span className="inline-flex items-center gap-1 text-ink-3">
                    <GitBranch className="size-3" /> supersedes an earlier decision
                  </span>
                )}
                {d.document_id && (
                  <button
                    onClick={() => setOpenDoc(d.document_id)}
                    className="font-medium text-accent hover:underline"
                  >
                    View supporting source
                  </button>
                )}
                {d.status === "proposed" && canConfirm && (
                  <button
                    onClick={() => confirm.mutate(d.id)}
                    disabled={confirm.isPending}
                    className="ml-auto inline-flex items-center gap-1 rounded-lg bg-good px-2.5 py-1 font-semibold text-white hover:opacity-90"
                  >
                    Confirm decision
                  </button>
                )}
                {d.status === "proposed" && !canConfirm && (
                  <span className="ml-auto text-ink-3">awaiting confirmation by a decision owner</span>
                )}
              </div>
            </Card>
          ))}
          {decisions && !decisions.items.length && <EmptyState title="No decisions recorded yet" />}
        </div>
      )}

      <Dialog
        open={!!openMeeting}
        onClose={() => setOpenMeeting(null)}
        title={openMeeting?.title ?? ""}
        wide
      >
        {openMeeting && (
          <div className="space-y-4">
            <p className="text-xs text-ink-3">
              {formatDate(openMeeting.held_at)} · via {openMeeting.source} · Attendees:{" "}
              {openMeeting.attendees.join(", ")}
            </p>
            <ExtractionSection
              icon={<Landmark className="size-3.5 text-accent" />}
              title="Decisions"
              items={(openMeeting.extraction.decisions ?? []).map(
                (d) => `${d.text} — ${d.speaker}`,
              )}
            />
            <ExtractionSection
              icon={<ListChecks className="size-3.5 text-good" />}
              title="Action items"
              items={(openMeeting.extraction.action_items ?? []).map(
                (a) => `${a.text} (owner: ${a.owner}${a.deadline ? `, by ${a.deadline}` : ""})`,
              )}
            />
            <ExtractionSection
              icon={<TriangleAlert className="size-3.5 text-warn" />}
              title="Risk mentions"
              items={(openMeeting.extraction.risks ?? []).map((r) => `${r.text} — ${r.speaker}`)}
            />
            <ExtractionSection
              icon={<CircleHelp className="size-3.5 text-ink-3" />}
              title="Open questions"
              items={(openMeeting.extraction.open_questions ?? []).map(
                (q) => `${q.text} — ${q.speaker}`,
              )}
            />
            {openMeeting.transcript_document_id && (
              <button
                onClick={() => {
                  setOpenDoc(openMeeting.transcript_document_id);
                  setOpenMeeting(null);
                }}
                className="text-xs font-medium text-accent hover:underline"
              >
                Open full transcript →
              </button>
            )}
          </div>
        )}
      </Dialog>

      <DocumentDrawer docId={openDoc} onClose={() => setOpenDoc(null)} />
    </div>
  );
}

function ExtractStat({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <div className="rounded-lg bg-panel-2 py-1.5">
      <p className={`text-sm font-semibold tabular-nums ${warn && value ? "text-warn" : "text-ink"}`}>
        {value}
      </p>
      <p className="text-[10px] text-ink-3">{label}</p>
    </div>
  );
}

function ExtractionSection({
  icon,
  title,
  items,
}: {
  icon: React.ReactNode;
  title: string;
  items: string[];
}) {
  if (!items.length) return null;
  return (
    <div>
      <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-ink">
        {icon} {title} ({items.length})
      </p>
      <ul className="space-y-1">
        {items.map((item, i) => (
          <li key={i} className="rounded-lg bg-panel-2 px-3 py-2 text-xs leading-relaxed text-ink-2">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
