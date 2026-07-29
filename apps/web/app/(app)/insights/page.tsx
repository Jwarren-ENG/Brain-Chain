"use client";

import { DocumentDrawer } from "@/components/document";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  CardSkeleton,
  EmptyState,
  InfoNote,
  Select,
} from "@/components/ui";
import { api } from "@/lib/api";
import { cn, formatDate, formatDateTime } from "@/lib/utils";
import type { Brief, InsightCard } from "@brainchain/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CalendarClock,
  ChevronRight,
  FileBarChart2,
  LineChart,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import * as React from "react";

const KIND_LABELS: Record<string, string> = {
  change: "What changed",
  attention: "Requires attention",
  deadline: "Upcoming deadlines",
  project_risk: "Projects at risk",
  decision_pending: "Decisions pending",
  feedback_theme: "Employee themes",
  spend_signal: "Cost & spend signals",
  recommendation: "Recommended actions",
  data_quality: "Data quality & freshness",
  integration: "Integration health",
};

const KIND_ORDER = [
  "project_risk",
  "deadline",
  "attention",
  "spend_signal",
  "feedback_theme",
  "change",
  "integration",
  "data_quality",
];

export default function InsightsPage() {
  const [openDoc, setOpenDoc] = React.useState<string | null>(null);
  const [briefId, setBriefId] = React.useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: insights, isLoading } = useQuery({
    queryKey: ["insights"],
    queryFn: () => api<{ items: InsightCard[] }>("/insights"),
  });
  const { data: briefs } = useQuery({
    queryKey: ["briefs"],
    queryFn: () => api<{ items: { id: string; kind: string; title: string; created_at: string }[] }>("/briefs"),
  });
  const { data: brief } = useQuery({
    queryKey: ["brief", briefId],
    queryFn: () => api<Brief>(`/briefs/${briefId}`),
    enabled: !!briefId,
  });

  const generate = useMutation({
    mutationFn: (kind: string) => api<Brief>("/briefs", { method: "POST", body: { kind } }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["briefs"] });
      queryClient.invalidateQueries({ queryKey: ["insights"] });
      setBriefId(data.id);
    },
  });

  React.useEffect(() => {
    if (!briefId && briefs?.items.length) setBriefId(briefs.items[0].id);
  }, [briefs, briefId]);

  const grouped = React.useMemo(() => {
    const map = new Map<string, InsightCard[]>();
    for (const card of insights?.items ?? []) {
      map.set(card.kind, [...(map.get(card.kind) ?? []), card]);
    }
    return map;
  }, [insights]);

  const critical = (insights?.items ?? []).filter((c) => c.severity === "critical");

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-semibold text-ink">
            <LineChart className="size-5 text-accent" /> Executive Insights
          </h1>
          <p className="text-xs text-ink-3">
            Computed live from authorized company data. Every claim carries evidence you can open —
            if you lack permission for a source, it simply is not shown to you.
          </p>
        </div>
        <BriefBuilder onGenerate={(kind) => generate.mutate(kind)} pending={generate.isPending} />
      </div>

      {critical.length > 0 && (
        <Card className="border-crit/40 bg-crit/5 p-4">
          <p className="flex items-center gap-2 text-xs font-semibold text-crit">
            <AlertTriangle className="size-4" /> Recommended actions ({critical.length})
          </p>
          <ul className="mt-2 space-y-1.5">
            {critical.map((c, i) => (
              <li key={i} className="text-xs leading-relaxed text-ink-2">
                <span className="font-medium text-ink">{c.title}.</span> {c.body}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {isLoading && (
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {KIND_ORDER.filter((k) => grouped.has(k)).map((kind) => (
          <Card key={kind}>
            <CardHeader
              title={KIND_LABELS[kind] ?? kind}
              sub={`${grouped.get(kind)!.length} item(s)`}
            />
            <div className="divide-y divide-line">
              {grouped.get(kind)!.map((card, i) => (
                <InsightRow key={i} card={card} onOpenDoc={setOpenDoc} />
              ))}
            </div>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader
          icon={<FileBarChart2 className="size-4" />}
          title="Executive briefs"
          sub="Agent-generated, evidence-backed, on a schedule or on demand"
          action={
            <Select
              value={briefId ?? ""}
              onChange={(e) => setBriefId(e.target.value)}
              aria-label="Select brief"
            >
              {briefs?.items.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.title}
                </option>
              ))}
            </Select>
          }
        />
        {brief ? (
          <div className="space-y-4 p-5">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold text-ink">{brief.title}</h2>
              <Badge tone="accent">{brief.kind}</Badge>
              <span className="text-[11px] text-ink-3">
                {formatDate(brief.period_start)} → {formatDate(brief.period_end)} · generated{" "}
                {formatDateTime(brief.created_at)}
              </span>
              {brief.created_by_agent_run_id && (
                <Link
                  href={`/agents/runs/${brief.created_by_agent_run_id}`}
                  className="inline-flex items-center text-[11px] font-medium text-accent hover:underline"
                >
                  <Sparkles className="mr-0.5 size-3" /> by Executive Briefing Agent
                  <ChevronRight className="size-3" />
                </Link>
              )}
            </div>
            {brief.sections.map((section, i) => (
              <div key={i}>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-3">
                  {section.heading}
                </h3>
                <p className="mt-1 whitespace-pre-line text-xs leading-relaxed text-ink-2">
                  {section.body}
                </p>
                {section.evidence.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {section.evidence.map((doc) => (
                      <button
                        key={doc.id}
                        onClick={() => setOpenDoc(doc.id)}
                        className="rounded-full border border-line bg-panel px-2.5 py-0.5 text-[10.5px] text-ink-2 hover:border-accent hover:text-accent"
                      >
                        {doc.title.slice(0, 48)}
                        {doc.title.length > 48 ? "…" : ""}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
            <InfoNote tone="privacy">
              Employee feedback in this brief passed the anonymity cohort threshold and contains no
              individual voices. Evidence chips are filtered to your permissions — an executive
              title does not bypass document access.
            </InfoNote>
          </div>
        ) : (
          <div className="p-5">
            <EmptyState
              title="No brief yet"
              body="Generate a weekly brief to see an evidence-backed summary."
            />
          </div>
        )}
      </Card>

      <DocumentDrawer docId={openDoc} onClose={() => setOpenDoc(null)} />
    </div>
  );
}

function BriefBuilder({
  onGenerate,
  pending,
}: {
  onGenerate: (kind: string) => void;
  pending: boolean;
}) {
  const [kind, setKind] = React.useState("weekly");
  return (
    <div className="flex items-center gap-2">
      <Select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Brief kind">
        {[
          ["daily", "Daily brief"],
          ["weekly", "Weekly executive brief"],
          ["monthly", "Monthly operating review"],
          ["project", "Project review"],
          ["department", "Department review"],
          ["risk", "Risk review"],
        ].map(([k, label]) => (
          <option key={k} value={k}>
            {label}
          </option>
        ))}
      </Select>
      <Button onClick={() => onGenerate(kind)} disabled={pending}>
        <CalendarClock className="size-3.5" />
        {pending ? "Generating…" : "Generate brief"}
      </Button>
    </div>
  );
}

function InsightRow({
  card,
  onOpenDoc,
}: {
  card: InsightCard;
  onOpenDoc: (id: string) => void;
}) {
  return (
    <div className="px-4 py-3">
      <div className="flex items-start gap-2">
        <span
          className={cn(
            "mt-1 size-2 shrink-0 rounded-full",
            card.severity === "critical" && "bg-crit",
            card.severity === "warning" && "bg-warn",
            card.severity === "info" && "bg-ink-3",
          )}
          aria-label={`severity ${card.severity}`}
        />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium leading-snug text-ink">{card.title}</p>
          <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-3">{card.body}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Badge tone="neutral">confidence: {card.confidence}</Badge>
            {card.evidence.map((doc) => (
              <button
                key={doc.id}
                onClick={() => onOpenDoc(doc.id)}
                className="rounded-full border border-line px-2 py-0.5 text-[10px] text-ink-2 hover:border-accent hover:text-accent"
              >
                {doc.title.slice(0, 40)}
                {doc.title.length > 40 ? "…" : ""}
              </button>
            ))}
            {card.evidence_total > card.evidence.length && (
              <span className="text-[10px] text-ink-3">
                +{card.evidence_total - card.evidence.length} source(s) outside your permissions
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
