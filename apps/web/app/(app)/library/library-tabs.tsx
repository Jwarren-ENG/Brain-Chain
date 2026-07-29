"use client";

import { Tabs } from "@/components/ui";
import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";

/**
 * Lives in its own file (not `page.tsx`) because Next's App Router only
 * allows a fixed set of named exports from a `page.tsx` file (`default`,
 * `metadata`, etc.) — `next build` rejects any other named export.
 */
export function LibraryTabs({
  browse,
  company,
  decisions,
}: {
  browse: React.ReactNode;
  company: React.ReactNode;
  decisions?: React.ReactNode;
}) {
  const params = useSearchParams();
  const router = useRouter();
  const tab = params.get("tab") ?? "browse";

  const tabs = [
    { key: "browse", label: "Browse" },
    { key: "company", label: "Company" },
    ...(decisions ? [{ key: "decisions", label: "Decisions" }] : []),
  ];

  const handleChange = (key: string) => {
    const qs = new URLSearchParams(params);
    qs.set("tab", key);
    router.replace(`/library?${qs.toString()}`);
  };

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <Tabs tabs={tabs} value={tab} onChange={handleChange} />
      {tab === "browse" && browse}
      {tab === "company" && company}
      {tab === "decisions" && decisions}
    </div>
  );
}
