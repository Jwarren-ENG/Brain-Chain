"use client";

import { useSession } from "@/components/providers";
import {
  Badge,
  Card,
  CardHeader,
  CardSkeleton,
  InfoNote,
  Select,
  StatusChip,
  Table,
  Td,
  Th,
} from "@/components/ui";
import { api } from "@/lib/api";
import { hasRole } from "@/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Cpu, Globe2, Shield } from "lucide-react";
import * as React from "react";

interface Provider {
  id: string;
  name: string;
  kind: string;
  model: string;
  enabled: boolean;
  is_external: boolean;
  allows_data_retention: boolean;
  allows_tool_use: boolean;
  max_context_tokens: number;
  cost_limit_usd_month: number;
  region: string;
}

interface Policy {
  id: string;
  name: string;
  priority: number;
  enabled: boolean;
  provider: { id: string; name: string; is_external: boolean };
  max_classification_level: number;
  department_ids: string[];
  role_names: string[];
  logging_policy: string;
}

export default function PoliciesPage() {
  const { user } = useSession();
  const canEdit = hasRole(user, "security_admin");
  const queryClient = useQueryClient();

  const { data: providers, isLoading } = useQuery({
    queryKey: ["model-providers"],
    queryFn: () => api<{ items: Provider[] }>("/model-providers"),
  });
  const { data: policies } = useQuery({
    queryKey: ["model-policies"],
    queryFn: () => api<{ items: Policy[] }>("/model-policies"),
  });
  const { data: org } = useQuery({
    queryKey: ["org"],
    queryFn: () => api<{ deployment_profile: string; external_models_allowed: boolean }>("/org"),
  });

  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      api(`/model-policies/${id}`, { method: "PATCH", body }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["model-policies"] }),
  });

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-lg font-semibold text-ink">
          <Shield className="size-5 text-accent" /> Model Policies
        </h1>
        <p className="text-xs text-ink-3">
          Which model may see which data. Routing picks the highest-priority enabled policy whose
          classification ceiling covers the retrieved content.
        </p>
      </div>

      <InfoNote tone={org?.external_models_allowed ? "warn" : "privacy"}>
        Deployment profile <strong>{org?.deployment_profile}</strong>:{" "}
        {org?.external_models_allowed
          ? "external model calls are permitted where a policy allows them."
          : "external model calls are currently disabled — all inference stays in-process. The government profile forces this off at the platform level."}
      </InfoNote>

      <div className="grid gap-3 md:grid-cols-2">
        {isLoading && (
          <>
            <CardSkeleton />
            <CardSkeleton />
          </>
        )}
        {providers?.items.map((p) => (
          <Card key={p.id} className="p-4">
            <div className="flex items-center gap-2.5">
              <span className="flex size-9 items-center justify-center rounded-lg bg-panel-2 text-ink-2">
                {p.is_external ? <Globe2 className="size-4" /> : <Cpu className="size-4" />}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink">{p.name}</p>
                <p className="text-[11px] text-ink-3">
                  {p.kind} · {p.model}
                </p>
              </div>
              <span className="ml-auto">
                <StatusChip status={p.enabled ? "connected" : "paused"} />
              </span>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
              <PRow k="Location" v={p.is_external ? "External API" : "In-process"} />
              <PRow k="Region" v={p.region} />
              <PRow k="Provider retention" v={p.allows_data_retention ? "allowed" : "not allowed"} />
              <PRow k="Tool use" v={p.allows_tool_use ? "allowed" : "blocked"} />
              <PRow k="Max context" v={`${(p.max_context_tokens / 1000).toFixed(0)}K tokens`} />
              <PRow k="Cost limit" v={p.cost_limit_usd_month ? `$${p.cost_limit_usd_month}/mo` : "n/a"} />
            </dl>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader
          title="Routing policies"
          sub={
            canEdit
              ? "Lower priority number wins. Edits are audited."
              : "Read-only — security administrator role required to edit."
          }
        />
        <div className="p-3">
          <Table>
            <thead>
              <tr>
                <Th>Policy</Th>
                <Th>Provider</Th>
                <Th>Priority</Th>
                <Th>Max classification</Th>
                <Th>Logging</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {policies?.items.map((p) => (
                <tr key={p.id} className="hover:bg-panel-2">
                  <Td className="font-medium text-ink">{p.name}</Td>
                  <Td>
                    <span className="inline-flex items-center gap-1.5">
                      {p.provider.name}
                      {p.provider.is_external && <Badge tone="warn">external</Badge>}
                    </span>
                  </Td>
                  <Td className="tabular-nums">{p.priority}</Td>
                  <Td>
                    {canEdit ? (
                      <Select
                        value={String(p.max_classification_level)}
                        onChange={(e) =>
                          update.mutate({
                            id: p.id,
                            body: { max_classification_level: Number(e.target.value) },
                          })
                        }
                        className="h-7 text-xs"
                        aria-label={`Classification ceiling for ${p.name}`}
                      >
                        <option value="0">Public (0)</option>
                        <option value="1">Internal (1)</option>
                        <option value="2">Confidential (2)</option>
                        <option value="3">Restricted (3)</option>
                      </Select>
                    ) : (
                      `level ≤ ${p.max_classification_level}`
                    )}
                  </Td>
                  <Td>{p.logging_policy.replace(/_/g, " ")}</Td>
                  <Td>
                    {canEdit ? (
                      <button
                        onClick={() => update.mutate({ id: p.id, body: { enabled: !p.enabled } })}
                        aria-label={`Toggle ${p.name}`}
                      >
                        <StatusChip status={p.enabled ? "active" : "paused"} />
                      </button>
                    ) : (
                      <StatusChip status={p.enabled ? "active" : "paused"} />
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      </Card>

      <InfoNote>
        The OpenAI-compatible adapter is configured only via environment variables
        (BRAINCHAIN_OPENAI_BASE_URL / _API_KEY / _MODEL) — no credentials in code or database. Even
        when configured, content above a policy's classification ceiling never reaches an external
        provider; the local synthesis provider handles it instead.
      </InfoNote>
    </div>
  );
}

function PRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-ink-3">{k}</dt>
      <dd className="font-medium text-ink-2">{v}</dd>
    </div>
  );
}
