"use client";

import { api, setStoredUser, setToken } from "@/lib/api";
import { cn, hasRole } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { FileSearch, LogOut, Moon, Search, Sparkles, Sun } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import * as React from "react";
import { useSession, useTheme } from "./providers";
import { Badge } from "./ui";

interface NavItem {
  href: string;
  label: string;
  roles?: string[];
  badgeKey?: "work";
}

const NAV: { section: string; items: NavItem[] }[] = [
  {
    section: "Your workspace",
    items: [
      { href: "/", label: "Today" },
      { href: "/ask", label: "New chat" },
      { href: "/feedback", label: "Share feedback" },
      { href: "/meetings", label: "Meetings" },
      { href: "/interviews", label: "Interviews" },
      { href: "/approvals", label: "My work", badgeKey: "work" },
    ],
  },
  {
    section: "Company memory",
    items: [
      { href: "/explorer", label: "Browse knowledge" },
      { href: "/company", label: "Company context" },
    ],
  },
  {
    section: "Manage",
    items: [
      { href: "/insights", label: "Team signals", roles: ["manager", "executive", "security_admin"] },
      { href: "/tribal", label: "Decision memory", roles: ["manager", "executive", "security_admin"] },
      { href: "/agents", label: "Plans & agents", roles: ["manager", "executive", "agent_approver", "security_admin"] },
    ],
  },
  {
    section: "Platform",
    items: [
      { href: "/integrations", label: "Connected sources", roles: ["data_steward", "system_admin", "security_admin"] },
      { href: "/governance", label: "Data governance", roles: ["data_steward", "system_admin", "security_admin"] },
      { href: "/policies", label: "Model policies", roles: ["security_admin", "system_admin"] },
      { href: "/audit", label: "Audit log", roles: ["security_admin", "system_admin"] },
      { href: "/admin", label: "Administration", roles: ["system_admin", "security_admin"] },
    ],
  },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const { user, setUser } = useSession();
  const { theme, setTheme } = useTheme();
  const pathname = usePathname();
  const router = useRouter();
  const [paletteOpen, setPaletteOpen] = React.useState(false);

  const { data: workCount } = useQuery({
    queryKey: ["nav-work-count"],
    queryFn: async () => {
      const tasks = await api<{ items: unknown[] }>("/tasks", {
        params: { mine: true, status_filter: "open" },
      });
      return tasks.items.length;
    },
    enabled: !!user,
    staleTime: 60_000,
  });

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const logout = async () => {
    try {
      await api("/auth/logout", { method: "POST" });
    } catch {
      /* session may already be gone */
    }
    setToken(null);
    setStoredUser(null);
    setUser(null);
    router.push("/login");
  };

  if (!user) return null;

  const badges: Record<string, number | undefined> = { work: workCount };

  return (
    <div className="flex min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[236px] flex-col border-r border-line bg-bg px-3 pb-4 pt-5 md:flex">
        <div className="flex items-center gap-2.5 px-2.5 pb-5">
          <span className="flex size-[26px] items-center justify-center rounded-lg bg-btn text-[13px] font-semibold tracking-[-0.02em] text-btn-ink">
            B
          </span>
          <span className="text-[14.5px] font-semibold tracking-[-0.01em] text-ink">BrainChain</span>
        </div>
        <nav className="flex-1 overflow-y-auto scroll-thin" aria-label="Main">
          {NAV.map((group) => {
            const items = group.items.filter((item) => !item.roles || hasRole(user, ...item.roles));
            if (!items.length) return null;
            return (
              <div key={group.section} className="mb-4">
                <p className="px-2.5 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-3/80">
                  {group.section}
                </p>
                <ul className="space-y-0.5">
                  {items.map((item) => {
                    const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                    const badge = item.badgeKey ? badges[item.badgeKey] : undefined;
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          aria-current={active ? "page" : undefined}
                          className={cn(
                            "flex items-center justify-between gap-2.5 rounded-[7px] px-2.5 py-[7px] text-[13.5px] transition-colors",
                            active
                              ? "bg-panel-2 font-semibold text-ink"
                              : "font-normal text-ink-2 hover:bg-panel-2/60 hover:text-ink",
                          )}
                        >
                          <span className="flex min-w-0 items-center gap-2.5">
                            <span
                              className={cn(
                                "size-[5px] shrink-0 rounded-full",
                                active ? "bg-accent" : "bg-transparent",
                              )}
                              aria-hidden
                            />
                            <span className="truncate">{item.label}</span>
                          </span>
                          {badge !== undefined && badge > 0 && (
                            <span className="rounded-[5px] bg-panel-2 px-1.5 py-px font-mono text-[10.5px] text-ink-3">
                              {badge}
                            </span>
                          )}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </nav>
        <div className="flex items-center gap-2.5 border-t border-line px-2.5 pt-3.5">
          <span className="flex size-[30px] shrink-0 items-center justify-center rounded-full bg-panel-2 text-[11.5px] font-semibold text-ink-2">
            {user.name.split(" ").map((p) => p[0]).join("").slice(0, 2)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium text-ink">{user.name}</p>
            <p className="truncate text-[11.5px] text-ink-3">
              {user.roles.filter((r) => r !== "employee")[0]?.replace(/_/g, " ") ?? "employee"}
            </p>
          </div>
          <button
            onClick={logout}
            aria-label="Log out"
            title="Log out"
            className="rounded-md p-1.5 text-ink-3 hover:bg-panel-2 hover:text-ink"
          >
            <LogOut className="size-4" />
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col md:pl-[236px]">
        <header className="flex h-12 flex-none items-center justify-end gap-3 px-5 md:px-10">
          <span className="mr-auto inline-flex items-center gap-2 text-xs text-ink-3 md:mr-0">
            <span className="size-1.5 rounded-full bg-[#3fb27f]" aria-hidden />
            Company brain up to date
          </span>
          <button
            onClick={() => setPaletteOpen(true)}
            aria-label="Search (Command K)"
            className="inline-flex items-center gap-2 rounded-[7px] border border-line px-2.5 py-1.5 text-xs text-ink-3 hover:border-line-strong hover:text-ink"
          >
            <Search className="size-3.5" />
            <kbd className="font-mono text-[10.5px]">⌘K</kbd>
          </button>
          <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            aria-label="Toggle theme"
            className="rounded-[7px] border border-line p-1.5 text-ink-3 hover:border-line-strong hover:text-ink"
          >
            {theme === "dark" ? <Sun className="size-3.5" /> : <Moon className="size-3.5" />}
          </button>
        </header>
        <main className="flex-1 px-5 pb-16 pt-4 md:px-10">{children}</main>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}

/* -------------------------------------------------------- command palette */
function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = React.useState("");
  const router = useRouter();
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (open) {
      setQuery("");
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  const { data } = useQuery({
    queryKey: ["palette-search", query],
    queryFn: () =>
      api<{ results: { document: { id: string; title: string; doc_type: string } }[] }>(
        "/search",
        { params: { q: query, limit: 6 } },
      ),
    enabled: open && query.trim().length > 2,
  });

  if (!open) return null;

  const go = (path: string) => {
    onClose();
    router.push(path);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 pt-[12vh] backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Global search"
        className="w-full max-w-xl overflow-hidden rounded-xl border border-line-strong bg-panel shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-line px-4">
          <Search className="size-4 text-ink-3" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && query.trim()) {
                go(`/ask?q=${encodeURIComponent(query.trim())}`);
              }
              if (e.key === "Escape") onClose();
            }}
            placeholder="Search knowledge, or press Enter to ask the brain…"
            className="h-12 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-3"
          />
        </div>
        <div className="max-h-80 overflow-y-auto scroll-thin p-2">
          {query.trim().length > 2 && (
            <button
              onClick={() => go(`/ask?q=${encodeURIComponent(query.trim())}`)}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm text-ink hover:bg-panel-2"
            >
              <Sparkles className="size-4 text-accent" />
              Ask the brain: <span className="font-medium">“{query.trim()}”</span>
            </button>
          )}
          {data?.results.map((r) => (
            <button
              key={r.document.id}
              onClick={() => go(`/explorer?doc=${r.document.id}`)}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm text-ink-2 hover:bg-panel-2"
            >
              <FileSearch className="size-4 shrink-0 text-ink-3" />
              <span className="truncate">{r.document.title}</span>
              <Badge tone="neutral" className="ml-auto">
                {r.document.doc_type}
              </Badge>
            </button>
          ))}
          {query.trim().length <= 2 && (
            <p className="px-3 py-6 text-center text-xs text-ink-3">
              Type to search authorized knowledge. Results respect your permissions.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
