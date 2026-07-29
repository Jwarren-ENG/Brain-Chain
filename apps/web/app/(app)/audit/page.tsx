"use client";

import {
  Badge,
  Button,
  Card,
  CardSkeleton,
  EmptyState,
  Input,
  Select,
} from "@/components/ui";
import { api } from "@/lib/api";
import { cn, formatDateTime } from "@/lib/utils";
import type { AuditEventInfo } from "@brainchain/shared";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ScrollText, UserRound } from "lucide-react";
import * as React from "react";

export default function AuditPage() {
  const [action, setAction] = React.useState("");
  const [actor, setActor] = React.useState("");
  const [targetType, setTargetType] = React.useState("");
  const [offset, setOffset] = React.useState(0);
  const limit = 30;

  const { data, isLoading } = useQuery({
    queryKey: ["audit", action, actor, targetType, offset],
    queryFn: () =>
      api<{ total: number; items: AuditEventInfo[] }>("/audit", {
        params: { action, actor, target_type: targetType, limit, offset },
      }),
  });

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-lg font-semibold text-ink">
          <ScrollText className="size-5 text-accent" /> Audit Log
        </h1>
        <p className="text-xs text-ink-3">
          Every important operation — logins, searches, assistant queries, syncs, agent actions,
          approvals, admin changes. Anonymous feedback events deliberately carry no actor.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Input
          value={action}
          onChange={(e) => {
            setAction(e.target.value);
            setOffset(0);
          }}
          placeholder="Filter by action (e.g. assistant.ask)"
          className="max-w-60"
        />
        <Input
          value={actor}
          onChange={(e) => {
            setActor(e.target.value);
            setOffset(0);
          }}
          placeholder="Filter by actor name"
          className="max-w-48"
        />
        <Select
          value={targetType}
          onChange={(e) => {
            setTargetType(e.target.value);
            setOffset(0);
          }}
          aria-label="Target type"
        >
          <option value="">All targets</option>
          {["conversation", "document", "connector", "agent_run", "approval_request", "feedback", "feedback_aggregate", "model_policy", "task", "executive_summary"].map(
            (t) => (
              <option key={t} value={t}>
                {t.replace(/_/g, " ")}
              </option>
            ),
          )}
        </Select>
        {data && (
          <Badge tone="neutral" className="ml-auto self-center">
            {data.total.toLocaleString()} events
          </Badge>
        )}
      </div>

      {isLoading && <CardSkeleton rows={8} />}

      <Card className="divide-y divide-line">
        {data?.items.map((event) => (
          <AuditRow key={event.id} event={event} />
        ))}
        {data && !data.items.length && <EmptyState title="No events match these filters" />}
      </Card>

      {data && data.total > limit && (
        <div className="flex items-center justify-between">
          <Button
            variant="secondary"
            size="sm"
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - limit))}
          >
            Previous
          </Button>
          <span className="text-xs text-ink-3">
            {offset + 1}–{Math.min(offset + limit, data.total)} of {data.total}
          </span>
          <Button
            variant="secondary"
            size="sm"
            disabled={offset + limit >= data.total}
            onClick={() => setOffset(offset + limit)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}

function AuditRow({ event }: { event: AuditEventInfo }) {
  const [open, setOpen] = React.useState(false);
  const hasMeta = Object.keys(event.meta).length > 0;
  return (
    <div className="px-4 py-2.5">
      <button
        className="flex w-full items-center gap-2.5 text-left"
        onClick={() => hasMeta && setOpen((v) => !v)}
        aria-expanded={open}
      >
        <code className="shrink-0 rounded bg-panel-2 px-1.5 py-0.5 font-mono text-[10.5px] font-medium text-accent">
          {event.action}
        </code>
        <span className="flex min-w-0 items-center gap-1.5 text-xs text-ink-2">
          <UserRound className="size-3 shrink-0 text-ink-3" />
          {event.actor ? (
            <span className="truncate">{event.actor.name}</span>
          ) : (
            <span className="italic text-ink-3">
              {event.actor_type === "agent" ? "agent" : "anonymized"}
            </span>
          )}
        </span>
        {event.target_type && (
          <Badge tone="neutral" className="shrink-0">
            {event.target_type.replace(/_/g, " ")}
          </Badge>
        )}
        <span className="ml-auto shrink-0 text-[11px] tabular-nums text-ink-3">
          {formatDateTime(event.created_at)}
        </span>
        {hasMeta && (
          <ChevronDown
            className={cn("size-3.5 shrink-0 text-ink-3 transition-transform", open && "rotate-180")}
          />
        )}
      </button>
      {open && (
        <pre className="mt-2 overflow-x-auto scroll-thin rounded-lg bg-panel-2 p-2.5 font-mono text-[10.5px] leading-relaxed text-ink-2">
          {JSON.stringify(event.meta, null, 2)}
        </pre>
      )}
    </div>
  );
}
