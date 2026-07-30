"use client";
import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";

export default function AskRedirect() {
  const router = useRouter();
  const params = useSearchParams();
  React.useEffect(() => {
    const qs = new URLSearchParams(params);
    const suffix = qs.toString();
    router.replace(suffix ? `/?${suffix}` : "/");
  }, [params, router]);
  return null;
}
