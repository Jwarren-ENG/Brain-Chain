"use client";
import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";

export default function TribalRedirect() {
  const router = useRouter();
  const params = useSearchParams();
  React.useEffect(() => {
    const qs = new URLSearchParams(params);
    qs.set("tab", "decisions");
    router.replace(`/library?${qs.toString()}`);
  }, [params, router]);
  return null;
}
