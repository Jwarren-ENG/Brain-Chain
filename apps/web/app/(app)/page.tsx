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

  // The bare "/" case needs one extra bit of care: Next hands back a
  // brand-new `URLSearchParams` instance on EVERY navigation — even a
  // `router.push("/")` fired while already sitting on the bare "/" with no
  // `c`/`q` (e.g. "+ New chat" clicked on a thread that was typed straight
  // into the composer and never touched the URL at all). A key derived from
  // string content alone would read `"new"` both before and after that
  // click, so React would never remount `ChatHome` and the thread would
  // silently survive "+ New chat" — this is exactly the defect the fix
  // history above (F3) describes. `identityRef` remembers the last `params`
  // instance actually seen; when the bare "/" recurs behind a new instance,
  // it bumps a nonce so the key still changes even though its text doesn't.
  // `c`/`q` changes already change the key via their own content, so the
  // nonce only needs to move for the content-invariant bare case.
  const identityRef = React.useRef<{ params: URLSearchParams; nonce: number }>({
    params,
    nonce: 0,
  });
  if (identityRef.current.params !== params) {
    const nonce = !c && !q ? identityRef.current.nonce + 1 : identityRef.current.nonce;
    identityRef.current = { params, nonce };
  }

  const key = c ?? (q ? `q:${q}` : `new:${identityRef.current.nonce}`);
  return <ChatHome key={key} />;
}

export default function HomePage() {
  return (
    <React.Suspense fallback={<Spinner label="Loading…" />}>
      <HomePageInner />
    </React.Suspense>
  );
}
