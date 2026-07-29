"use client";

import {
  Badge,
  Button,
  Card,
  CardHeader,
  CardSkeleton,
  InfoNote,
  StatusChip,
  Textarea,
} from "@/components/ui";
import { api } from "@/lib/api";
import { useSession } from "@/components/providers";
import { cn, formatDateTime, hasRole } from "@/lib/utils";
import type { AgentRunInfo, ApprovalInfo } from "@brainchain/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Bot,
  Check,
  ChevronDown,
  CircleDashed,
  Clock,
  FileText,
  ShieldAlert,
  X,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import * as React from "react";

export default function AgentRunPage() {
  const params = useParams<{ id: string }>();
  const { user } = useSession();
  const queryClient = useQueryClient();

  const { data: run, isLoading } = useQuery({
    queryKey: ["agent-run", params.id],
    queryFn: () => api<AgentRunInfo>(`/agent-runs/${params.id}`),
    refetchInterval: (query) =>
      ["queued", "retrieving", "planning", "executing", "verifying"].includes(
        query.state.data?.status ?? "",
      )
        ? 3000
        : false,
  });

  const canApprove = hasRole(user, "agent_approver", "security_admin");

  if (isLoading || !run) {
    return (
      <div className="mx-auto max-w-4xl space-y-4">
        <CardSkeleton rows={2} />
        <CardSkeleton rows={5} />
      </div>
    );
  }

  const pendingApprovals = (run.approvals ?? []).filter((a) => a.status === "pending");

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <Link href="/agents" className="inline-flex items-center gap-1 text-xs text-ink-3 hover:text-ink">
        <ArrowLeft className="size-3.5" /> Agent Workbench
      </Link>

      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-accent-soft text-accent">
              <Bot className="size-5" />
            </span>
            <div>
              <h1 className="text-base font-semibold leading-snug text-ink">{run.goal}</h1>
              <p className="mt-0.5 text-xs text-ink-3">
                {run.agent.name} · started by {run.user?.name} · {formatDateTime(run.started_at)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge tone="neutral">{run.mode.replace("_", "-")}</Badge>
            <StatusChip status={run.status} />
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-ink-3 md:grid-cols-4">
          <span className="flex items-center gap-1.5">
            <FileText className="size-3.5" /> {run.source_document_count} sources
          </span>
          <span className="flex items-center gap-1.5">
            <Clock className="size-3.5" /> {duration(run)}
          </span>
          <span>~{run.tokens_used.toLocaleString()} tokens</span>
          <span>est. ${run.cost_estimate.toFixed(4)}</span>
        </div>
        {run.status === "awaiting_approval" && (
          <InfoNote tone="warn">
            This run proposed external actions and is paused. {canApprove
              ? "You hold the approver role — decide below."
              : "An agent approver must decide before anything executes."}
          </InfoNote>
        )}
        {run.error && <p className="mt-2 text-xs text-crit">Error: {run.error}</p>}
        {run.result_summary && run.status === "completed" && (
          <p className="mt-3 rounded-lg bg-panel-2 px-3 py-2.5 text-xs leading-relaxed text-ink-2">
            {run.result_summary}
          </p>
        )}
      </Card>

      {(run.approvals ?? []).length > 0 && (
        <Card>
          <CardHeader
            icon={<ShieldAlert className="size-4" />}
            title="Proposed external actions"
            sub="Human approval gate — nothing executes until decided; dry-run simulates"
          />
          <div className="divide-y divide-line">
            {(run.approvals ?? []).map((a) => (
              <ApprovalRow
                key={a.id}
                approval={a}
                canApprove={canApprove && a.requested_by?.id !== user?.id}
                onDecided={() => {
                  queryClient.invalidateQueries({ queryKey: ["agent-run", params.id] });
                  queryClient.invalidateQueries({ queryKey: ["agent-runs"] });
                }}
              />
            ))}
          </div>
          {pendingApprovals.length > 0 && canApprove && run.user?.id === user?.id && (
            <p className="px-4 pb-3 text-[11px] text-ink-3">
              Separation of duties: you requested this run, so another approver must decide it.
            </p>
          )}
        </Card>
      )}

      {run.plan && run.plan.length > 0 && (
        <Card>
          <CardHeader title="Proposed plan" sub="Phases, owners and evidence" />
          <div className="space-y-3 p-4">
            {run.plan.map((phase, i) => (
              <div key={i} className="rounded-lg border border-line p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="accent">Phase {i + 1}</Badge>
                  <p className="text-sm font-medium text-ink">{phase.phase}</p>
                  {phase.duration && <span className="text-[11px] text-ink-3">{phase.duration}</span>}
                  {phase.owner && (
                    <span className="ml-auto text-[11px] text-ink-3">Owner: {phase.owner}</span>
                  )}
                </div>
                <ul className="mt-2 space-y-1">
                  {phase.items.map((item, j) => (
                    <li key={j} className="text-xs leading-relaxed text-ink-2">
                      • {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Card>
      )}

      {run.assumptions.length > 0 && (
        <Card>
          <CardHeader title="Assumptions" sub="Explicit, so reviewers can challenge them" />
          <ul className="space-y-1.5 p-4">
            {run.assumptions.map((a, i) => (
              <li key={i} className="rounded-lg bg-panel-2 px-3 py-2 text-xs text-ink-2">
                {a}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <CardHeader title="Execution timeline" sub="Every step recorded with tool calls and results" />
        <div className="p-4">
          {(run.steps ?? []).map((step, i) => (
            <StepRow key={i} step={step} isLast={i === (run.steps?.length ?? 0) - 1} />
          ))}
        </div>
      </Card>
    </div>
  );
}

function duration(run: AgentRunInfo): string {
  if (!run.started_at) return "—";
  const end = run.finished_at ? new Date(run.finished_at) : new Date();
  const secs = Math.max(0, (end.getTime() - new Date(run.started_at).getTime()) / 1000);
  return secs < 60 ? `${secs.toFixed(1)}s` : `${(secs / 60).toFixed(1)}m`;
}

function ApprovalRow({
  approval,
  canApprove,
  onDecided,
}: {
  approval: ApprovalInfo;
  canApprove: boolean;
  onDecided: () => void;
}) {
  const [reason, setReason] = React.useState("");
  const [showReason, setShowReason] = React.useState<null | "approved" | "rejected">(null);

  const decide = useMutation({
    mutationFn: (decision: "approved" | "rejected") =>
      api(`/approvals/${approval.id}/decide`, {
        method: "POST",
        body: { decision, reason },
      }),
    onSuccess: onDecided,
  });

  return (
    <div className="px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="warn">{approval.action_type.replace(/_/g, " ")}</Badge>
        <p className="text-xs font-medium text-ink">{approval.title}</p>
        <span className="ml-auto">
          <StatusChip status={approval.status} />
        </span>
      </div>
      {typeof approval.payload.detail === "string" && (
        <p className="mt-1 text-[11px] text-ink-3">{approval.payload.detail}</p>
      )}
      {approval.decision_reason && (
        <p className="mt-1 text-[11px] italic text-ink-3">
          {approval.approver?.name}: “{approval.decision_reason}”
        </p>
      )}
      {approval.status === "pending" && canApprove && (
        <div className="mt-2">
          {showReason ? (
            <div className="space-y-2">
              <Textarea
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={`Reason for ${showReason === "approved" ? "approval" : "rejection"} (recorded in the audit log)`}
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={showReason === "approved" ? "success" : "danger"}
                  onClick={() => decide.mutate(showReason)}
                  disabled={decide.isPending}
                >
                  Confirm {showReason === "approved" ? "approval" : "rejection"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setShowReason(null)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button size="sm" variant="success" onClick={() => setShowReason("approved")}>
                <Check className="size-3.5" /> Approve
              </Button>
              <Button size="sm" variant="danger" onClick={() => setShowReason("rejected")}>
                <X className="size-3.5" /> Reject
              </Button>
            </div>
          )}
          {decide.isError && (
            <p className="mt-1 text-[11px] text-crit">{(decide.error as Error).message}</p>
          )}
        </div>
      )}
    </div>
  );
}

function StepRow({
  step,
  isLast,
}: {
  step: NonNullable<AgentRunInfo["steps"]>[number];
  isLast: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <span
          className={cn(
            "mt-0.5 flex size-6 items-center justify-center rounded-full border",
            step.status === "done"
              ? "border-good/50 bg-good/10 text-good"
              : "border-line text-ink-3",
          )}
        >
          {step.status === "done" ? <Check className="size-3.5" /> : <CircleDashed className="size-3.5" />}
        </span>
        {!isLast && <span className="w-px flex-1 bg-line" />}
      </div>
      <div className="min-w-0 flex-1 pb-4">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center gap-2 text-left"
        >
          <p className="text-xs font-medium text-ink">{step.title}</p>
          <Badge tone="neutral">{step.kind.replace(/_/g, " ")}</Badge>
          <ChevronDown
            className={cn("ml-auto size-3.5 text-ink-3 transition-transform", open && "rotate-180")}
          />
        </button>
        {open && (
          <pre className="mt-2 max-h-64 overflow-auto scroll-thin rounded-lg bg-panel-2 p-3 font-mono text-[10.5px] leading-relaxed text-ink-2">
            {JSON.stringify(step.detail, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}
