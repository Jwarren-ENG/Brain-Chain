"use client";

import { Spinner } from "@/components/ui";
import * as React from "react";
import { ChatHome } from "./chat/chat-home";

export default function HomePage() {
  return (
    <React.Suspense fallback={<Spinner label="Loading…" />}>
      <ChatHome />
    </React.Suspense>
  );
}
