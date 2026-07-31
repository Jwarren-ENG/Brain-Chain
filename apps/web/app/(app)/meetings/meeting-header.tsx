"use client";

import { formatDate } from "@/lib/utils";
import type { MeetingInfo } from "@brainchain/shared";
import Link from "next/link";
import * as React from "react";

/* Compact header above the meeting conversation: identity plus the few
   actions that still need their own surfaces (recap details, the review
   queue, pre-meeting topic contribution, reflection). */
export function MeetingHeader({
  meeting,
  onDetails,
  onReflect,
}: {
  meeting: MeetingInfo;
  onDetails: () => void;
  onReflect: () => void;
}) {
  return (
    <header className="mb-4 border-b border-line pb-3">
      <h1 className="text-lg font-semibold tracking-tight text-ink">{meeting.title}</h1>
      <p className="mt-0.5 text-xs text-ink-3">
        {formatDate(meeting.held_at)} · {meeting.attendees.length} attendees
      </p>
      <div className="mt-2 flex flex-wrap gap-3 text-[12px]">
        <button onClick={onDetails} className="text-accent hover:underline">
          Details
        </button>
        <Link href={`/meetings/${meeting.id}/review`} className="text-accent hover:underline">
          Review knowledge
        </Link>
        <Link
          href={`/interviews/new?purpose=meeting_prep&meeting=${meeting.id}`}
          className="text-accent hover:underline"
        >
          Contribute a topic
        </Link>
        <button onClick={onReflect} className="text-accent hover:underline">
          Reflect
        </button>
      </div>
    </header>
  );
}
