"use client";

import { formatDate, sourceKindLabels, timeAgo } from "@/lib/utils";
import type { AnswerSegment, CitationInfo, SegmentType } from "@brainchain/shared";
import {
  AlertTriangle,
  BookOpenCheck,
  CircleHelp,
  GitCompareArrows,
  Lightbulb,
  UserRound,
  Wand2,
} from "lucide-react";
import * as React from "react";
import { Badge, Card, ClassificationBadge } from "./ui";

export const SEGMENT_META: Record<
  SegmentType,
  { label: string; icon: React.ReactNode; className: string }
> = {
  verified: {
    label: "Verified company information",
    icon: <BookOpenCheck className="size-3.5" />,
    className: "border-good/30 text-good",
  },
  inference: {
    label: "Model inference",
    icon: <Wand2 className="size-3.5" />,
    className: "border-accent/40 text-accent",
  },
  user_provided: {
    label: "User-provided information",
    icon: <UserRound className="size-3.5" />,
    className: "border-line-strong text-ink-2",
  },
  suggested_action: {
    label: "Suggested action",
    icon: <Lightbulb className="size-3.5" />,
    className: "border-warn/40 text-warn",
  },
  missing: {
    label: "Missing information",
    icon: <CircleHelp className="size-3.5" />,
    className: "border-line-strong text-ink-3",
  },
  conflict: {
    label: "Conflicting sources",
    icon: <GitCompareArrows className="size-3.5" />,
    className: "border-serious/50 text-serious",
  },
};

export function SegmentLegend({ segments }: { segments: AnswerSegment[] }) {
  const present = Array.from(new Set(segments.map((s) => s.type)));
  if (!present.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {present.map((type) => {
        const meta = SEGMENT_META[type];
        if (!meta) return null;
        return (
          <span
            key={type}
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] font-medium ${meta.className}`}
          >
            {meta.icon}
            {meta.label}
          </span>
        );
      })}
    </div>
  );
}

export function CitationCard({
  citation,
  highlighted,
  onHover,
}: {
  citation: CitationInfo;
  highlighted?: boolean;
  onHover?: (ord: number | null) => void;
}) {
  return (
    <Card
      className={`p-3 transition-colors ${highlighted ? "border-accent bg-accent-soft/40" : ""}`}
      onMouseEnter={() => onHover?.(citation.ord)}
      onMouseLeave={() => onHover?.(null)}
    >
      <div className="flex items-start gap-2">
        <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded bg-accent-soft text-[11px] font-semibold text-accent">
          {citation.ord}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium leading-snug text-ink">{citation.title}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Badge tone="neutral">{sourceKindLabels[citation.source_system] ?? citation.source_system}</Badge>
            <ClassificationBadge classification={citation.classification} />
            {citation.origin === "interview" && (
              <Badge tone="good">
                {citation.contributed === "named"
                  ? "Employee contribution"
                  : "Employee contribution · unattributed"}
              </Badge>
            )}
          </div>
          <p className="mt-1.5 line-clamp-3 border-l-2 border-line pl-2 text-[11px] italic leading-relaxed text-ink-3">
            “{citation.excerpt.slice(0, 220)}
            {citation.excerpt.length > 220 ? "…" : ""}”
          </p>
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[10.5px] text-ink-3">
            <span>{formatDate(citation.date)}</span>
            {citation.owner && <span>{citation.owner.name}</span>}
            {citation.department && <span>{citation.department}</span>}
            <span>synced {timeAgo(citation.last_synced_at)}</span>
            <span className="tabular-nums">relevance {(citation.relevance * 100).toFixed(0)}%</span>
          </div>
        </div>
      </div>
    </Card>
  );
}

export function EvidencePanel({
  citations,
  highlightedOrd,
  onHover,
  onOpenDocument,
}: {
  citations: CitationInfo[];
  highlightedOrd?: number | null;
  onHover?: (ord: number | null) => void;
  onOpenDocument?: (id: string) => void;
}) {
  if (!citations.length) {
    return (
      <div className="rounded-xl border border-dashed border-line-strong p-5 text-center text-xs text-ink-3">
        <AlertTriangle className="mx-auto mb-2 size-4" />
        No sources were used for this answer. Treat it as unverified.
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {citations.map((c) => (
        <div key={c.ord} onClick={() => onOpenDocument?.(c.document_id)} className="cursor-pointer">
          <CitationCard citation={c} highlighted={highlightedOrd === c.ord} onHover={onHover} />
        </div>
      ))}
    </div>
  );
}
