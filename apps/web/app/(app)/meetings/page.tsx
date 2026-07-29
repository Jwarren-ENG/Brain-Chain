"use client";

import { ContributeMenu } from "@/components/contribute-menu";
import { useSession } from "@/components/providers";
import { CardSkeleton, Dialog, EmptyState, ErrorState } from "@/components/ui";
import { api, apiUpload } from "@/lib/api";
import { ASSISTANT_NAME, ASSISTANT_NAME_CAPITALIZED } from "@/lib/brand";
import { formatDate, hasRole } from "@/lib/utils";
import type { Classification, MeetingImportResponse, MeetingInfo } from "@brainchain/shared";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import {
  Brain,
  CalendarDays,
  CircleHelp,
  Landmark,
  ListChecks,
  MessageCircleMore,
  TriangleAlert,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { MeetingCard } from "./meeting-card";
import { InvitePanel } from "./invite-panel";

export default function MeetingsPage() {
  const { user } = useSession();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [openMeeting, setOpenMeeting] = React.useState<MeetingInfo | null>(null);
  const [reflectionOpen, setReflectionOpen] = React.useState<MeetingInfo | null>(null);

  const canImport = hasRole(user, "manager", "data_steward", "system_admin");

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["meetings"],
    queryFn: () => api<{ items: MeetingInfo[] }>("/meetings"),
  });

  const { data: classifications } = useQuery({
    queryKey: ["gov-classifications"],
    queryFn: () => api<{ items: Classification[] }>("/governance/classifications"),
    enabled: canImport,
  });

  function handleImported(result: MeetingImportResponse) {
    queryClient.invalidateQueries({ queryKey: ["meetings"] });
    router.push(`/meetings/${result.meeting.id}/review`);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-ink">
            <CalendarDays className="size-5 text-accent" /> Meetings
          </h1>
          <p className="mt-1 text-sm text-ink-3">Recaps, decisions, and follow-through from every captured meeting.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ContributeMenu
            user={user}
            classifications={classifications?.items ?? []}
            onImported={handleImported}
            importFn={(form) => apiUpload<MeetingImportResponse>("/meetings/import", form)}
          />
        </div>
      </header>

      <InvitePanel
        importSlot={
          <ContributeMenu
            user={user}
            classifications={classifications?.items ?? []}
            onImported={handleImported}
            importFn={(form) => apiUpload<MeetingImportResponse>("/meetings/import", form)}
          />
        }
      />

      {isError ? (
        <ErrorState message="Couldn't load meetings. The API may be down." onRetry={() => refetch()} />
      ) : (
        <div className="space-y-4">
          {isLoading && <><CardSkeleton /><CardSkeleton /></>}
          {data?.items.map((meeting) => (
            <MeetingCard
              key={meeting.id}
              meeting={meeting}
              onOpen={() => setOpenMeeting(meeting)}
              onReflect={() => setReflectionOpen(meeting)}
            />
          ))}
          {data && !data.items.length && <EmptyState title="No meeting memory yet" body="Import a recording or transcript to get started." />}
        </div>
      )}

      <Dialog open={!!reflectionOpen} onClose={() => setReflectionOpen(null)} title={`Reflect on ${reflectionOpen?.title ?? "the meeting"}`}>
        {reflectionOpen && (
          <div className="space-y-3">
            <p className="text-xs leading-relaxed text-ink-3">
              What landed well? What was left unsaid? {ASSISTANT_NAME_CAPITALIZED}{" "}
              asks a few questions and you review what it understood before anything is shared.
              Reflections join the protected outcome memory — anonymous text is available.
            </p>
            <div className="grid gap-2">
              <LaunchOption
                href={`/interviews/new?purpose=outcome_review&mode=text&meeting=${reflectionOpen.id}`}
                icon={<Brain className="size-4" />}
                title="Reflect in text"
                blurb="Named, confidential, or anonymous."
              />
              <LaunchOption
                href={`/interviews/new?purpose=outcome_review&mode=quick_text&meeting=${reflectionOpen.id}`}
                icon={<MessageCircleMore className="size-4" />}
                title="Quick reflection"
                blurb="One thought, straight to review."
              />
            </div>
          </div>
        )}
      </Dialog>

      <Dialog open={!!openMeeting} onClose={() => setOpenMeeting(null)} title={openMeeting?.title ?? "Meeting recap"} wide>
        {openMeeting && <MeetingRecap meeting={openMeeting} />}
      </Dialog>
    </div>
  );
}

function LaunchOption({
  href,
  icon,
  title,
  blurb,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  blurb: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-start gap-3 rounded-xl border border-line p-3 transition-colors hover:border-accent hover:bg-accent-soft/40"
    >
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-panel-2 text-accent">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-xs font-semibold text-ink">{title}</span>
        <span className="mt-0.5 block text-[10.5px] leading-relaxed text-ink-3">{blurb}</span>
      </span>
    </Link>
  );
}

function MeetingRecap({ meeting }: { meeting: MeetingInfo }) {
  const extraction = meeting.extraction;
  const sections = [
    { title: "Decisions", icon: <Landmark className="size-4 text-accent" />, items: (extraction.decisions ?? []).map((item) => `${item.text} — ${item.speaker}`) },
    { title: "Action items", icon: <ListChecks className="size-4 text-good" />, items: (extraction.action_items ?? []).map((item) => `${item.text} — ${item.owner}${item.deadline ? `, due ${item.deadline}` : ""}`) },
    { title: "Risks", icon: <TriangleAlert className="size-4 text-warn" />, items: (extraction.risks ?? []).map((item) => `${item.text} — ${item.speaker}`) },
    { title: "Open questions", icon: <CircleHelp className="size-4 text-ink-3" />, items: (extraction.open_questions ?? []).map((item) => `${item.text} — ${item.speaker}`) },
  ];
  return (
    <div className="space-y-4">
      <p className="flex items-center gap-2 text-xs text-ink-3"><Users className="size-3.5" /> {formatDate(meeting.held_at)} · {meeting.attendees.join(", ")}</p>
      {sections.filter((section) => section.items.length).map((section) => (
        <section key={section.title}>
          <p className="mb-2 flex items-center gap-2 text-xs font-semibold text-ink">{section.icon} {section.title}</p>
          <div className="space-y-1.5">
            {section.items.map((item, index) => <p key={index} className="rounded-lg bg-panel-2 px-3 py-2 text-xs leading-relaxed text-ink-2">{item}</p>)}
          </div>
        </section>
      ))}
      {!sections.some((section) => section.items.length) && <EmptyState title="No structured recap yet" />}
    </div>
  );
}
