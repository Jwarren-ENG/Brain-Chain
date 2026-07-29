import { clsx, type ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "never";
  const secs = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 90) return "just now";
  const mins = secs / 60;
  if (mins < 90) return `${Math.round(mins)}m ago`;
  const hours = mins / 60;
  if (hours < 36) return `${Math.round(hours)}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export const classificationStyles: Record<string, string> = {
  Public: "bg-[#e6f6e6] text-[#1c6b1c] dark:bg-[#12331b] dark:text-[#69c76d]",
  Internal: "bg-[#e7effc] text-[#1d4fa8] dark:bg-[#152647] dark:text-[#7fabf2]",
  Confidential: "bg-[#fdf0dc] text-[#8a5a00] dark:bg-[#3a2a10] dark:text-[#e8b45a]",
  Restricted: "bg-[#fbe3e3] text-[#a12626] dark:bg-[#3d1518] dark:text-[#ef8f8f]",
};

export const docTypeLabels: Record<string, string> = {
  contract: "Contract",
  ticket: "Ticket",
  transcript: "Transcript",
  message: "Conversation",
  policy: "Policy",
  plan: "Plan",
  financial: "Financial",
  risk_register: "Risk register",
  roadmap: "Roadmap",
  procedure: "Procedure",
  note: "Note",
  decision_log: "Decision log",
  supplier: "Supplier",
  spend: "Spend",
};

export const sourceKindLabels: Record<string, string> = {
  jira: "Jira",
  zoom: "Zoom",
  slack: "Slack",
  teams: "Teams",
  email: "Email",
  gdrive: "Google Drive",
  sharepoint: "SharePoint",
  onedrive: "OneDrive",
  wiki: "Wiki",
  contracts: "Contracts",
  procurement: "Procurement",
  finance: "Finance",
  custom: "Custom",
  upload: "Upload",
};

export function hasRole(user: { roles: string[] } | null, ...roles: string[]): boolean {
  if (!user) return false;
  return roles.some((r) => user.roles.includes(r));
}

export function formatMoney(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${Math.round(value / 1_000)}K`;
  return `$${value}`;
}
