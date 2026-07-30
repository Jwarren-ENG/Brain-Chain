"use client";

import { Spinner } from "@/components/ui";
import { useSearchParams } from "next/navigation";
import * as React from "react";
import { ChatHome } from "./chat/chat-home";

// `ChatHome` is keyed on conversation identity so that a genuine identity
// change — a different `?c=<id>` conversation, a new `?q=<query>` palette
// ask, or a bare `/` ("+ New chat") — unmounts the old instance and mounts a
// fresh one, instead of relying on effects to detect and reconcile the
// change while staying mounted. That remount is what resets all of
// `ChatHome`'s local state (thread, conversation id, selection) for free,
// eliminating the class of races where an effect's re-render interleaves
// with an in-flight mutation. Continuing an existing conversation (sending a
// second message) does NOT change the key: `conversationId` is local state
// set by the ask response, not derived from the URL.
function HomePageInner() {
  const params = useSearchParams();
  const c = params.get("c");
  const q = params.get("q");

  // The bare "/" case needs an explicit disambiguator in the URL itself:
  // Next memoizes `useSearchParams()` on the canonical URL STRING, so a
  // `router.push("/")` fired while already sitting on bare "/" (e.g. "+ New
  // chat" clicked on a thread that was typed straight into the composer and
  // never touched the URL) returns the IDENTICAL `params` instance — no
  // render-time identity trick can detect that as a change, because nothing
  // actually changed. Instead, "+ New chat" (`shell.tsx`) pushes
  // `/?n=<timestamp>`, so the key is a pure function of URL CONTENT: `n`
  // supplies a fresh value on every new-chat click, same as `c`/`q` do for
  // their own cases.
  const key = c ?? (q ? `q:${q}` : `new:${params.get("n") ?? "0"}`);
  return <ChatHome key={key} />;
}

export default function HomePage() {
  return (
    <React.Suspense fallback={<Spinner label="Loading…" />}>
      <HomePageInner />
    </React.Suspense>
  );
}
