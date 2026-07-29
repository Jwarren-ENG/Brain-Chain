"use client";

import { DocumentDrawer } from "@/components/document";
import {
  Badge,
  Card,
  CardHeader,
  CardSkeleton,
  ClassificationBadge,
  EmptyState,
  Select,
  Stat,
  Table,
  Td,
  Th,
} from "@/components/ui";
import { api } from "@/lib/api";
import { docTypeLabels, formatDate, formatMoney } from "@/lib/utils";
import type { DocumentSummary } from "@brainchain/shared";
import { useQuery } from "@tanstack/react-query";
import { Building2, FileText, Landmark, TriangleAlert } from "lucide-react";
import * as React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";

const COMPANY_TYPES = [
  "contract",
  "ticket",
  "plan",
  "policy",
  "financial",
  "risk_register",
  "roadmap",
  "procedure",
  "supplier",
  "spend",
];

export default function CompanyContent() {
  const [docType, setDocType] = React.useState("");
  const [project, setProject] = React.useState("");
  const [openDoc, setOpenDoc] = React.useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["company-docs"],
    queryFn: () => api<{ total: number; items: DocumentSummary[] }>("/documents", { params: { limit: 100 } }),
  });

  const docs = React.useMemo(
    () => (data?.items ?? []).filter((d) => COMPANY_TYPES.includes(d.doc_type)),
    [data],
  );
  const filtered = docs.filter(
    (d) =>
      (!docType || d.doc_type === docType) &&
      (!project || (d.project ?? "") === project),
  );

  const contracts = docs.filter((d) => d.doc_type === "contract");
  const spends = docs.filter((d) => d.doc_type === "spend");
  const risks = docs.filter((d) => d.doc_type === "risk_register");
  const totalSpend = spends.reduce((acc, d) => acc + Number(d.meta.amount ?? 0), 0);

  const spendBySupplier = React.useMemo(() => {
    const map = new Map<string, number>();
    for (const s of spends) {
      const supplier = String(s.meta.supplier ?? "Unknown");
      map.set(supplier, (map.get(supplier) ?? 0) + Number(s.meta.amount ?? 0));
    }
    return [...map.entries()]
      .map(([supplier, amount]) => ({ supplier, amount }))
      .sort((a, b) => b.amount - a.amount);
  }, [spends]);

  const projects = [...new Set(docs.map((d) => d.project).filter(Boolean))] as string[];

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-lg font-semibold text-ink">
          <Building2 className="size-5 text-accent" /> Company Information
        </h1>
        <p className="text-xs text-ink-3">
          Contracts, projects, procurement, spend, plans, policies and risks — each record keeps its
          owner, classification, permissions and lineage.
        </p>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <CardSkeleton key={i} rows={1} />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-4">
          <Stat label="Authorized records" value={docs.length} sub="visible to you" />
          <Stat label="Contracts" value={contracts.length} sub="with dates & obligations" />
          <Stat label="Tracked spend" value={formatMoney(totalSpend)} sub="across suppliers" />
          <Stat label="Risk registers" value={risks.length} tone={risks.length ? "warn" : undefined} />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            icon={<Landmark className="size-4" />}
            title="Contract obligations & deadlines"
            sub="From extracted contract metadata"
          />
          <div className="divide-y divide-line">
            {contracts.map((c) => (
              <button
                key={c.id}
                onClick={() => setOpenDoc(c.id)}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-panel-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-ink">{c.title}</p>
                  <p className="text-[11px] text-ink-3">
                    {String(c.meta.counterparty ?? "—")} · {String(c.meta.value ?? "")}
                  </p>
                </div>
                {typeof c.meta.end_date === "string" && (
                  <Badge tone={daysUntil(c.meta.end_date) < 60 ? "crit" : "neutral"}>
                    ends {formatDate(c.meta.end_date)}
                  </Badge>
                )}
                <ClassificationBadge classification={c.classification} />
              </button>
            ))}
            {!contracts.length && <EmptyState title="No contracts visible to you" />}
          </div>
        </Card>

        <Card>
          <CardHeader
            icon={<TriangleAlert className="size-4" />}
            title="Spend by supplier"
            sub={`${formatMoney(totalSpend)} tracked · concentration is a resilience signal`}
          />
          <div className="h-56 px-3 py-3">
            {spendBySupplier.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={spendBySupplier} layout="vertical" margin={{ left: 8, right: 48, top: 4, bottom: 4 }}>
                  <CartesianGrid horizontal={false} stroke="var(--grid-line)" />
                  <XAxis type="number" hide />
                  <YAxis
                    type="category"
                    dataKey="supplier"
                    width={128}
                    tick={{ fill: "var(--ink-2)", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Bar dataKey="amount" fill="var(--series-1)" radius={[0, 4, 4, 0]} barSize={16}>
                    <LabelList
                      dataKey="amount"
                      position="right"
                      formatter={(v: number | string) => formatMoney(Number(v))}
                      style={{ fill: "var(--ink-2)", fontSize: 11 }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState title="No spend records visible to you" />
            )}
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader
          icon={<FileText className="size-4" />}
          title={`Records (${filtered.length})`}
          action={
            <div className="flex gap-2">
              <Select value={docType} onChange={(e) => setDocType(e.target.value)} aria-label="Type filter">
                <option value="">All types</option>
                {COMPANY_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {docTypeLabels[t] ?? t}
                  </option>
                ))}
              </Select>
              <Select value={project} onChange={(e) => setProject(e.target.value)} aria-label="Project filter">
                <option value="">All projects</option>
                {projects.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </Select>
            </div>
          }
        />
        <div className="p-3">
          <Table>
            <thead>
              <tr>
                <Th>Title</Th>
                <Th>Type</Th>
                <Th>Department</Th>
                <Th>Owner</Th>
                <Th>Classification</Th>
                <Th>Updated</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((d) => (
                <tr
                  key={d.id}
                  onClick={() => setOpenDoc(d.id)}
                  className="cursor-pointer hover:bg-panel-2"
                >
                  <Td className="font-medium text-ink">{d.title}</Td>
                  <Td>{docTypeLabels[d.doc_type] ?? d.doc_type}</Td>
                  <Td>{d.department ?? "—"}</Td>
                  <Td>{d.owner?.name ?? "—"}</Td>
                  <Td>
                    <ClassificationBadge classification={d.classification} />
                  </Td>
                  <Td>{formatDate(d.source_updated_at)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
          {!filtered.length && !isLoading && (
            <EmptyState title="No records match these filters" />
          )}
        </div>
      </Card>

      <DocumentDrawer docId={openDoc} onClose={() => setOpenDoc(null)} />
    </div>
  );
}

function daysUntil(date: string): number {
  return Math.round((new Date(date).getTime() - Date.now()) / 86_400_000);
}
