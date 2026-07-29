"use client";
import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";

export default function CompanyRedirect() {
  const router = useRouter();
  const params = useSearchParams();
  React.useEffect(() => {
    const qs = new URLSearchParams(params);
    qs.set("tab", "company");
    router.replace(`/library?${qs.toString()}`);
  }, [params, router]);
  return null;
}
