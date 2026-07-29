"use client";

import { useSession } from "@/components/providers";
import { Badge, Button, Card, CardSkeleton, Dialog, EmptyState, Tabs } from "@/components/ui";
import { api, apiUpload } from "@/lib/api";
import { formatDate, hasRole } from "@/lib/utils";
import type { Classification, MeetingImportResponse, MeetingInfo, MeetingTopicInfo } from "@brainchain/shared";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Brain,
  CalendarDays,
  CircleHelp,
  Clock3,
  EyeOff,
  Landmark,
  ListChecks,
  LockKeyhole,
  MessageCircleMore,
  Mic2,
  Sparkles,
  Upload,
  TriangleAlert,
  Users,
  Video,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { ImportTranscriptDialog } from "./import-dialog";

export default function MeetingsPage() {
  const { user } = useSession();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [tab, setTab] = React.useState("prepare");
  const [openMeeting, setOpenMeeting] = React.useState<MeetingInfo | null>(null);
  const [contributeOpen, setContributeOpen] = React.useState(false);
  const [reflectionOpen, setReflectionOpen] = React.useState<MeetingInfo | null>(null);
  const [importOpen, setImportOpen] = React.useState(false);

  const canImport = hasRole(user, "manager", "data_steward", "system_admin");

  const { data, isLoading } = useQuery({
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

  const latest = data?.items[0];
  const { data: topics } = useQuery({
    queryKey: ["meeting-topics", latest?.id],
    queryFn: () => api<{ items: MeetingTopicInfo[] }>(`/meetings/${latest!.id}/topics`),
    enabled: !!latest,
  });
  const attendees = latest?.attendees.slice(0, 4) ?? ["Morgan Reyes", "Avery Chen", "Jordan Blake"];

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-ink">
            <CalendarDays className="size-5 text-accent" /> Meetings
          </h1>
          <p className="mt-1 text-sm text-ink-3">Better input before the room. Clear decisions and honest feedback after.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canImport && (
            <Button variant="secondary" size="sm" onClick={() => setImportOpen(true)}>
              <Upload className="size-3.5" /> Import transcript
            </Button>
          )}
          <Tabs
            tabs={[
              { key: "prepare", label: "Prepare" },
              { key: "recaps", label: "Recaps & decisions" },
            ]}
            value={tab}
            onChange={setTab}
          />
        </div>
      </header>

      {tab === "prepare" ? (
        <div className="space-y-5">
          <section className="overflow-hidden rounded-2xl border border-accent/20 bg-[linear-gradient(140deg,var(--panel)_0%,var(--accent-soft)_160%)]">
            <div className="grid gap-5 p-5 md:grid-cols-[minmax(0,1.5fr)_minmax(260px,0.75fr)] md:p-6">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="accent"><Clock3 className="size-3" /> tomorrow · 10:00 AM</Badge>
                  <Badge tone="neutral"><Video className="size-3" /> Zoom</Badge>
                  <span className="text-[11px] text-ink-3">45 minutes</span>
                </div>
                <h2 className="mt-4 text-xl font-semibold tracking-tight text-ink">Phoenix weekly program review</h2>
                <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-ink-3">
                  The brain will combine submitted topics, current project changes, open risks, and the last meeting&apos;s commitments into one agenda.
                </p>
                <div className="mt-5 flex flex-wrap gap-2">
                  <Button onClick={() => setContributeOpen(true)}>
                    <MessageCircleMore className="size-4" /> Add a topic or concern
                  </Button>
                  <Link
                    href="/ask?q=Prepare%20me%20for%20the%20Phoenix%20weekly%20program%20review"
                    className="inline-flex h-9.5 items-center gap-1.5 rounded-lg border border-line-strong bg-panel px-4 text-sm font-medium text-ink hover:bg-panel-2"
                  >
                    <Sparkles className="size-4 text-accent" /> Prepare me
                  </Link>
                </div>
              </div>
              <div className="rounded-xl border border-line bg-panel/75 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-3">In the room</p>
                <div className="mt-3 flex -space-x-2">
                  {attendees.map((attendee, index) => (
                    <span
                      key={attendee}
                      title={attendee}
                      className="flex size-9 items-center justify-center rounded-full border-2 border-panel bg-panel-2 text-[10px] font-semibold text-ink-2"
                      style={{ zIndex: attendees.length - index }}
                    >
                      {initials(attendee)}
                    </span>
                  ))}
                </div>
                <div className="mt-4 space-y-2 text-[11px] text-ink-3">
                  <p className="flex items-center gap-2"><MessageCircleMore className="size-3.5 text-accent" /> 4 topics already contributed</p>
                  <p className="flex items-center gap-2"><EyeOff className="size-3.5 text-good" /> 2 shared anonymously</p>
                  <p className="flex items-center gap-2"><Brain className="size-3.5 text-warn" /> 3 related risks found by the brain</p>
                </div>
              </div>
            </div>
          </section>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.45fr)_minmax(280px,0.75fr)]">
            <Card className="overflow-hidden">
              <div className="border-b border-line px-4 py-3.5">
                <h2 className="text-sm font-semibold text-ink">Draft agenda</h2>
                <p className="mt-0.5 text-[11px] text-ink-3">Built from people, work systems, and the last meeting</p>
              </div>
              <div className="divide-y divide-line">
                <AgendaItem number="01" title="Flight readiness review date" detail="Resolve the Sep 12 vs Oct 2 source conflict" source="Company brain" tone="warn" />
                <AgendaItem number="02" title="Supplier qualification status" detail="Procurement and engineering have linked blockers" source="3 team inputs" tone="accent" />
                <AgendaItem number="03" title="Capacity on the systems team" detail="Workload signal has increased for two consecutive weeks" source="Protected pulse" tone="good" />
                <AgendaItem number="04" title="Close last week’s actions" detail="Two commitments remain open" source="Meeting memory" tone="neutral" />
              </div>
              {topics && topics.items.length > 0 && (
                <div className="border-t border-line">
                  <p className="px-4 pt-3 text-[11px] font-semibold uppercase tracking-wider text-ink-3">
                    Contributed through Brain Interviews
                  </p>
                  <div className="divide-y divide-line">
                    {topics.items.map((topic) => (
                      <div key={topic.id} className="flex items-start gap-3 px-4 py-3">
                        <MessageCircleMore className="mt-0.5 size-3.5 shrink-0 text-accent" />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs leading-relaxed text-ink">{topic.summary}</p>
                          <p className="mt-0.5 text-[10.5px] text-ink-3">
                            {topic.author ?? "Shared without attribution"}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>

            <div className="space-y-4">
              <Card className="p-4">
                <p className="flex items-center gap-2 text-xs font-semibold text-ink"><Brain className="size-4 text-accent" /> Brain brief</p>
                <p className="mt-2 text-xs leading-relaxed text-ink-3">
                  The most useful outcome is a single owned date for flight readiness, plus a capacity decision for systems engineering.
                </p>
                <Link href="/ask?mode=meeting_prep&q=Build%20the%20full%20Phoenix%20meeting%20brief" className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline">
                  Open full brief <ArrowRight className="size-3" />
                </Link>
              </Card>
              <Card className="p-4">
                <p className="flex items-center gap-2 text-xs font-semibold text-ink"><LockKeyhole className="size-4 text-good" /> Safe participation</p>
                <p className="mt-2 text-xs leading-relaxed text-ink-3">
                  People can contribute by name or anonymously. Anonymous topics are stored without an identity and are presented without attribution.
                </p>
              </Card>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {isLoading && <><CardSkeleton /><CardSkeleton /></>}
          {data?.items.map((meeting) => {
            const extraction = meeting.extraction;
            return (
              <Card key={meeting.id} className="p-4 md:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <button onClick={() => setOpenMeeting(meeting)} className="min-w-0 text-left">
                    <p className="text-sm font-semibold text-ink hover:text-accent">{meeting.title}</p>
                    <p className="mt-1 flex items-center gap-1.5 text-[11px] text-ink-3">
                      <CalendarDays className="size-3" /> {formatDate(meeting.held_at)} · {meeting.attendees.length} attendees · via {meeting.source}
                    </p>
                  </button>
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/meetings/${meeting.id}/review`}
                      className="text-xs font-medium text-accent hover:underline"
                    >
                      Review knowledge
                    </Link>
                    <Button variant="secondary" size="sm" onClick={() => setReflectionOpen(meeting)}>
                      <Mic2 className="size-3.5" /> Share reflection
                    </Button>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <ExtractStat icon={<Landmark className="size-3.5" />} label="Decisions" value={extraction.decisions?.length ?? 0} />
                  <ExtractStat icon={<ListChecks className="size-3.5" />} label="Actions" value={extraction.action_items?.length ?? 0} />
                  <ExtractStat icon={<TriangleAlert className="size-3.5" />} label="Risks" value={extraction.risks?.length ?? 0} warn />
                  <ExtractStat icon={<CircleHelp className="size-3.5" />} label="Questions" value={extraction.open_questions?.length ?? 0} />
                </div>
              </Card>
            );
          })}
          {data && !data.items.length && <EmptyState title="No meeting memory yet" body="Connect Zoom or Teams to automatically capture decisions and follow-through." />}
        </div>
      )}

      <Dialog open={contributeOpen} onClose={() => setContributeOpen(false)} title="Add a topic or concern">
        <div className="space-y-3">
          <p className="text-xs leading-relaxed text-ink-3">
            The brain interviews you briefly so your topic arrives with the context the room needs.
            You review everything before it reaches the agenda. Anonymous is available in text.
          </p>
          <div className="grid gap-2">
            <LaunchOption
              href={`/interviews/new?purpose=meeting_prep&mode=quick_text${latest ? `&meeting=${latest.id}` : ""}`}
              icon={<MessageCircleMore className="size-4" />}
              title="Quick text"
              blurb="One thought, up to three follow-up questions. Named, confidential, or anonymous."
            />
            <LaunchOption
              href={`/interviews/new?purpose=meeting_prep&mode=text${latest ? `&meeting=${latest.id}` : ""}`}
              icon={<Brain className="size-4" />}
              title="Text interview"
              blurb="A short conversation for a complex topic — the brain helps you explain it."
            />
            <LaunchOption
              href={`/interviews/new?purpose=meeting_prep&mode=voice${latest ? `&meeting=${latest.id}` : ""}`}
              icon={<Mic2 className="size-4" />}
              title="Voice interview (named)"
              blurb="Speak it instead. Requires consent; voice can't be anonymous."
            />
          </div>
        </div>
      </Dialog>

      <Dialog open={!!reflectionOpen} onClose={() => setReflectionOpen(null)} title={`Reflect on ${reflectionOpen?.title ?? "the meeting"}`}>
        {reflectionOpen && (
          <div className="space-y-3">
            <p className="text-xs leading-relaxed text-ink-3">
              What landed well? What was left unsaid? The brain asks a few questions and you review
              what it understood before anything is shared. Reflections join the protected outcome
              memory — anonymous text is available.
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

      {canImport && (
        <ImportTranscriptDialog
          open={importOpen}
          onClose={() => setImportOpen(false)}
          classifications={classifications?.items ?? []}
          onImported={handleImported}
          importFn={(form) => apiUpload<MeetingImportResponse>("/meetings/import", form)}
        />
      )}
    </div>
  );
}

function AgendaItem({ number, title, detail, source, tone }: { number: string; title: string; detail: string; source: string; tone: "warn" | "accent" | "good" | "neutral" }) {
  return (
    <div className="flex gap-3 px-4 py-3.5">
      <span className="pt-0.5 font-mono text-[10px] text-ink-3">{number}</span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-ink">{title}</p>
        <p className="mt-0.5 text-[11px] text-ink-3">{detail}</p>
      </div>
      <Badge tone={tone}>{source}</Badge>
    </div>
  );
}

function ExtractStat({ icon, label, value, warn }: { icon: React.ReactNode; label: string; value: number; warn?: boolean }) {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-panel-2 px-3 py-2">
      <span className={warn && value ? "text-warn" : "text-ink-3"}>{icon}</span>
      <div>
        <p className="text-sm font-semibold tabular-nums text-ink">{value}</p>
        <p className="text-[10px] text-ink-3">{label}</p>
      </div>
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

function initials(name: string): string {
  return name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}
