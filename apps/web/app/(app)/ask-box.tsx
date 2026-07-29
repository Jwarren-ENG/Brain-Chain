"use client";

import { Button, Input } from "@/components/ui";
import { ASSISTANT_NAME } from "@/lib/brand";
import { useRouter } from "next/navigation";
import * as React from "react";

/**
 * The single large ask input. Deliberately self-contained: it only needs the
 * router (no data fetch of its own) so it can render — and work — even when
 * every other query on the landing page has failed.
 *
 * Lives in its own file (not `page.tsx`) because Next's App Router only
 * allows a fixed set of named exports from a `page.tsx` file (`default`,
 * `metadata`, etc.) — `next build` rejects any other named export.
 */
export function AskBox({ suggested }: { suggested: string[] }) {
  const router = useRouter();
  const [question, setQuestion] = React.useState("");

  const ask = (value: string) => {
    const trimmed = value.trim();
    if (trimmed) router.push(`/ask?q=${encodeURIComponent(trimmed)}`);
  };

  return (
    <div>
      <form
        className="flex items-center gap-3 rounded-xl border border-line-strong bg-panel p-1.5 pl-[18px]"
        onSubmit={(event) => {
          event.preventDefault();
          ask(question);
        }}
      >
        <Input
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder={`Ask ${ASSISTANT_NAME} anything about your company…`}
          aria-label={`Ask ${ASSISTANT_NAME} anything about your company`}
          className="h-auto min-w-0 flex-1 border-0 bg-transparent px-0 py-2.5 text-[14.5px] focus:border-0"
        />
        <Button type="submit" className="px-[18px]">
          Ask
        </Button>
      </form>
      {suggested.length > 0 && (
        <div className="mt-3.5 flex flex-wrap gap-2">
          {suggested.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => ask(prompt)}
              className="rounded-full border border-line px-3 py-1.5 text-[11px] text-ink-3 transition-colors hover:border-line-strong hover:text-ink"
            >
              {prompt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
