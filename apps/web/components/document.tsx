"use client";

import { api } from "@/lib/api";
import { docTypeLabels, formatDate, sourceKindLabels, timeAgo } from "@/lib/utils";
import type { DocumentDetail, DocumentSummary } from "@brainchain/shared";
import { useQuery } from "@tanstack/react-query";
import { FileText, GitBranch, History, KeyRound, Link2 } from "lucide-react";
import * as React from "react";
import {
  Badge,
  Card,
  ClassificationBadge,
  Dialog,
  FreshnessDot,
  Skeleton,
} from "./ui";

export function DocumentCard({
  doc,
  onOpen,
}: {
  doc: DocumentSummary;
  onOpen?: (id: string) => void;
}) {
  return (
    <Card
      className="cursor-pointer p-3.5 transition-colors hover:border-line-strong"
      onClick={() => onOpen?.(doc.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onOpen?.(doc.id)}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium leading-snug text-ink">{doc.title}</p>
        <ClassificationBadge classification={doc.classification} />
      </div>
      <p className="mt-1 line-clamp-2 text-xs text-ink-3">{doc.summary}</p>
      <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[11px] text-ink-3">
        <Badge tone="neutral">{docTypeLabels[doc.doc_type] ?? doc.doc_type}</Badge>
        {doc.source && <span>{sourceKindLabels[doc.source.kind] ?? doc.source.kind}</span>}
        {doc.department && <span>· {doc.department}</span>}
        {doc.project && <Badge tone="accent">{doc.project}</Badge>}
        <span className="ml-auto">
          <FreshnessDot freshness={doc.freshness} />
        </span>
      </div>
    </Card>
  );
}

export function DocumentDrawer({
  docId,
  onClose,
}: {
  docId: string | null;
  onClose: () => void;
}) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["document", docId],
    queryFn: () => api<DocumentDetail>(`/documents/${docId}`),
    enabled: !!docId,
  });
  const [tab, setTab] = React.useState<"content" | "versions" | "access">("content");

  React.useEffect(() => setTab("content"), [docId]);

  return (
    <Dialog open={!!docId} onClose={onClose} title={data?.title ?? "Document"} wide>
      {isLoading && (
        <div className="space-y-3">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      )}
      {!!error && (
        <p className="text-sm text-crit">
          This document could not be loaded. It may not exist or you may not have access.
        </p>
      )}
      {data && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <ClassificationBadge classification={data.classification} />
            <Badge tone="neutral">{docTypeLabels[data.doc_type] ?? data.doc_type}</Badge>
            {data.project && <Badge tone="accent">{data.project}</Badge>}
            <FreshnessDot freshness={data.freshness} />
            <span className="text-[11px] text-ink-3">
              v{data.version} · synced {timeAgo(data.last_synced_at)}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 rounded-lg bg-panel-2 p-3 text-xs md:grid-cols-3">
            <Meta label="Owner" value={data.owner?.name ?? "—"} />
            <Meta label="Department" value={data.department ?? "—"} />
            <Meta label="Source" value={data.lineage.data_source} />
            <Meta label="Created" value={formatDate(data.source_created_at)} />
            <Meta label="Updated" value={formatDate(data.source_updated_at)} />
            <Meta label="Retention" value={data.lineage.retention} />
            {typeof data.meta.end_date === "string" && (
              <Meta label="Contract end" value={formatDate(data.meta.end_date)} />
            )}
            {typeof data.meta.value === "string" && (
              <Meta label="Value" value={data.meta.value} />
            )}
            {typeof data.meta.counterparty === "string" && (
              <Meta label="Counterparty" value={data.meta.counterparty} />
            )}
          </div>

          <div className="flex gap-1 border-b border-line text-xs">
            {(
              [
                ["content", "Content", <FileText key="i" className="size-3.5" />],
                ["versions", `Versions (${data.versions.length})`, <History key="i" className="size-3.5" />],
                ["access", "Access & lineage", <KeyRound key="i" className="size-3.5" />],
              ] as const
            ).map(([key, label, icon]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`flex items-center gap-1.5 border-b-2 px-3 py-2 font-medium ${
                  tab === key
                    ? "border-accent text-accent"
                    : "border-transparent text-ink-3 hover:text-ink"
                }`}
              >
                {icon}
                {label}
              </button>
            ))}
          </div>

          {tab === "content" && (
            <div className="space-y-3">
              {data.chunks.map((chunk) => (
                <p key={chunk.id} className="whitespace-pre-wrap text-[13px] leading-relaxed text-ink-2">
                  {chunk.text}
                </p>
              ))}
            </div>
          )}
          {tab === "versions" && (
            <ul className="space-y-2">
              {data.versions
                .slice()
                .reverse()
                .map((v) => (
                  <li key={v.version} className="rounded-lg border border-line p-3">
                    <div className="flex items-center gap-2 text-xs">
                      <Badge tone="accent">v{v.version}</Badge>
                      <span className="text-ink-2">{v.note}</span>
                      <span className="ml-auto text-ink-3">{formatDate(v.created_at)}</span>
                    </div>
                  </li>
                ))}
            </ul>
          )}
          {tab === "access" && (
            <div className="space-y-3">
              <div>
                <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-ink">
                  <KeyRound className="size-3.5 text-good" /> Why you can see this
                </p>
                <ul className="space-y-1.5">
                  {data.access_reasons.map((reason, i) => (
                    <li
                      key={i}
                      className="rounded-lg border border-good/25 bg-good/5 px-3 py-2 text-xs text-ink-2"
                    >
                      {reason.detail}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-ink">
                  <GitBranch className="size-3.5 text-ink-3" /> Data lineage
                </p>
                <p className="rounded-lg bg-panel-2 px-3 py-2 font-mono text-[11px] text-ink-2">
                  {data.lineage.ingest_path}
                </p>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-ink-3">
                <Link2 className="size-3.5" />
                Original source: {data.lineage.data_source}
                {data.source ? ` (${sourceKindLabels[data.source.kind] ?? data.source.kind})` : ""}
              </div>
            </div>
          )}
        </div>
      )}
    </Dialog>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-ink-3">{label}: </span>
      <span className="font-medium text-ink-2">{value}</span>
    </div>
  );
}
