"use client";

import { useSession } from "@/components/providers";
import {
  Badge,
  Card,
  CardSkeleton,
  EmptyState,
  Select,
  StatusChip,
  Table,
  Tabs,
  Td,
  Th,
} from "@/components/ui";
import { api } from "@/lib/api";
import { formatDate, formatDateTime } from "@/lib/utils";
import type { ApprovalInfo, TaskInfo } from "@brainchain/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckSquare, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import * as React from "react";
import { Spinner } from "@/components/ui";

function ApprovalsInner() {
  const params = useSearchParams();
  const [tab, setTab] = React.useState(params.get("tab") === "approvals" ? "approvals" : "tasks");

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-semibold text-ink">
            <CheckSquare className="size-5 text-accent" /> Tasks &amp; Approvals
          </h1>
          <p className="text-xs text-ink-3">
            Work extracted from meetings and Jira, plus the human gate in front of every external
            agent action.
          </p>
        </div>
        <Tabs
          tabs={[
            { key: "tasks", label: "Tasks" },
            { key: "approvals", label: "Approvals" },
          ]}
          value={tab}
          onChange={setTab}
        />
      </div>
      {tab === "tasks" ? <TasksTab /> : <ApprovalsTab />}
    </div>
  );
}

function TasksTab() {
  const [statusFilter, setStatusFilter] = React.useState("");
  const [mineOnly, setMineOnly] = React.useState(false);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["tasks", statusFilter, mineOnly],
    queryFn: () =>
      api<{ items: TaskInfo[] }>("/tasks", {
        params: { status_filter: statusFilter, mine: mineOnly },
      }),
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api(`/tasks/${id}`, { method: "PATCH", body: { status } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tasks"] }),
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Status filter">
          <option value="">All statuses</option>
          {["open", "in_progress", "blocked", "done"].map((s) => (
            <option key={s} value={s}>
              {s.replace("_", " ")}
            </option>
          ))}
        </Select>
        <label className="flex items-center gap-1.5 text-xs text-ink-2">
          <input
            type="checkbox"
            checked={mineOnly}
            onChange={(e) => setMineOnly(e.target.checked)}
            className="size-3.5 accent-[var(--accent)]"
          />
          Assigned to me
        </label>
      </div>
      {isLoading && <CardSkeleton rows={5} />}
      {data && (
        <Table>
          <thead>
            <tr>
              <Th>Task</Th>
              <Th>Project</Th>
              <Th>Assignee</Th>
              <Th>Due</Th>
              <Th>Source</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((t) => (
              <tr key={t.id} className="hover:bg-panel-2">
                <Td className="font-medium text-ink">
                  {t.external_ref && (
                    <span className="mr-1.5 font-mono text-[10.5px] text-ink-3">{t.external_ref}</span>
                  )}
                  {t.title}
                </Td>
                <Td>{t.project || "—"}</Td>
                <Td>{t.assignee?.name ?? "Unassigned"}</Td>
                <Td>{formatDate(t.due_date)}</Td>
                <Td>
                  <Badge tone={t.source === "agent" ? "accent" : "neutral"}>{t.source}</Badge>
                </Td>
                <Td>
                  <Select
                    value={t.status}
                    onChange={(e) => updateStatus.mutate({ id: t.id, status: e.target.value })}
                    className="h-7 text-xs"
                    aria-label={`Status for ${t.title}`}
                  >
                    {["open", "in_progress", "blocked", "done"].map((s) => (
                      <option key={s} value={s}>
                        {s.replace("_", " ")}
                      </option>
                    ))}
                  </Select>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {data && !data.items.length && <EmptyState title="No tasks match" />}
    </div>
  );
}

function ApprovalsTab() {
  const { user } = useSession();
  const [statusFilter, setStatusFilter] = React.useState("pending");
  const { data, isLoading } = useQuery({
    queryKey: ["approvals", statusFilter],
    queryFn: () =>
      api<{ items: ApprovalInfo[]; can_decide: boolean }>("/approvals", {
        params: { status_filter: statusFilter },
      }),
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Approval status">
          <option value="">All</option>
          {["pending", "approved", "rejected", "executed_dry_run"].map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, " ")}
            </option>
          ))}
        </Select>
        {data && (
          <Badge tone={data.can_decide ? "good" : "neutral"} className="ml-auto">
            <ShieldAlert className="size-3" />
            {data.can_decide
              ? "You can approve or reject"
              : "View only — approver role required to decide"}
          </Badge>
        )}
      </div>
      {isLoading && <CardSkeleton rows={4} />}
      <div className="space-y-2.5">
        {data?.items.map((a) => (
          <Card key={a.id} className="p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="warn">{a.action_type.replace(/_/g, " ")}</Badge>
              <p className="text-sm font-medium text-ink">{a.title}</p>
              <span className="ml-auto">
                <StatusChip status={a.status} />
              </span>
            </div>
            <p className="mt-1.5 text-[11px] text-ink-3">
              Requested by {a.requested_by?.name ?? "agent"} · {formatDateTime(a.created_at)}
              {a.approver ? ` · decided by ${a.approver.name}` : ""}
              {a.requested_by?.id === user?.id && " · (you requested this — another approver must decide)"}
            </p>
            {a.agent_run && (
              <p className="mt-1.5 text-xs text-ink-2">
                From run:{" "}
                <Link href={`/agents/runs/${a.agent_run.id}`} className="font-medium text-accent hover:underline">
                  {a.agent_run.goal}
                </Link>{" "}
                <Badge tone="neutral">{a.agent_run.mode.replace("_", "-")}</Badge>
              </p>
            )}
            {a.status === "pending" && (
              <p className="mt-2 text-[11px] text-ink-3">
                Decide from the run page — the full plan, sources and assumptions are shown there.
              </p>
            )}
          </Card>
        ))}
      </div>
      {data && !data.items.length && <EmptyState title="No approvals in this state" />}
    </div>
  );
}

export default function ApprovalsPage() {
  return (
    <React.Suspense fallback={<Spinner label="Loading…" />}>
      <ApprovalsInner />
    </React.Suspense>
  );
}
