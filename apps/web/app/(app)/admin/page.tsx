"use client";

import { useSession } from "@/components/providers";
import {
  Badge,
  Card,
  CardHeader,
  CardSkeleton,
  InfoNote,
  Select,
  Table,
  Tabs,
  Td,
  Th,
} from "@/components/ui";
import { api } from "@/lib/api";
import { cn, hasRole } from "@/lib/utils";
import type { UserInfo } from "@brainchain/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Landmark, Settings, Users } from "lucide-react";
import * as React from "react";

interface OrgData {
  id: string;
  name: string;
  deployment_profile: string;
  settings: Record<string, unknown>;
  external_models_allowed: boolean;
  profiles: Record<string, string>;
}

export default function AdminPage() {
  const [tab, setTab] = React.useState("org");
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-semibold text-ink">
            <Settings className="size-5 text-accent" /> Administration
          </h1>
          <p className="text-xs text-ink-3">
            Organization settings, deployment profile, users and departments. All changes audited.
          </p>
        </div>
        <Tabs
          tabs={[
            { key: "org", label: "Organization" },
            { key: "users", label: "Users & roles" },
            { key: "departments", label: "Departments" },
          ]}
          value={tab}
          onChange={setTab}
        />
      </div>
      {tab === "org" && <OrgSettings />}
      {tab === "users" && <UsersTab />}
      {tab === "departments" && <DepartmentsTab />}
    </div>
  );
}

function OrgSettings() {
  const { user } = useSession();
  const canEdit = hasRole(user, "system_admin", "security_admin");
  const queryClient = useQueryClient();

  const { data: org, isLoading } = useQuery({
    queryKey: ["org-full"],
    queryFn: () => api<OrgData>("/org"),
  });

  const update = useMutation({
    mutationFn: (body: Record<string, unknown>) => api("/org", { method: "PATCH", body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["org-full"] });
      queryClient.invalidateQueries({ queryKey: ["org"] });
    },
  });

  if (isLoading || !org) return <CardSkeleton rows={5} />;

  const settings = org.settings;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          icon={<Landmark className="size-4" />}
          title="Deployment profile"
          sub="Controls platform-level guarantees, including whether external model calls are even possible"
        />
        <div className="grid gap-3 p-4 md:grid-cols-3">
          {Object.entries(org.profiles).map(([key, description]) => (
            <button
              key={key}
              disabled={!canEdit}
              onClick={() => update.mutate({ deployment_profile: key })}
              className={cn(
                "rounded-xl border p-3.5 text-left transition-colors",
                org.deployment_profile === key
                  ? "border-accent bg-accent-soft/60"
                  : "border-line hover:border-line-strong",
                !canEdit && "cursor-default opacity-70",
              )}
            >
              <p className="text-sm font-semibold capitalize text-ink">{key}</p>
              <p className="mt-1 text-[11px] leading-relaxed text-ink-3">{description}</p>
              {org.deployment_profile === key && (
                <Badge tone="accent" className="mt-2">
                  active
                </Badge>
              )}
            </button>
          ))}
        </div>
        {org.deployment_profile === "government" && (
          <div className="px-4 pb-4">
            <InfoNote tone="privacy">
              Government profile: external model calls are disabled at the platform level and cannot
              be re-enabled by any organization setting.
            </InfoNote>
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title="Security & privacy settings" sub={canEdit ? "Changes are audited" : "Read-only for your role"} />
        <div className="divide-y divide-line">
          <SettingRow
            label="Minimum anonymous-feedback cohort"
            sub="Aggregates and themes stay hidden until this many submissions exist"
            control={
              <Select
                disabled={!canEdit}
                value={String(settings.min_feedback_cohort ?? 5)}
                onChange={(e) => update.mutate({ min_feedback_cohort: Number(e.target.value) })}
                aria-label="Minimum cohort"
              >
                {[2, 3, 5, 8, 10, 15].map((n) => (
                  <option key={n} value={n}>
                    {n} submissions
                  </option>
                ))}
              </Select>
            }
          />
          <SettingRow
            label="Force dry-run for agent runs"
            sub="Approved external actions are simulated instead of executed"
            control={
              <Toggle
                disabled={!canEdit}
                checked={settings.force_dry_run !== false}
                onChange={(v) => update.mutate({ force_dry_run: v })}
              />
            }
          />
          <SettingRow
            label="Allow external model providers"
            sub="Requires a routing policy AND environment configuration; forced off under the government profile"
            control={
              <Toggle
                disabled={!canEdit || org.deployment_profile === "government"}
                checked={settings.external_models_enabled === true}
                onChange={(v) => update.mutate({ external_models_enabled: v })}
              />
            }
          />
          <SettingRow
            label="Log raw prompts"
            sub="When off, audit records keep metadata only — no prompt or document text"
            control={
              <Toggle
                disabled={!canEdit}
                checked={settings.log_raw_prompts === true}
                onChange={(v) => update.mutate({ log_raw_prompts: v })}
              />
            }
          />
        </div>
      </Card>
    </div>
  );
}

