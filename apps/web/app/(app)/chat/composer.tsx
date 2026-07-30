"use client";

import { Button, Textarea } from "@/components/ui";
import { Send } from "lucide-react";
import * as React from "react";

/**
 * The bottom-of-thread input: `[plusSlot] [textarea] [send button]`. Enter
 * submits; Shift+Enter inserts a newline. Trims on submit, ignores
 * whitespace-only input, and clears itself after a successful send.
 *
 * Deliberately unstyled as a "panel" (no sticky positioning, border, or
 * background) — it's meant to sit inside a parent row that supplies that
 * chrome alongside sibling controls (e.g. the mode `<Select>` in
 * `ChatHome`). `position: sticky` in particular only works when applied to
 * that outer row: this form's own containing block would otherwise be sized
 * to the form itself, leaving sticky nothing to stick within.
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
      className="flex flex-1 items-end gap-2"
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
