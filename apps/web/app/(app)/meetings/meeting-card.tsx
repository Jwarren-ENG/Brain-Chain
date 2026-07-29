"use client";

import { Button, Card } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import type { MeetingInfo } from "@brainchain/shared";
import {
  CalendarDays,
  CircleHelp,
  Landmark,
  ListChecks,
  Mic2,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import * as React from "react";

export function MeetingCard({
  meeting,
  onOpen,
  onReflect,
}: {
  meeting: MeetingInfo;
  onOpen: () => void;
  onReflect: () => void;
}) {
  const extraction = meeting.extraction;
  return (
    <Card className="p-4 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <button onClick={onOpen} className="min-w-0 text-left">
          <p className="text-sm font-semibold text-ink hover:text-accent">{meeting.title}</p>
          <p className="mt-1 flex items-center gap-1.5 text-[11px] text-ink-3">
            <CalendarDays className="size-3" /> {formatDate(meeting.held_at)} · {meeting.attendees.length} attendees · via {meeting.source}
          </p>
        </button>
        <div className="flex items-center gap-2">
          <Link
            href={`/interviews/new?purpose=meeting_prep&meeting=${meeting.id}`}
            className="text-xs font-medium text-accent hover:underline"
          >
            Contribute a topic
          </Link>
          <Link
            href={`/meetings/${meeting.id}/review`}
            className="text-xs font-medium text-accent hover:underline"
          >
            Review knowledge
          </Link>
          <Button variant="secondary" size="sm" onClick={onReflect}>
            <Mic2 className="size-3.5" /> Share reflection
          </Button>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <ExtractStat icon={<Landmark className="size-3.5" />} label="Decisions" value={extraction.decisions?.length ?? 0} />
        <ExtractStat icon={<ListChecks className="size-3.5" />} label="Actions" value={(extraction.actions ?? extraction.action_items)?.length ?? 0} />
        <ExtractStat icon={<TriangleAlert className="size-3.5" />} label="Risks" value={extraction.risks?.length ?? 0} warn />
        <ExtractStat icon={<CircleHelp className="size-3.5" />} label="Questions" value={(extraction.questions ?? extraction.open_questions)?.length ?? 0} />
      </div>
    </Card>
  );
}

function ExtractStat({ icon, label, value, warn }: { icon: React.ReactNode; label: string; value: number; warn?: boolean }) {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-panel-2 px-3 py-2">
      <span className={warn && value ? "text-warn" : "text-ink-3"}>{icon}</span>
      <div>
        <p className="text-sm font-semibold tabular-nums text-ink">{value}</p>
        <p className="text-[10px] text-ink-3">{label}</p>
      </div>
    </div>
  );
}
