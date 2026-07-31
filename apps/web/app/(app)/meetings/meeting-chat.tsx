"use client";

import { Composer } from "@/app/(app)/chat/composer";
import { Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { ASSISTANT_NAME_CAPITALIZED } from "@/lib/brand";
import type { MeetingInfo, Message } from "@brainchain/shared";
import { useMutation } from "@tanstack/react-query";
import * as React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/* A meeting-scoped conversation: same feel as the Chat tab, but every question
   is asked in the context of one meeting. Scoping happens by prefixing the
   query with the meeting's identity — honest and provider-agnostic (works for
   the keyless mock and real models alike). */
export function MeetingChat({
  meeting,
  suggestions,
}: {
  meeting: MeetingInfo;
  suggestions: string[];
}) {
  const [thread, setThread] = React.useState<{ role: "user" | "assistant"; text: string }[]>([]);
  const bottomRef = React.useRef<HTMLDivElement>(null);

  const askMutation = useMutation({
    mutationFn: (question: string) =>
      api<{ conversation_id: string; message: Message }>("/ask", {
        method: "POST",
        body: {
          query: `Regarding the meeting "${meeting.title}": ${question}`,
          mode: "direct",
        },
      }),
    onSuccess: (data) => {
      setThread((prev) => [...prev, { role: "assistant", text: data.message.content }]);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 60);
    },
    onError: () => {
      setThread((prev) => [
        ...prev,
        {
          role: "assistant",
          text: `${ASSISTANT_NAME_CAPITALIZED} couldn't answer just now — the service may be down. Try again in a moment.`,
        },
      ]);
    },
  });

  const send = (question: string) => {
    setThread((prev) => [...prev, { role: "user", text: question }]);
    askMutation.mutate(question);
  };

  return (
    <div className="flex min-h-[50vh] flex-col">
      <div className="flex-1 space-y-4">
        {thread.length === 0 && (
          <div className="flex flex-wrap justify-center gap-2 pt-8">
            {suggestions.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                className="rounded-full border border-line px-3.5 py-1.5 text-[12.5px] text-ink-2 transition-colors hover:border-accent hover:text-accent"
              >
                {s}
              </button>
            ))}
          </div>
        )}
        {thread.map((entry, index) =>
          entry.role === "user" ? (
            <div key={index} className="flex justify-end">
              <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-accent px-4 py-2.5 text-sm text-accent-ink">
                {entry.text}
              </div>
            </div>
          ) : (
            <div key={index} className="prose prose-sm max-w-none text-sm leading-relaxed text-ink-2">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{entry.text}</ReactMarkdown>
            </div>
          ),
        )}
        {askMutation.isPending && (
          <p className="flex items-center gap-2 text-xs text-ink-3">
            <Spinner /> Thinking…
          </p>
        )}
        <div ref={bottomRef} />
      </div>
      <div className="sticky bottom-4 mt-5 rounded-2xl border border-line-strong bg-panel p-2 shadow-lg">
        <Composer onSend={send} disabled={askMutation.isPending} />
      </div>
    </div>
  );
}
