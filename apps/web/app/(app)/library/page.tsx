"use client";

import { useSession } from "@/components/providers";
import { Spinner, Tabs } from "@/components/ui";
import { hasRole } from "@/lib/utils";
import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import CompanyContent from "../company/company-content";
import ExplorerContent from "../explorer/explorer-content";
import TribalContent from "../tribal/tribal-content";

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

function LibraryPageInner() {
  const { user } = useSession();
  const canSeeDecisions = hasRole(user, "manager", "executive", "security_admin");

  return (
    <LibraryTabs
      browse={<ExplorerContent />}
      company={<CompanyContent />}
      decisions={canSeeDecisions ? <TribalContent /> : undefined}
    />
  );
}

export default function LibraryPage() {
  return (
    <React.Suspense fallback={<Spinner label="Loading…" />}>
      <LibraryPageInner />
    </React.Suspense>
  );
}