function SettingRow({
  label,
  sub,
  control,
}: {
  label: string;
  sub: string;
  control: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <div>
        <p className="text-xs font-medium text-ink">{label}</p>
        <p className="text-[11px] text-ink-3">{sub}</p>
      </div>
      {control}
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-6 w-11 rounded-full transition-colors",
        checked ? "bg-accent" : "bg-panel-2 border border-line-strong",
        disabled && "opacity-50",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 size-5 rounded-full bg-white shadow transition-transform",
          checked ? "translate-x-5.5" : "translate-x-0.5",
        )}
      />
    </button>
  );
}

function UsersTab() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => api<{ items: UserInfo[] }>("/users"),
  });
  return (
    <Card>
      <CardHeader
        icon={<Users className="size-4" />}
        title="Users"
        sub="Roles gate module access; clearance + grants gate documents. The two are independent."
      />
      <div className="p-3">
        {isLoading ? (
          <CardSkeleton rows={6} />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Email</Th>
                <Th>Department</Th>
                <Th>Roles</Th>
                <Th>Clearance</Th>
              </tr>
            </thead>
            <tbody>
              {data?.items.map((u) => (
                <tr key={u.id} className="hover:bg-panel-2">
                  <Td className="font-medium text-ink">
                    {u.name}
                    <span className="block text-[10.5px] font-normal text-ink-3">{u.title}</span>
                  </Td>
                  <Td className="font-mono text-[11px]">{u.email}</Td>
                  <Td>{u.department ?? "—"}</Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      {u.roles.map((r) => (
                        <Badge key={r} tone={r === "employee" ? "neutral" : "accent"}>
                          {r.replace(/_/g, " ")}
                        </Badge>
                      ))}
                    </div>
                  </Td>
                  <Td>
                    <Badge tone={u.clearance_level >= 3 ? "crit" : u.clearance_level === 2 ? "warn" : "neutral"}>
                      L{u.clearance_level}
                    </Badge>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>
    </Card>
  );
}

function DepartmentsTab() {
  const { data, isLoading } = useQuery({
    queryKey: ["departments"],
    queryFn: () => api<{ items: { id: string; name: string; slug: string }[] }>("/departments"),
  });
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {isLoading && <CardSkeleton />}
      {data?.items.map((d) => (
        <Card key={d.id} className="flex items-center gap-3 p-4">
          <span className="flex size-9 items-center justify-center rounded-lg bg-panel-2 text-ink-2">
            <Building2 className="size-4" />
          </span>
          <div>
            <p className="text-sm font-medium text-ink">{d.name}</p>
            <p className="font-mono text-[10.5px] text-ink-3">{d.slug}</p>
          </div>
        </Card>
      ))}
    </div>
  );
}
