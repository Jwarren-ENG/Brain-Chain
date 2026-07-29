"use client";

import { useSession } from "@/components/providers";
import { Spinner } from "@/components/ui";
import { hasRole } from "@/lib/utils";
import * as React from "react";
import CompanyContent from "../company/company-content";
import ExplorerContent from "../explorer/explorer-content";
import TribalContent from "../tribal/tribal-content";
import { LibraryTabs } from "./library-tabs";

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
