"use client";

import {
  Badge,
  CardSkeleton,
  EmptyState,
  Select,
  Table,
  Td,
  Th,
} from "@/components/ui";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import type { TaskInfo } from "@brainchain/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckSquare } from "lucide-react";
import * as React from "react";
import { Spinner } from "@/components/ui";

function ApprovalsInner() {
  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-lg font-semibold text-ink">
          <CheckSquare className="size-5 text-accent" /> My work
        </h1>
        <p className="text-xs text-ink-3">
          Action items assigned to you or captured from meetings.
        </p>
      </div>
      <TasksTab />
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
                  <Badge tone="neutral">{t.source}</Badge>
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

export default function ApprovalsPage() {
  return (
    <React.Suspense fallback={<Spinner label="Loading…" />}>
      <ApprovalsInner />
    </React.Suspense>
  );
}
