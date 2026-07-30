"use client";

import { Button, Textarea } from "@/components/ui";
import { Send } from "lucide-react";
import * as React from "react";

/**
 * The bottom-of-thread input: `[plusSlot] [textarea] [send button]`. Enter
 * submits; Shift+Enter inserts a newline. Trims on submit, ignores
 * whitespace-only input, and clears itself after a successful send.
 */
export function Composer({
  onSend,
  disabled,
  plusSlot,
}: {
  onSend: (text: string) => void;
  disabled?: boolean;
  plusSlot?: React.ReactNode;
}) {
  const [value, setValue] = React.useState("");

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
  };

  return (
    <form
      className="sticky bottom-4 mt-5 flex items-end gap-2 rounded-2xl border border-line-strong bg-panel p-2 shadow-lg"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {plusSlot}
      <Textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        placeholder="Ask a question about company knowledge…"
        aria-label="Question"
        rows={1}
        disabled={disabled}
        className="max-h-40 min-h-9.5 flex-1 resize-none border-0 bg-transparent shadow-none focus:border-0"
      />
      <Button type="submit" className="h-9.5 shrink-0" disabled={disabled || !value.trim()}>
        <Send className="size-4" />
      </Button>
    </form>
  );
}
