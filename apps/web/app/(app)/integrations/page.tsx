"use client";

import { useSession } from "@/components/providers";
import {
  Badge,
  Button,
  Card,
  CardSkeleton,
  ClassificationBadge,
  Dialog,
  StatusChip,
} from "@/components/ui";
import { api } from "@/lib/api";
import { formatDateTime, hasRole, sourceKindLabels, timeAgo } from "@/lib/utils";
import type { ConnectorInfo, SyncJobInfo } from "@brainchain/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Blocks, FolderSync, History, RefreshCw } from "lucide-react";
import * as React from "react";

export default function IntegrationsPage() {
  const { user } = useSession();
  const canSync = hasRole(user, "system_admin", "data_steward", "security_admin");
  const queryClient = useQueryClient();
  const [logsFor, setLogsFor] = React.useState<ConnectorInfo | null>(null);
  const [lastJob, setLastJob] = React.useState<SyncJobInfo | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["connectors"],
    queryFn: () => api<{ items: ConnectorInfo[] }>("/connectors"),
  });

  const sync = useMutation({
    mutationFn: (id: string) =>
      api<{ job: SyncJobInfo; connector: ConnectorInfo }>(`/connectors/${id}/sync`, {
        method: "POST",
      }),
    onSuccess: (resp) => {
      setLastJob(resp.job);
      queryClient.invalidateQueries({ queryKey: ["connectors"] });
      queryClient.invalidateQueries({ queryKey: ["meetings"] });
      queryClient.invalidateQueries({ queryKey: ["home"] });
    },
  });

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-lg font-semibold text-ink">
          <Blocks className="size-5 text-accent" /> Integrations
        </h1>
        <p className="text-xs text-ink-3">
          Enterprise connectors behind a real sync interface. These run as mocks in the MVP — the
          parsing, extraction, permission-mapping and audit path is the production path.
          {!canSync && " Manual sync requires a data steward or admin role."}
        </p>
      </div>

      {lastJob && (
        <Card className="border-good/40 p-4">
          <p className="flex items-center gap-2 text-xs font-semibold text-good">
            <FolderSync className="size-4" /> Sync finished: {lastJob.items_processed} ingested,{" "}
            {lastJob.items_skipped} skipped
          </p>
          <ul className="mt-2 space-y-1">
            {lastJob.log.map((line, i) => (
              <li
                key={i}
                className={`font-mono text-[10.5px] leading-relaxed ${
                  line.level === "warning" ? "text-warn" : line.level === "error" ? "text-crit" : "text-ink-3"
                }`}
              >
                {line.msg}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {isLoading && Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} rows={3} />)}
        {data?.items.map((c) => (
          <Card key={c.id} className="flex flex-col p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <span className="flex size-9 items-center justify-center rounded-lg bg-panel-2 text-xs font-bold uppercase text-ink-2">
                  {(sourceKindLabels[c.provider] ?? c.provider).slice(0, 2)}
                </span>
                <div>
                  <p className="text-sm font-semibold text-ink">{c.display_name}</p>
                  <p className="text-[11px] text-ink-3">
                    {sourceKindLabels[c.provider] ?? c.provider}
                    {c.is_mock && " · mock connector"}
                  </p>
                </div>
              </div>
              <StatusChip status={c.status === "connected" ? c.health : c.status} />
            </div>

            <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
              <Row k="Last sync" v={timeAgo(c.last_sync_at)} />
              <Row k="Frequency" v={c.sync_frequency} />
              <Row k="Items synced" v={String(c.items_synced)} />
              <Row k="Skipped" v={String(c.items_skipped)} warn={c.items_skipped > 0} />
              <Row k="Permission errors" v={String(c.permission_errors)} warn={c.permission_errors > 0} />
              <Row k="Pending" v={String(c.pending_items)} />
              <Row k="Owner" v={c.data_source.owner?.name ?? "—"} />
              <Row k="Retention" v={c.data_source.retention ?? "—"} />
            </dl>
            <div className="mt-2 flex items-center gap-2">
              {c.data_source.classification && (
                <ClassificationBadge classification={c.data_source.classification} />
              )}
              {c.data_source.department && <Badge tone="neutral">{c.data_source.department}</Badge>}
            </div>

            <div className="mt-3 flex gap-2">
              {canSync && (
                <Button
                  size="sm"
                  variant="secondary"
                  className="flex-1"
                  disabled={sync.isPending || c.status === "paused"}
                  onClick={() => sync.mutate(c.id)}
                >
                  <RefreshCw className={`size-3.5 ${sync.isPending ? "animate-spin" : ""}`} />
                  {c.status === "paused" ? "Paused" : c.pending_items > 0 ? `Sync now (${c.pending_items} pending)` : "Sync now"}
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => setLogsFor(c)}>
                <History className="size-3.5" /> Jobs
              </Button>
            </div>
            {sync.isError && (
              <p className="mt-1 text-[11px] text-crit">{(sync.error as Error).message}</p>
            )}
          </Card>
        ))}
      </div>

      <JobsDialog connector={logsFor} onClose={() => setLogsFor(null)} />
    </div>
  );
}

function Row({ k, v, warn }: { k: string; v: string; warn?: boolean }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-ink-3">{k}</dt>
      <dd className={`font-medium tabular-nums ${warn ? "text-warn" : "text-ink-2"}`}>{v}</dd>
    </div>
  );
}

function JobsDialog({ connector, onClose }: { connector: ConnectorInfo | null; onClose: () => void }) {
  const { data } = useQuery({
    queryKey: ["sync-jobs", connector?.id],
    queryFn: () => api<{ items: SyncJobInfo[] }>(`/connectors/${connector!.id}/jobs`),
    enabled: !!connector,
  });
  return (
    <Dialog open={!!connector} onClose={onClose} title={`Sync history — ${connector?.display_name ?? ""}`} wide>
      <div className="space-y-3">
        {data?.items.map((job) => (
          <div key={job.id} className="rounded-lg border border-line p-3">
            <div className="flex items-center gap-2 text-xs">
              <StatusChip status={job.status} />
              <Badge tone="neutral">{job.trigger}</Badge>
              <span className="text-ink-3">{formatDateTime(job.started_at)}</span>
              <span className="ml-auto tabular-nums text-ink-3">
                {job.items_processed} in / {job.items_skipped} skipped
              </span>
            </div>
            <ul className="mt-2 space-y-0.5">
              {job.log.map((line, i) => (
                <li
                  key={i}
                  className={`font-mono text-[10.5px] leading-relaxed ${
                    line.level === "warning" ? "text-warn" : line.level === "error" ? "text-crit" : "text-ink-3"
                  }`}
                >
                  {line.msg}
                </li>
              ))}
            </ul>
          </div>
        ))}
        {data && !data.items.length && (
          <p className="py-6 text-center text-xs text-ink-3">No sync jobs recorded yet.</p>
        )}
      </div>
    </Dialog>
  );
}
