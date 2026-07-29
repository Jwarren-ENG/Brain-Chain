"use client";

import {
  Badge,
  Button,
  Card,
  CardHeader,
  CardSkeleton,
  Dialog,
  EmptyState,
  InfoNote,
  StatusChip,
  Textarea,
} from "@/components/ui";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/utils";
import type { AgentInfo, AgentRunInfo } from "@brainchain/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bot,
  FlaskConical,
  LineChart,
  ListChecks,
  Play,
  Search,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";

const AGENT_ICONS: Record<string, React.ReactNode> = {
  research: <Search className="size-4" />,
  planning: <ListChecks className="size-4" />,
  project_health: <LineChart className="size-4" />,
  meeting_followup: <FlaskConical className="size-4" />,
  spend_supplier: <Wallet className="size-4" />,
  exec_brief: <ShieldCheck className="size-4" />,
};

const GOAL_SUGGESTIONS: Record<string, string> = {
  research: "Summarize everything we know about VoltCore battery lead times and their impact on Phoenix.",
  planning: "Create a recovery plan for the Phoenix qualification schedule slip, including battery supply risk mitigation.",
  project_health: "Review Phoenix project health: delays, blockers, missing owners and dependencies.",
  meeting_followup: "Turn the July 16 Phoenix risk deep-dive into decisions, tasks, owners and deadlines.",
  spend_supplier: "Analyze supplier spend concentration and contract renewal risks for the Phoenix program.",
  exec_brief: "Produce the weekly executive brief with evidence.",
};

export default function AgentsPage() {
  const [launchAgent, setLaunchAgent] = React.useState<AgentInfo | null>(null);

  const { data: agents, isLoading } = useQuery({
    queryKey: ["agents"],
    queryFn: () => api<{ items: AgentInfo[] }>("/agents"),
  });
  const { data: runs } = useQuery({
    queryKey: ["agent-runs"],
    queryFn: () => api<{ items: AgentRunInfo[] }>("/agent-runs"),
    refetchInterval: 8000,
  });

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-lg font-semibold text-ink">
          <Bot className="size-5 text-accent" /> Agent Workbench
        </h1>
        <p className="text-xs text-ink-3">
          Agents follow plan → review → approve → execute. They retrieve with <em>your</em>{" "}
          permissions, run dry by default, and never touch external systems without human approval.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {isLoading &&
          Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} rows={2} />)}
        {agents?.items.map((agent) => (
          <Card key={agent.id} className="flex flex-col p-4">
            <div className="flex items-center gap-2.5">
              <span className="flex size-8 items-center justify-center rounded-lg bg-accent-soft text-accent">
                {AGENT_ICONS[agent.key] ?? <Bot className="size-4" />}
              </span>
              <div>
                <p className="text-sm font-semibold text-ink">{agent.name}</p>
                <Badge tone="neutral">{agent.category}</Badge>
              </div>
            </div>
            <p className="mt-2 flex-1 text-xs leading-relaxed text-ink-3">{agent.description}</p>
            <div className="mt-3 flex flex-wrap gap-1">
              {agent.tool_allowlist.map((tool) => (
                <span key={tool} className="rounded bg-panel-2 px-1.5 py-0.5 font-mono text-[10px] text-ink-3">
                  {tool}
                </span>
              ))}
            </div>
            {agent.approval_required_actions.length > 0 && (
              <p className="mt-2 text-[10.5px] text-warn">
                Requires approval for: {agent.approval_required_actions.join(", ").replace(/_/g, " ")}
              </p>
            )}
            <Button size="sm" className="mt-3 w-full" onClick={() => setLaunchAgent(agent)}>
              <Play className="size-3.5" /> Run agent
            </Button>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader title="Recent runs" sub="Every step is recorded and auditable" />
        <div className="divide-y divide-line">
          {runs?.items.map((run) => (
            <Link
              key={run.id}
              href={`/agents/runs/${run.id}`}
              className="flex items-center gap-3 px-4 py-3 hover:bg-panel-2"
            >
              <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-panel-2 text-ink-2">
                {AGENT_ICONS[run.agent.key] ?? <Bot className="size-3.5" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-ink">{run.goal}</p>
                <p className="text-[11px] text-ink-3">
                  {run.agent.name} · {run.user?.name} · {formatDateTime(run.started_at)} ·{" "}
                  {run.source_document_count} sources · est. ${run.cost_estimate.toFixed(4)}
                </p>
              </div>
              <Badge tone="neutral">{run.mode.replace("_", "-")}</Badge>
              <StatusChip status={run.status} />
            </Link>
          ))}
          {runs && !runs.items.length && <EmptyState title="No agent runs yet" />}
        </div>
      </Card>

      <LaunchDialog agent={launchAgent} onClose={() => setLaunchAgent(null)} />
    </div>
  );
}

function LaunchDialog({ agent, onClose }: { agent: AgentInfo | null; onClose: () => void }) {
  const [goal, setGoal] = React.useState("");
  const router = useRouter();
  const queryClient = useQueryClient();

  React.useEffect(() => {
    if (agent) setGoal(GOAL_SUGGESTIONS[agent.key] ?? "");
  }, [agent]);

  const launch = useMutation({
    mutationFn: () =>
      api<AgentRunInfo>(`/agents/${agent!.id}/runs`, {
        method: "POST",
        body: { goal, mode: "dry_run" },
      }),
    onSuccess: (run) => {
      queryClient.invalidateQueries({ queryKey: ["agent-runs"] });
      onClose();
      router.push(`/agents/runs/${run.id}`);
    },
  });

  return (
    <Dialog open={!!agent} onClose={onClose} title={`Run ${agent?.name ?? ""}`}>
      <div className="space-y-3">
        <p className="text-xs text-ink-3">{agent?.description}</p>
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-2" htmlFor="goal">
            Goal
          </label>
          <Textarea id="goal" rows={3} value={goal} onChange={(e) => setGoal(e.target.value)} />
        </div>
        <InfoNote>
          Runs execute in <strong>dry-run</strong> (organization policy). The agent will retrieve
          authorized sources, produce a plan with assumptions, and pause for human approval before
          any external action. Approved actions are simulated, not sent.
        </InfoNote>
        {launch.isError && <p className="text-xs text-crit">{(launch.error as Error).message}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => launch.mutate()} disabled={goal.trim().length < 5 || launch.isPending}>
            <Play className="size-3.5" /> {launch.isPending ? "Starting…" : "Start run"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
