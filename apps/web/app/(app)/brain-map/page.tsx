"use client";

import { Badge, Card, Skeleton } from "@/components/ui";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { BrainMapData } from "@brainchain/shared";
import { useQuery } from "@tanstack/react-query";
import {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  Bot,
  Brain,
  Building2,
  Database,
  Landmark,
  LineChart,
  Lock,
  MessageSquareHeart,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";

/* ------------------------------------------------------------- node views */

type MapNodeData = {
  label: string;
  sub?: string;
  icon?: React.ReactNode;
  stats?: Record<string, unknown>;
  route?: string;
  variant: "brain" | "domain" | "db" | "profile" | "zero" | "cycle" | "agents";
  active?: boolean;
};

function MapNode({ data }: NodeProps) {
  const d = data as MapNodeData;
  return (
    <div
      className={cn(
        "rounded-xl border bg-panel px-4 py-3 shadow-sm transition-shadow",
        d.route && "cursor-pointer hover:shadow-lg hover:border-accent",
        d.variant === "brain" &&
          "border-accent bg-gradient-to-br from-accent-soft to-panel px-6 py-5 shadow-lg",
        d.variant === "db" && "border-line-strong",
        d.variant === "profile" && (d.active ? "border-accent bg-accent-soft/60" : "border-line opacity-75"),
        d.variant === "zero" && "border-good/50 bg-good/5",
        d.variant === "cycle" && "border-line bg-panel-2 px-3.5 py-2.5",
      )}
    >
      <Handle type="target" position={Position.Top} className="!bg-transparent !border-0" />
      <Handle type="source" position={Position.Bottom} className="!bg-transparent !border-0" />
      <Handle type="target" position={Position.Left} id="l" className="!bg-transparent !border-0" />
      <Handle type="source" position={Position.Right} id="r" className="!bg-transparent !border-0" />
      <div className="flex items-center gap-2.5">
        {d.icon && (
          <span
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-lg",
              d.variant === "brain" ? "bg-accent text-accent-ink" : "bg-panel-2 text-ink-2",
            )}
          >
            {d.icon}
          </span>
        )}
        <div>
          <p
            className={cn(
              "font-semibold leading-tight text-ink",
              d.variant === "brain" ? "text-base" : "text-xs",
              d.variant === "cycle" && "text-[11px] font-medium",
            )}
          >
            {d.label}
          </p>
          {d.sub && <p className="mt-0.5 text-[10.5px] text-ink-3">{d.sub}</p>}
        </div>
      </div>
      {d.stats && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {Object.entries(d.stats).map(([key, value]) => (
            <span
              key={key}
              className="rounded-md bg-panel-2 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-ink-2"
            >
              {key.replace(/_/g, " ")}: {String(value)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

const nodeTypes = { map: MapNode };

/* ------------------------------------------------------------------ page */

export default function BrainMapPage() {
  const router = useRouter();
  const { data, isLoading } = useQuery({
    queryKey: ["brain-map"],
    queryFn: () => api<BrainMapData>("/brain-map"),
  });

  const { nodes, edges } = React.useMemo(() => {
    if (!data) return { nodes: [] as Node[], edges: [] as Edge[] };
    const n = data.nodes;
    const mk = (
      id: string,
      x: number,
      y: number,
      d: MapNodeData,
      extra: Partial<Node> = {},
    ): Node => ({
      id,
      type: "map",
      position: { x, y },
      data: d as unknown as Record<string, unknown>,
      ...extra,
    });

    const nodes: Node[] = [
      // deployment profiles (top row)
      ...n.profiles.map((p, i) =>
        mk(`profile-${p.key}`, 140 + i * 240, 0, {
          label: p.label,
          sub: p.sub,
          icon: <Landmark className="size-4" />,
          variant: "profile",
          active: p.active,
        }),
      ),
      mk("kdb", 260, 130, {
        label: n.knowledge_db.label,
        sub: n.knowledge_db.sub,
        icon: <Database className="size-4" />,
        stats: n.knowledge_db.stats,
        variant: "db",
      }),
      mk("zero", 700, 130, {
        label: "Zero Trust",
        sub: n.zero_trust.sub,
        icon: <Lock className="size-4" />,
        variant: "zero",
      }),
      mk("brain", 330, 300, {
        label: n.brain.label,
        sub: n.brain.sub,
        icon: <Brain className="size-5" />,
        stats: n.brain.stats,
        variant: "brain",
      }),
      // four domains
      mk("company", 0, 260, {
        label: n.company_info.label,
        icon: <Building2 className="size-4" />,
        stats: n.company_info.stats,
        route: n.company_info.route,
        variant: "domain",
      }),
      mk("tribal", 0, 420, {
        label: n.tribal.label,
        icon: <Users className="size-4" />,
        stats: n.tribal.stats,
        route: n.tribal.route,
        variant: "domain",
      }),
      mk("feedback", 700, 260, {
        label: n.feedback.label,
        icon: <MessageSquareHeart className="size-4" />,
        stats: n.feedback.stats,
        route: n.feedback.route,
        variant: "domain",
      }),
      mk("llm", 700, 420, {
        label: n.llm_usage.label,
        icon: <Sparkles className="size-4" />,
        stats: n.llm_usage.stats,
        route: n.llm_usage.route,
        variant: "domain",
      }),
      mk("agents", 420, 470, {
        label: n.agents.label,
        icon: <Bot className="size-4" />,
        stats: n.agents.stats,
        route: n.agents.route,
        variant: "agents",
      }),
      // operating cycle (bottom)
      ...n.cycle.map((c, i) =>
        mk(`cycle-${c.key}`, i * 205, 610, {
          label: c.label,
          variant: "cycle",
          route:
            c.key === "plan"
              ? "/governance"
              : c.key === "track"
                ? "/integrations"
                : c.key === "understand"
                  ? "/explorer"
                  : c.key === "execute"
                    ? "/agents"
                    : "/insights",
        }),
      ),
    ];

    const edge = (
      id: string,
      source: string,
      target: string,
      opts: Partial<Edge> = {},
    ): Edge => ({
      id,
      source,
      target,
      animated: opts.animated ?? false,
      style: { strokeWidth: 1.5 },
      ...opts,
    });

    const edges: Edge[] = [
      ...n.profiles.map((p) => edge(`e-${p.key}`, `profile-${p.key}`, "kdb")),
      edge("e-kdb-brain", "kdb", "brain", { animated: true }),
      edge("e-zero-brain", "zero", "brain", { label: "enforced pre-retrieval" }),
      edge("e-company", "company", "brain", { animated: true, sourceHandle: "r", targetHandle: "l" }),
      edge("e-tribal", "tribal", "brain", { animated: true, sourceHandle: "r", targetHandle: "l" }),
      edge("e-feedback", "brain", "feedback", { animated: true, sourceHandle: "r", targetHandle: "l" }),
      edge("e-llm", "brain", "llm", { animated: true, sourceHandle: "r", targetHandle: "l" }),
      edge("e-agents", "brain", "agents", { animated: true }),
      edge("e-brain-cycle", "brain", "cycle-understand"),
      ...n.cycle.slice(0, -1).map((c, i) =>
        edge(`e-cycle-${i}`, `cycle-${c.key}`, `cycle-${n.cycle[i + 1].key}`, {
          animated: true,
          sourceHandle: "r",
          targetHandle: "l",
        }),
      ),
    ];
    return { nodes, edges };
  }, [data]);

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-ink">Company Brain Map</h1>
          <p className="text-xs text-ink-3">
            The living architecture: four knowledge domains feed a permission-aware brain that
            powers the assistant, agents and management insights. Click a node to open its module.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone="good">
            <ShieldCheck className="size-3" /> Zero-trust enforced
          </Badge>
          <Badge tone="accent">
            <LineChart className="size-3" /> Live stats
          </Badge>
        </div>
      </div>

      {isLoading ? (
        <Card className="h-[70vh] p-6">
          <Skeleton className="h-full w-full" />
        </Card>
      ) : (
        <Card className="h-[72vh] overflow-hidden">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.15 }}
            minZoom={0.4}
            maxZoom={1.6}
            nodesDraggable
            nodesConnectable={false}
            proOptions={{ hideAttribution: true }}
            onNodeClick={(_e, node) => {
              const route = (node.data as MapNodeData).route;
              if (route) router.push(route);
            }}
          >
            <Background gap={24} size={1.5} />
            <Controls showInteractive={false} />
            <MiniMap pannable zoomable className="!h-24 !w-36" />
          </ReactFlow>
        </Card>
      )}

      <p className="mt-3 text-[11px] text-ink-3">
        Operating cycle: define the intelligence &amp; data plan → connect and track data initiatives
        → build permission-aware understanding → agents plan, organize and execute with approval →
        leadership receives anonymized, evidence-backed insights.
      </p>
    </div>
  );
}
