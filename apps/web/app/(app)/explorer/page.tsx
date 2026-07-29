"use client";

import { DocumentDrawer } from "@/components/document";
import {
  Badge,
  Card,
  CardSkeleton,
  EmptyState,
  Input,
  Select,
  Tabs,
} from "@/components/ui";
import { api } from "@/lib/api";
import { docTypeLabels, formatDate, sourceKindLabels } from "@/lib/utils";
import type { SearchResult } from "@brainchain/shared";
import { useQuery } from "@tanstack/react-query";
import {
  Background,
  Controls,
  ReactFlow,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { FileSearch, KeyRound, Search } from "lucide-react";
import { useSearchParams } from "next/navigation";
import * as React from "react";
import { ClassificationBadge, Spinner } from "@/components/ui";

interface Filters {
  doc_types: string[];
  projects: string[];
  departments: { id: string; name: string }[];
  sources: { id: string; name: string; kind: string }[];
  classifications: { level: number; name: string }[];
}

function ExplorerInner() {
  const params = useSearchParams();
  const [query, setQuery] = React.useState("Phoenix risks");
  const [submitted, setSubmitted] = React.useState("Phoenix risks");
  const [mode, setMode] = React.useState<"hybrid" | "keyword" | "semantic">("hybrid");
  const [docType, setDocType] = React.useState("");
  const [department, setDepartment] = React.useState("");
  const [source, setSource] = React.useState("");
  const [project, setProject] = React.useState("");
  const [tab, setTab] = React.useState("results");
  const [openDoc, setOpenDoc] = React.useState<string | null>(null);
  const [whyOpen, setWhyOpen] = React.useState<string | null>(null);

  React.useEffect(() => {
    const doc = params.get("doc");
    if (doc) setOpenDoc(doc);
  }, [params]);

  const { data: filters } = useQuery({
    queryKey: ["filters"],
    queryFn: () => api<Filters>("/filters"),
  });

  const { data, isLoading } = useQuery({
    queryKey: ["explorer", submitted, mode, docType, department, source, project],
    queryFn: () =>
      api<{ results: SearchResult[] }>("/search", {
        params: {
          q: submitted,
          mode,
          doc_type: docType,
          department_id: department,
          data_source_id: source,
          project,
          limit: 20,
        },
      }),
    enabled: submitted.trim().length > 1,
  });

  const results = data?.results ?? [];

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-ink">Knowledge Explorer</h1>
        <p className="text-xs text-ink-3">
          Search everything you are authorized to see — and see exactly why you can see it.
        </p>
      </div>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setSubmitted(query);
        }}
      >
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search contracts, tickets, transcripts, policies…"
            className="pl-9"
            aria-label="Search knowledge"
          />
        </div>
        <Select value={mode} onChange={(e) => setMode(e.target.value as typeof mode)} aria-label="Search mode">
          <option value="hybrid">Hybrid</option>
          <option value="keyword">Keyword</option>
          <option value="semantic">Semantic</option>
        </Select>
        <button
          type="submit"
          className="h-9.5 rounded-lg bg-accent px-4 text-sm font-medium text-accent-ink hover:opacity-90"
        >
          Search
        </button>
      </form>

      <div className="flex flex-wrap gap-2">
        <Select value={docType} onChange={(e) => setDocType(e.target.value)} aria-label="Document type filter">
          <option value="">All types</option>
          {filters?.doc_types.map((t) => (
            <option key={t} value={t}>
              {docTypeLabels[t] ?? t}
            </option>
          ))}
        </Select>
        <Select value={department} onChange={(e) => setDepartment(e.target.value)} aria-label="Department filter">
          <option value="">All departments</option>
          {filters?.departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </Select>
        <Select value={source} onChange={(e) => setSource(e.target.value)} aria-label="Source filter">
          <option value="">All sources</option>
          {filters?.sources.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
        <Select value={project} onChange={(e) => setProject(e.target.value)} aria-label="Project filter">
          <option value="">All projects</option>
          {filters?.projects.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </Select>
        <div className="ml-auto">
          <Tabs
            tabs={[
              { key: "results", label: "Results" },
              { key: "graph", label: "Relationship graph" },
              { key: "timeline", label: "Timeline" },
            ]}
            value={tab}
            onChange={setTab}
          />
        </div>
      </div>

      {tab === "results" && (
        <div className="space-y-2.5">
          {isLoading && (
            <>
              <CardSkeleton rows={2} />
              <CardSkeleton rows={2} />
              <CardSkeleton rows={2} />
            </>
          )}
          {!isLoading && !results.length && (
            <EmptyState
              icon={<FileSearch className="size-6" />}
              title="No authorized results"
              body="Nothing you can access matches this query. Content may exist in sources not shared with you — ask your data steward."
            />
          )}
          {results.map((r) => (
            <Card key={r.document.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <button
                  onClick={() => setOpenDoc(r.document.id)}
                  className="text-left text-sm font-medium text-ink hover:text-accent"
                >
                  {r.document.title}
                </button>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-[11px] tabular-nums text-ink-3">
                    {(r.score * 100).toFixed(0)}% match
                  </span>
                  <ClassificationBadge classification={r.document.classification} />
                </div>
              </div>
              <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-ink-3">{r.excerpt}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-ink-3">
                <Badge tone="neutral">{docTypeLabels[r.document.doc_type] ?? r.document.doc_type}</Badge>
                {r.document.source && (
                  <span>{sourceKindLabels[r.document.source.kind] ?? r.document.source.kind}</span>
                )}
                {r.document.department && <span>· {r.document.department}</span>}
                {r.document.project && <Badge tone="accent">{r.document.project}</Badge>}
                <span>· {formatDate(r.document.source_updated_at)}</span>
                <button
                  onClick={() => setWhyOpen(whyOpen === r.document.id ? null : r.document.id)}
                  className="ml-auto inline-flex items-center gap-1 font-medium text-good hover:underline"
                >
                  <KeyRound className="size-3" /> Why can I see this?
                </button>
              </div>
              {whyOpen === r.document.id && (
                <ul className="mt-2 space-y-1">
                  {r.access_reasons.map((reason, i) => (
                    <li
                      key={i}
                      className="rounded-md border border-good/25 bg-good/5 px-2.5 py-1.5 text-[11px] text-ink-2"
                    >
                      {reason.detail}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ))}
        </div>
      )}

      {tab === "graph" && <RelationshipGraph />}

      {tab === "timeline" && (
        <div className="space-y-0">
          {[...results]
            .sort(
              (a, b) =>
                new Date(b.document.source_updated_at ?? 0).getTime() -
                new Date(a.document.source_updated_at ?? 0).getTime(),
            )
            .map((r) => (
              <div key={r.document.id} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span className="mt-1.5 size-2 rounded-full bg-accent" />
                  <span className="w-px flex-1 bg-line" />
                </div>
                <div className="pb-5">
                  <p className="text-[11px] text-ink-3">{formatDate(r.document.source_updated_at)}</p>
                  <button
                    onClick={() => setOpenDoc(r.document.id)}
                    className="text-left text-sm font-medium text-ink hover:text-accent"
                  >
                    {r.document.title}
                  </button>
                  <p className="text-[11px] text-ink-3">
                    {docTypeLabels[r.document.doc_type] ?? r.document.doc_type}
                    {r.document.department ? ` · ${r.document.department}` : ""}
                  </p>
                </div>
              </div>
            ))}
          {!results.length && <EmptyState title="No results to place on the timeline" />}
        </div>
      )}

      <DocumentDrawer docId={openDoc} onClose={() => setOpenDoc(null)} />
    </div>
  );
}

function RelationshipGraph() {
  const [kind, setKind] = React.useState("project");
  const [entityId, setEntityId] = React.useState<string>("");

  const { data: entities } = useQuery({
    queryKey: ["entities", kind],
    queryFn: () => api<{ items: { id: string; kind: string; name: string }[] }>("/entities", { params: { kind } }),
  });

  React.useEffect(() => {
    if (entities?.items.length && !entities.items.some((e) => e.id === entityId)) {
      setEntityId(entities.items[0].id);
    }
  }, [entities, entityId]);

  const { data: graph } = useQuery({
    queryKey: ["entity-graph", entityId],
    queryFn: () =>
      api<{ root: string; nodes: { id: string; kind: string; name: string }[]; edges: { id: string; from: string; to: string; rel: string }[] }>(
        `/entities/${entityId}/graph`,
      ),
    enabled: !!entityId,
  });

  const { nodes, edges } = React.useMemo(() => {
    if (!graph) return { nodes: [] as Node[], edges: [] as Edge[] };
    const others = graph.nodes.filter((n) => n.id !== graph.root);
    const root = graph.nodes.find((n) => n.id === graph.root);
    const radius = 240;
    const nodes: Node[] = [
      ...(root
        ? [
            {
              id: root.id,
              position: { x: 0, y: 0 },
              data: { label: `${root.name}` },
              style: {
                background: "var(--accent)",
                color: "var(--accent-ink)",
                border: "none",
                borderRadius: 12,
                fontSize: 12,
                fontWeight: 600,
                padding: "10px 14px",
              },
            } satisfies Node,
          ]
        : []),
      ...others.map((n, i) => {
        const angle = (2 * Math.PI * i) / Math.max(others.length, 1);
        return {
          id: n.id,
          position: { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius * 0.7 },
          data: { label: `${n.name} (${n.kind})` },
          style: {
            background: "var(--panel)",
            color: "var(--ink)",
            border: "1px solid var(--border-strong)",
            borderRadius: 10,
            fontSize: 11,
            padding: "8px 10px",
          },
        } satisfies Node;
      }),
    ];
    const edges: Edge[] = graph.edges.map((e) => ({
      id: e.id,
      source: e.from,
      target: e.to,
      label: e.rel.replace(/_/g, " "),
      labelStyle: { fontSize: 9, fill: "var(--ink-3)" },
      labelBgStyle: { fill: "var(--panel)" },
      style: { strokeWidth: 1.2 },
    }));
    return { nodes, edges };
  }, [graph]);

  return (
    <Card className="p-3">
      <div className="mb-2 flex gap-2">
        <Select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Entity kind">
          {["project", "supplier", "contract", "person", "risk", "department", "meeting", "decision"].map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </Select>
        <Select value={entityId} onChange={(e) => setEntityId(e.target.value)} aria-label="Entity">
          {entities?.items.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </Select>
      </div>
      <div className="h-[52vh]">
        {graph ? (
          <ReactFlow nodes={nodes} edges={edges} fitView proOptions={{ hideAttribution: true }} nodesConnectable={false}>
            <Background gap={24} />
            <Controls showInteractive={false} />
          </ReactFlow>
        ) : (
          <div className="flex h-full items-center justify-center">
            <Spinner label="Loading graph…" />
          </div>
        )}
      </div>
    </Card>
  );
}

export default function ExplorerPage() {
  return (
    <React.Suspense fallback={<Spinner label="Loading…" />}>
      <ExplorerInner />
    </React.Suspense>
  );
}
