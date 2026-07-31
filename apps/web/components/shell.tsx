"use client";

import { api, setStoredUser, setToken } from "@/lib/api";
import { ASSISTANT_NAME } from "@/lib/brand";
import { cn, hasRole } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import {
  FileSearch,
  LogOut,
  MessageSquare,
  Moon,
  Plus,
  Search,
  Settings,
  Sparkles,
  Sun,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { useSession, useTheme } from "./providers";
import { Badge } from "./ui";

interface NavItem {
  href: string;
  label: string;
  roles?: string[];
  badgeKey?: "work";
}

interface ConversationSummary {
  id: string;
  title: string;
  created_at: string;
}

/* The top-of-page surface switcher (ChatGPT-app style): employees see two
   surfaces only — talk to the Curator, or review the meetings it attended.
   The tasks page is gone from the employee surface entirely (action items
   live in the company's own PM tools; see the Curator spec §1.5). */
export const SWITCHER_ITEMS: NavItem[] = [
  { href: "/", label: "Chat" },
  { href: "/meetings", label: "Meetings" },
];

/** Admin/manage surfaces, relocated out of the sidebar into the gear menu. Role arrays copied verbatim from the prior NAV. */
export const GEAR_ITEMS: NavItem[] = [
  { href: "/insights", label: "Team signals", roles: ["manager", "executive", "security_admin"] },
  { href: "/integrations", label: "Connected sources", roles: ["data_steward", "system_admin", "security_admin"] },
  { href: "/governance", label: "Data governance", roles: ["data_steward", "system_admin", "security_admin"] },
  { href: "/policies", label: "Model policies", roles: ["security_admin", "system_admin"] },
  { href: "/audit", label: "Audit log", roles: ["security_admin", "system_admin"] },
  { href: "/admin", label: "Administration", roles: ["system_admin", "security_admin"] },
  { href: "/brain-map", label: "Brain map", roles: ["manager", "executive", "security_admin"] },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const { user, setUser } = useSession();
  const { theme, setTheme } = useTheme();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeConversationId = searchParams.get("c");
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const [gearOpen, setGearOpen] = React.useState(false);

  const { data: conversations } = useQuery({
    queryKey: ["conversations"],
    queryFn: () => api<{ items: ConversationSummary[] }>("/conversations"),
    enabled: !!user,
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

  // "+ New chat" must land on a URL that's distinguishable from whatever bare
  // "/" the user is already sitting on — a plain `router.push("/")` from
  // bare "/" returns the SAME memoized `searchParams` instance from Next
  // (identity, not content, is what changed previously), so a thread typed
  // straight into the composer never cleared. Appending an explicit,
  // always-fresh `?n=<timestamp>` makes the new-chat navigation a genuine
  // URL *content* change every time, which `HomePage`'s remount key can key
  // off directly. The logo click intentionally starts a fresh chat too
  // (ChatGPT-like semantics: clicking the brand while mid-thread returns you
  // to a blank home, not just "the same conversation, again").
  const goNewChat = () => router.push(`/?n=${Date.now()}`);

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

  const gearItems = GEAR_ITEMS.filter((item) => !item.roles || hasRole(user, ...item.roles));

  return (
    <div className="flex min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[236px] flex-col border-r border-line bg-bg px-3 pb-4 pt-5 md:flex">
        <Link
          href="/"
          onClick={(e) => {
            e.preventDefault();
            goNewChat();
          }}
          className="flex items-center gap-2.5 px-2.5 pb-4"
        >
          <span className="flex size-[26px] items-center justify-center rounded-lg bg-btn text-[13px] font-semibold tracking-[-0.02em] text-btn-ink">
            B
          </span>
          <span className="text-[14.5px] font-semibold tracking-[-0.01em] text-ink">BrainChain</span>
        </Link>

        <button
          onClick={goNewChat}
          className="mb-3 flex items-center gap-2.5 rounded-[7px] border border-line px-2.5 py-[7px] text-[13.5px] font-medium text-ink-2 transition-colors hover:border-line-strong hover:bg-panel-2/60 hover:text-ink"
        >
          <Plus className="size-3.5" />
          New chat
        </button>

        <nav className="flex-1 overflow-y-auto scroll-thin" aria-label="Conversation history">
          {conversations && conversations.items.length === 0 ? (
            <p className="px-2.5 py-2 text-[12.5px] text-ink-3">No conversations yet</p>
          ) : (
            <ul className="space-y-0.5">
              {(conversations?.items ?? []).map((conversation) => {
                const active = conversation.id === activeConversationId;
                return (
                  <li key={conversation.id}>
                    <Link
                      href={`/?c=${conversation.id}`}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-2 rounded-[7px] px-2.5 py-[7px] text-[13px] transition-colors",
                        active
                          ? "bg-panel-2 font-semibold text-ink"
                          : "font-normal text-ink-2 hover:bg-panel-2/60 hover:text-ink",
                      )}
                    >
                      <MessageSquare className="size-3.5 shrink-0 text-ink-3" aria-hidden />
                      <span className="truncate">{conversation.title}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </nav>

        <div className="space-y-0.5 border-t border-line pt-2">
          <Link
            href="/library"
            className="block px-2.5 py-1.5 text-[12.5px] text-ink-3 transition-colors hover:text-ink"
          >
            Library
          </Link>
          {gearItems.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setGearOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={gearOpen}
                className="flex w-full items-center gap-2.5 rounded-[7px] px-2.5 py-[7px] text-[13.5px] font-normal text-ink-2 transition-colors hover:bg-panel-2/60 hover:text-ink"
              >
                <Settings className="size-3.5 text-ink-3" aria-hidden />
                Settings
              </button>
              {gearOpen && (
                <>
                  <button
                    type="button"
                    aria-hidden="true"
                    tabIndex={-1}
                    className="fixed inset-0 z-10 cursor-default"
                    onClick={() => setGearOpen(false)}
                  />
                  <div
                    role="menu"
                    className="absolute bottom-full left-0 z-20 mb-2 w-56 rounded-xl border border-line bg-panel p-1.5 shadow-lg"
                  >
                    {gearItems.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        role="menuitem"
                        onClick={() => setGearOpen(false)}
                        className="block truncate rounded-lg px-2.5 py-2 text-[13px] text-ink-2 transition-colors hover:bg-panel-2 hover:text-ink"
                      >
                        {item.label}
                      </Link>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

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
        <header className="flex h-12 flex-none items-center gap-3 px-5 md:px-10">
          <nav
            aria-label="Surface"
            className="mx-auto flex items-center gap-1 rounded-full border border-line bg-panel p-1"
          >
            {SWITCHER_ITEMS.map((item) => {
              const active =
                item.href === "/" ? !pathname.startsWith("/meetings") : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "rounded-full px-4 py-1 text-[13px] transition-colors",
                    active
                      ? "bg-btn font-semibold text-btn-ink"
                      : "font-medium text-ink-2 hover:text-ink",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
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
                go(`/?q=${encodeURIComponent(query.trim())}`);
              }
              if (e.key === "Escape") onClose();
            }}
            placeholder={`Search knowledge, or press Enter to ask ${ASSISTANT_NAME}...`}
            className="h-12 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-3"
          />
        </div>
        <div className="max-h-80 overflow-y-auto scroll-thin p-2">
          {query.trim().length > 2 && (
            <button
              onClick={() => go(`/?q=${encodeURIComponent(query.trim())}`)}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm text-ink hover:bg-panel-2"
            >
              <Sparkles className="size-4 text-accent" />
              Ask {ASSISTANT_NAME}: <span className="font-medium">“{query.trim()}”</span>
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
