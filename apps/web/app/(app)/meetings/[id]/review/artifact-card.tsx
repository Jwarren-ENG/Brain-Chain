"use client";

import { Badge, Button, Card, StatusChip, Textarea } from "@/components/ui";
import { Check, X } from "lucide-react";
import * as React from "react";

/** Loose, presentation-only shape — a superset of every kind's fields from
 * `MeetingReviewPayload` (packages/shared), normalized by the review page so
 * one component can render decisions, actions, risks, and questions. Kept
 * separate from the strict shared payload types (whose per-kind interfaces
 * require fields like `alternatives`/`decided_by`) so callers — including
 * tests — can pass just the fields relevant to a given kind. */
export type ReviewTurn = { idx: number; speaker: string; text: string };
export type ReviewArtifactView = {
  id?: string;
  task_id?: string;
  rid?: string;
  qid?: string;
  kind: "decision" | "action" | "risk" | "question";
  title?: string;
  text?: string;
  rationale?: string;
  owner_name?: string;
  due_hint?: string;
  decided_by?: string;
  raised_by?: string;
  status: string;
  turns: ReviewTurn[];
};

const KIND_LABEL: Record<ReviewArtifactView["kind"], string> = {
  decision: "Decision",
  action: "Action item",
  risk: "Risk",
  question: "Open question",
};

export function ArtifactCard({
  artifact,
  canReview,
  onResolve,
}: {
  artifact: ReviewArtifactView;
  canReview: boolean;
  onResolve: (action: "approve" | "reject", edits: Record<string, string>) => void;
}) {
  const [rationale, setRationale] = React.useState(artifact.rationale ?? "");
  const label = artifact.title ?? artifact.text ?? "";
  const pending = artifact.status === "proposed";
  const attribution = artifact.decided_by || artifact.owner_name || artifact.raised_by;

  return (
    <Card className="space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone="accent">{KIND_LABEL[artifact.kind]}</Badge>
        <StatusChip status={artifact.status} />
        {attribution && <span className="ml-auto text-[11px] text-ink-3">{attribution}</span>}
      </div>

      <p className="text-sm font-semibold leading-snug text-ink">{label}</p>

      {artifact.kind === "decision" &&
        (pending && canReview ? (
          <label className="block text-xs font-medium text-ink-2">
            Why (rationale)
            <Textarea
              className="mt-1"
              rows={2}
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
            />
          </label>
        ) : (
          <p className="text-xs leading-relaxed text-ink-3">
            {artifact.rationale || "No rationale recorded."}
          </p>
        ))}

      {artifact.turns.length > 0 && (
        <div className="space-y-1.5">
          {artifact.turns.map((t) => (
            <blockquote
              key={t.idx}
              className="rounded-lg border-l-2 border-accent bg-panel-2 px-3 py-2 text-xs leading-relaxed text-ink-2"
            >
              <cite className="not-italic font-medium text-ink">{t.speaker}</cite>: {t.text}
            </blockquote>
          ))}
        </div>
      )}

      {pending && canReview && (
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="success"
            onClick={() => onResolve("approve", artifact.kind === "decision" ? { rationale } : {})}
          >
            <Check className="size-3.5" /> Approve
          </Button>
          <Button size="sm" variant="danger" onClick={() => onResolve("reject", {})}>
            <X className="size-3.5" /> Reject
          </Button>
        </div>
      )}
    </Card>
  );
}
