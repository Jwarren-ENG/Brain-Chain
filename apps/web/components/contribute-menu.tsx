"use client";

import { ImportTranscriptDialog } from "@/app/(app)/meetings/import-dialog";
import { Button } from "@/components/ui";
import { ASSISTANT_NAME } from "@/lib/brand";
import { hasRole } from "@/lib/utils";
import type { Classification, MeetingImportResponse, UserInfo } from "@brainchain/shared";
import { MessageCircleMore, Plus, ShieldAlert, Upload } from "lucide-react";
import Link from "next/link";
import * as React from "react";

/**
 * The single "Contribute" entry point, shared by the landing page and the
 * meetings page. A button that opens a small menu with up to three items:
 * import a meeting (role-gated), tell the assistant, or leave protected
 * feedback. Lives outside any `page.tsx` because Next's App Router rejects
 * non-page named exports from page files at build time.
 */
export function ContributeMenu({
  user,
  onImported,
  importFn,
  classifications,
}: {
  user: Pick<UserInfo, "roles"> | null;
  onImported: (result: MeetingImportResponse) => void;
  importFn: (form: FormData) => Promise<MeetingImportResponse>;
  classifications: Classification[];
}) {
  const [open, setOpen] = React.useState(false);
  const [importOpen, setImportOpen] = React.useState(false);
  const canImport = hasRole(user, "manager", "data_steward", "system_admin");

  return (
    <div className="relative inline-block">
      <Button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Plus className="size-3.5" /> Contribute
      </Button>

      {open && (
        <>
          {/* Click-away layer. */}
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div
            role="menu"
            className="absolute right-0 top-full z-20 mt-2 w-64 rounded-xl border border-line bg-panel p-1.5 shadow-lg"
          >
            {canImport && (
              <MenuButton
                icon={<Upload className="size-4" />}
                title="Import a meeting"
                blurb={`Upload a transcript for ${ASSISTANT_NAME} to capture and review.`}
                onClick={() => {
                  setOpen(false);
                  setImportOpen(true);
                }}
              />
            )}
            <MenuLink
              href="/interviews/new"
              icon={<MessageCircleMore className="size-4" />}
              title={`Tell ${ASSISTANT_NAME}`}
              blurb="Capture something only you know, in your own words."
              onClick={() => setOpen(false)}
            />
            <MenuLink
              href="/feedback"
              icon={<ShieldAlert className="size-4" />}
              title="Protected feedback"
              blurb="Named, confidential, or anonymous."
              onClick={() => setOpen(false)}
            />
          </div>
        </>
      )}

      {canImport && (
        <ImportTranscriptDialog
          open={importOpen}
          onClose={() => setImportOpen(false)}
          classifications={classifications}
          onImported={onImported}
          importFn={importFn}
        />
      )}
    </div>
  );
}

function MenuButton({
  icon,
  title,
  blurb,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  blurb: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex w-full items-start gap-2.5 rounded-lg p-2 text-left transition-colors hover:bg-panel-2"
    >
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-panel-2 text-accent">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-xs font-semibold text-ink">{title}</span>
        <span className="mt-0.5 block text-[10.5px] leading-relaxed text-ink-3">{blurb}</span>
      </span>
    </button>
  );
}

function MenuLink({
  href,
  icon,
  title,
  blurb,
  onClick,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  blurb: string;
  onClick: () => void;
}) {
  return (
    <Link
      href={href}
      role="menuitem"
      onClick={onClick}
      className="flex items-start gap-2.5 rounded-lg p-2 transition-colors hover:bg-panel-2"
    >
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-panel-2 text-accent">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-xs font-semibold text-ink">{title}</span>
        <span className="mt-0.5 block text-[10.5px] leading-relaxed text-ink-3">{blurb}</span>
      </span>
    </Link>
  );
}
