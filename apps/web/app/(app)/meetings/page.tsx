"use client";

import { useSession } from "@/components/providers";
import { Button, Dialog, ErrorState, Spinner } from "@/components/ui";
import { api, apiUpload } from "@/lib/api";
import { ASSISTANT_NAME_CAPITALIZED } from "@/lib/brand";
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
import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { ImportTranscriptDialog } from "./import-dialog";
import { InvitePanel } from "./invite-panel";
import { MeetingChat } from "./meeting-chat";
import { MeetingHeader } from "./meeting-header";

function MeetingsInner() {
  const { user } = useSession();
  const router = useRouter();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const selectedId = params.get("m");
  const [recapOpen, setRecapOpen] = React.useState(false);
  const [reflectOpen, setReflectOpen] = React.useState(false);
  const [importOpen, setImportOpen] = React.useState(params.get("import") === "1");

  const canImport = hasRole(user, "manager", "data_steward", "system_admin");

  const { data, isError, refetch } = useQuery({
    queryKey: ["meetings"],
    queryFn: () => api<{ items: MeetingInfo[] }>("/meetings"),
  });
  const { data: classifications } = useQuery({
    queryKey: ["gov-classifications"],
    queryFn: () => api<{ items: Classification[] }>("/governance/classifications"),
    enabled: canImport,
  });

  // The sidebar (shell) links here with ?import=1; honor it after mount too.
  React.useEffect(() => {
    if (params.get("import") === "1") setImportOpen(true);
  }, [params]);

  const meeting = (data?.items ?? []).find((m) => m.id === selectedId) ?? null;

  function handleImported(result: MeetingImportResponse) {
    queryClient.invalidateQueries({ queryKey: ["meetings"] });
    router.push(`/meetings/${result.meeting.id}/review`);
  }

  if (isError) {
    return <ErrorState message="Couldn't load meetings. The API may be down." onRetry={() => refetch()} />;
  }

  return (
    <div className="mx-auto max-w-3xl">
      {meeting ? (
        <>
          <MeetingHeader
            meeting={meeting}
            onDetails={() => setRecapOpen(true)}
            onReflect={() => setReflectOpen(true)}
          />
          <MeetingChat meeting={meeting} suggestions={suggestionsFor(meeting)} />
        </>
      ) : (
        <div className="space-y-6 pt-10">
          <div className="flex flex-col items-center gap-4 text-center">
            <CalendarDays className="size-8 text-accent" />
            <h1 className="text-2xl font-semibold text-ink sm:text-[28px]">Ask about your meetings</h1>
            <p className="max-w-md text-xs text-ink-3">
              Pick a meeting from the sidebar to talk it through with {ASSISTANT_NAME_CAPITALIZED} —
              what was decided, who owns what, and what's still open.
            </p>
          </div>
          <InvitePanel
            importSlot={
              canImport ? (
                <Button onClick={() => setImportOpen(true)}>Import a recording or transcript</Button>
              ) : null
            }
          />
        </div>
      )}

      {canImport && (
        <ImportTranscriptDialog
          open={importOpen}
          onClose={() => setImportOpen(false)}
          classifications={classifications?.items ?? []}
          onImported={handleImported}
          importFn={(form) => apiUpload<MeetingImportResponse>("/meetings/import", form)}
        />
      )}

      <Dialog open={reflectOpen} onClose={() => setReflectOpen(false)} title={`Reflect on ${meeting?.title ?? "the meeting"}`}>
        {meeting && (
          <div className="space-y-3">
            <p className="text-xs leading-relaxed text-ink-3">
              What landed well? What was left unsaid? {ASSISTANT_NAME_CAPITALIZED}{" "}
              asks a few questions and you review what it understood before anything is shared.
              Reflections join the protected outcome memory — anonymous text is available.
            </p>
            <div className="grid gap-2">
              <LaunchOption
                href={`/interviews/new?purpose=outcome_review&mode=text&meeting=${meeting.id}`}
                icon={<Brain className="size-4" />}
                title="Reflect in text"
                blurb="Named, confidential, or anonymous."
              />
              <LaunchOption
                href={`/interviews/new?purpose=outcome_review&mode=quick_text&meeting=${meeting.id}`}
                icon={<MessageCircleMore className="size-4" />}
                title="Quick reflection"
                blurb="One thought, straight to review."
              />
            </div>
          </div>
        )}
      </Dialog>

      <Dialog open={recapOpen} onClose={() => setRecapOpen(false)} title={meeting?.title ?? "Meeting recap"} wide>
        {meeting && <MeetingRecap meeting={meeting} />}
      </Dialog>
    </div>
  );
}

export default function MeetingsPage() {
  return (
    <React.Suspense fallback={<Spinner />}>
      <MeetingsInner />
    </React.Suspense>
  );
}

/* Meeting-derived suggestion chips: generic prompts always apply; extraction
   counts add sharper ones when the capture found something to point at. */
function suggestionsFor(meeting: MeetingInfo): string[] {
  const extraction = meeting.extraction ?? {};
  const out = ["Summarize this meeting", "What was decided?"];
  if ((extraction.actions ?? extraction.action_items ?? []).length) {
    out.push("Who owns the action items?");
  }
  if ((extraction.risks ?? []).length) out.push("What risks were raised?");
  if ((extraction.questions ?? extraction.open_questions ?? []).length) {
    out.push("What's still unresolved?");
  }
  return out.slice(0, 4);
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
    </div>
  );
}
