"use client";

import {
  Badge,
  Card,
  CardHeader,
  CardSkeleton,
  Table,
  Tabs,
  Td,
  Th,
} from "@/components/ui";
import { api } from "@/lib/api";
import { sourceKindLabels } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { Database, ShieldCheck, Timer } from "lucide-react";
import * as React from "react";

export default function GovernancePage() {
  const [tab, setTab] = React.useState("sources");

  const { data: sources, isLoading } = useQuery({
    queryKey: ["gov-sources"],
    queryFn: () =>
      api<{ items: { id: string; name: string; kind: string; description: string; owner: { name: string } | null; department: string | null; classification: string | null; retention: string | null }[] }>(
        "/governance/sources",
      ),
  });
  const { data: classifications } = useQuery({
    queryKey: ["gov-classifications"],
    queryFn: () =>
      api<{ items: { id: string; name: string; level: number; description: string; color: string }[] }>(
        "/governance/classifications",
      ),
  });
  const { data: retention } = useQuery({
    queryKey: ["gov-retention"],
    queryFn: () =>
      api<{ items: { id: string; name: string; duration_days: number; description: string }[] }>(
        "/governance/retention",
      ),
  });

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-semibold text-ink">
            <ShieldCheck className="size-5 text-accent" /> Data Governance
          </h1>
          <p className="text-xs text-ink-3">
            Sources, classifications and retention — the metadata that travels with every record.
          </p>
        </div>
        <Tabs
          tabs={[
            { key: "sources", label: "Data sources" },
            { key: "classifications", label: "Classifications" },
            { key: "retention", label: "Retention policies" },
          ]}
          value={tab}
          onChange={setTab}
        />
      </div>

      {tab === "sources" && (
        <Card>
          <CardHeader
            icon={<Database className="size-4" />}
            title="Registered data sources"
            sub="Each source carries an owner, department, classification and retention policy"
          />
          <div className="p-3">
            {isLoading ? (
              <CardSkeleton rows={5} />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Source</Th>
                    <Th>System</Th>
                    <Th>Owner</Th>
                    <Th>Department</Th>
                    <Th>Classification</Th>
                    <Th>Retention</Th>
                  </tr>
                </thead>
                <tbody>
                  {sources?.items.map((s) => (
                    <tr key={s.id} className="hover:bg-panel-2">
                      <Td className="font-medium text-ink">{s.name}</Td>
                      <Td>{sourceKindLabels[s.kind] ?? s.kind}</Td>
                      <Td>{s.owner?.name ?? "—"}</Td>
                      <Td>{s.department ?? "—"}</Td>
                      <Td>
                        <Badge tone={s.classification === "Confidential" ? "warn" : "neutral"}>
                          {s.classification ?? "—"}
                        </Badge>
                      </Td>
                      <Td>{s.retention ?? "—"}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </div>
        </Card>
      )}

      {tab === "classifications" && (
        <div className="grid gap-3 md:grid-cols-2">
          {classifications?.items.map((c) => (
            <Card key={c.id} className="p-4">
              <div className="flex items-center gap-2">
                <Badge tone={c.level >= 3 ? "crit" : c.level === 2 ? "warn" : c.level === 1 ? "accent" : "good"}>
                  Level {c.level}
                </Badge>
                <p className="text-sm font-semibold text-ink">{c.name}</p>
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-ink-3">{c.description}</p>
              <p className="mt-2 text-[11px] text-ink-3">
                Users need clearance ≥ {c.level} <em>and</em> an explicit grant to read documents at
                this level. Model policies can also cap which providers may see it.
              </p>
            </Card>
          ))}
        </div>
      )}

      {tab === "retention" && (
        <div className="grid gap-3 md:grid-cols-2">
          {retention?.items.map((r) => (
            <Card key={r.id} className="p-4">
              <div className="flex items-center gap-2">
                <Timer className="size-4 text-ink-3" />
                <p className="text-sm font-semibold text-ink">{r.name}</p>
                <Badge tone="neutral" className="ml-auto">
                  {r.duration_days === 0 ? "indefinite" : `${Math.round(r.duration_days / 365)} yr`}
                </Badge>
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-ink-3">{r.description}</p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
