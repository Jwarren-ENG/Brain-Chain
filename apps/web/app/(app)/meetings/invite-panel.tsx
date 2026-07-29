"use client";
import * as React from "react";
import { ASSISTANT_NAME } from "../../../lib/brand";
import { Card, Badge } from "../../../components/ui";

export function InvitePanel({ importSlot }: { importSlot: React.ReactNode }) {
  return (
    <Card className="space-y-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-sm font-semibold text-ink">Invite {ASSISTANT_NAME} to your meetings</h2>
        <Badge tone="accent">next release</Badge>
      </div>
      <p className="text-sm leading-relaxed text-ink-2">
        {ASSISTANT_NAME[0].toUpperCase() + ASSISTANT_NAME.slice(1)} will join your Zoom, Meet, and
        Teams calls in the next release — listening, taking notes, and answering when called on.
        Today, import a recording or transcript and it remembers everything just the same.
      </p>
      <div>{importSlot}</div>
    </Card>
  );
}
