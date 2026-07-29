"use client";

import { useSession } from "@/components/providers";
import { Badge, Button, Card, Input } from "@/components/ui";
import { api, setStoredUser, setToken } from "@/lib/api";
import type { UserInfo } from "@brainchain/shared";
import { Brain, Lock, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";

const PERSONAS = [
  { email: "avery.chen@heliosaerodyne.com", name: "Avery Chen", role: "Employee · Engineering" },
  { email: "morgan.reyes@heliosaerodyne.com", name: "Morgan Reyes", role: "Manager · Program Mgmt" },
  { email: "jordan.blake@heliosaerodyne.com", name: "Jordan Blake", role: "Executive · COO" },
  { email: "taylor.brooks@heliosaerodyne.com", name: "Taylor Brooks", role: "Agent Approver" },
  { email: "sam.okafor@heliosaerodyne.com", name: "Sam Okafor", role: "Data Steward" },
  { email: "riley.novak@heliosaerodyne.com", name: "Riley Novak", role: "Security Admin" },
  { email: "casey.kim@heliosaerodyne.com", name: "Casey Kim", role: "System Admin" },
];

export default function LoginPage() {
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("brainchain-demo");
  const [error, setError] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const router = useRouter();
  const { setUser } = useSession();

  const submit = async (e?: React.FormEvent, overrideEmail?: string) => {
    e?.preventDefault();
    setError("");
    setLoading(true);
    try {
      const resp = await api<{ token: string; user: UserInfo }>("/auth/login", {
        method: "POST",
        body: { email: overrideEmail ?? email, password },
      });
      setToken(resp.token);
      setStoredUser(resp.user);
      setUser(resp.user);
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="grid w-full max-w-4xl gap-6 md:grid-cols-[1fr_1.1fr]">
        <div className="flex flex-col justify-center">
          <div className="mb-5 flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-xl bg-accent text-accent-ink">
              <Brain className="size-6" />
            </span>
            <div>
              <h1 className="text-xl font-semibold text-ink">BrainChain</h1>
              <p className="text-xs text-ink-3">Company intelligence, permission-aware.</p>
            </div>
          </div>
          <Card className="p-5">
            <form onSubmit={submit} className="space-y-3">
              <div>
                <label htmlFor="email" className="mb-1 block text-xs font-medium text-ink-2">
                  Work email
                </label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@heliosaerodyne.com"
                  required
                />
              </div>
              <div>
                <label htmlFor="password" className="mb-1 block text-xs font-medium text-ink-2">
                  Password
                </label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              {error && <p className="text-xs text-crit">{error}</p>}
              <Button type="submit" className="w-full" disabled={loading}>
                <Lock className="size-3.5" />
                {loading ? "Signing in…" : "Sign in"}
              </Button>
              <p className="flex items-center gap-1.5 text-[11px] text-ink-3">
                <ShieldCheck className="size-3.5 text-good" />
                Local authentication for the MVP — architecture is SSO-ready (OIDC/SAML).
              </p>
            </form>
          </Card>
        </div>

        <Card className="p-5">
          <h2 className="text-sm font-semibold text-ink">Demo personas</h2>
          <p className="mt-0.5 text-xs text-ink-3">
            Helios Aerodyne (fictional aerospace &amp; defense). Every account uses the seeded
            password <code className="rounded bg-panel-2 px-1 font-mono">brainchain-demo</code>.
            Each role sees different information — try the same question as Avery and Morgan.
          </p>
          <ul className="mt-3 space-y-1.5">
            {PERSONAS.map((p) => (
              <li key={p.email}>
                <button
                  onClick={() => {
                    setEmail(p.email);
                    void submit(undefined, p.email);
                  }}
                  className="flex w-full items-center gap-3 rounded-lg border border-line px-3 py-2 text-left transition-colors hover:border-accent hover:bg-accent-soft/40"
                >
                  <span className="flex size-7 items-center justify-center rounded-full bg-panel-2 text-[11px] font-semibold text-ink">
                    {p.name.split(" ").map((x) => x[0]).join("")}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium text-ink">{p.name}</span>
                    <span className="block truncate text-[11px] text-ink-3">{p.email}</span>
                  </span>
                  <Badge tone="accent">{p.role}</Badge>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
