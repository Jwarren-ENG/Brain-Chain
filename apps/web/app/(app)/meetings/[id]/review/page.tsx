"use client";

import { useSession } from "@/components/providers";
import { Card, CardSkeleton, ErrorState, InfoNote } from "@/components/ui";
import { api } from "@/lib/api";
import { ASSISTANT_NAME, ASSISTANT_NAME_CAPITALIZED } from "@/lib/brand";
import { formatDate, hasRole } from "@/lib/utils";
import type { MeetingReviewPayload, ResolveArtifactRequest } from "@brainchain/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CalendarDays, RefreshCw, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import * as React from "react";
import { ArtifactCard, type ReviewArtifactView } from "./artifact-card";

const IMPORT_ROLES = ["manager", "data_steward", "system_admin"] as const;

export default function MeetingReviewPage() {
  const params = useParams<{ id: string }>();
  const meetingId = params.id;
  const { user } = useSession();
  const queryClient = useQueryClient();
  const canReview = hasRole(user, "manager", "executive");
  const canRetryExtraction = hasRole(user, ...IMPORT_ROLES);

  const query = useQuery({
    queryKey: ["meeting-review", meetingId],
    queryFn: () => api<MeetingReviewPayload>(`/meetings/${meetingId}/review`),
  });

  const resolve = useMutation({
    mutationFn: (body: ResolveArtifactRequest) =>
      api(`/meetings/${meetingId}/review/resolve`, { method: "POST", body }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["meeting-review", meetingId] }),
  });

  const retryExtraction = useMutation({
    mutationFn: () => api(`/meetings/${meetingId}/extract`, { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["meeting-review", meetingId] }),
  });

  // ERROR-FIRST: TanStack v5 keeps `isLoading` true alongside `isError` once a
  // query has settled with no cached data, so isError must be checked first
  // or a failed load renders as a permanent skeleton.
  if (query.isError) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <BackLink />
        <ErrorState
          message={
            query.error instanceof Error ? query.error.message : "Could not load this meeting."
          }
          onRetry={() => query.refetch()}
        />
      </div>
    );
  }

  if (query.isLoading || !query.data) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <BackLink />
        <CardSkeleton rows={4} />
        <CardSkeleton rows={3} />
      </div>
    );
  }

  const payload = query.data;
  const { meeting } = payload;
  const hasArtifacts =
    payload.decisions.length > 0 ||
    payload.actions.length > 0 ||
    payload.risks.length > 0 ||
    payload.questions.length > 0;
  const extractionError = meeting.extraction?.error;

  function resolveArtifact(
    kind: ResolveArtifactRequest["kind"],
    artifactId: string,
    action: "approve" | "reject",
    edits: Record<string, string>,
  ) {
    resolve.mutate({ kind, artifact_id: artifactId, action, edits });
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <BackLink />

      <header>
        <h1 className="text-lg font-semibold tracking-tight text-ink">{meeting.title}</h1>
        <p className="mt-1 flex items-center gap-1.5 text-xs text-ink-3">
          <CalendarDays className="size-3.5" /> {formatDate(meeting.held_at)} ·{" "}
          {meeting.attendees.length} attendees
        </p>
        {payload.summary && (
          <p className="mt-2 text-sm leading-relaxed text-ink-2">{payload.summary}</p>
        )}
      </header>

      {!canReview && (
        <InfoNote>
          You're viewing what {ASSISTANT_NAME} captured from this meeting. Approving or rejecting
          proposed knowledge requires the manager or executive role.
        </InfoNote>
      )}

      {extractionError && !hasArtifacts && (
        <Card className="space-y-3 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-crit">
            <ShieldAlert className="size-4" /> Couldn't process this meeting
          </p>
          <p className="text-xs leading-relaxed text-ink-3">{extractionError}</p>
          {canRetryExtraction && (
            <button
              onClick={() => retryExtraction.mutate()}
              disabled={retryExtraction.isPending}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-btn px-4 text-[13px] font-semibold text-btn-ink hover:opacity-90 disabled:opacity-50"
            >
              <RefreshCw className="size-3.5" />
              {retryExtraction.isPending ? "Retrying…" : "Retry"}
            </button>
          )}
          {retryExtraction.isError && (
            <p className="text-xs text-crit">
              {retryExtraction.error instanceof Error
                ? retryExtraction.error.message
                : "Retry failed."}
            </p>
          )}
        </Card>
      )}

      <ReviewSection
        title="Decisions"
        artifacts={payload.decisions.map(
          (d): ReviewArtifactView => ({
            id: d.id,
            kind: "decision",
            title: d.title,
            rationale: d.rationale,
            decided_by: d.decided_by,
            status: d.status,
            turns: d.turns,
          }),
        )}
        canReview={canReview}
        onResolve={resolveArtifact}
      />

      <ReviewSection
        title="Action items"
        artifacts={payload.actions.map(
          (a): ReviewArtifactView => ({
            task_id: a.task_id,
            kind: "action",
            title: a.title,
            owner_name: a.owner_name,
            due_hint: a.due_hint,
            status: a.status,
            turns: a.turns,
          }),
        )}
        canReview={canReview}
        onResolve={resolveArtifact}
      />

      <ReviewSection
        title="Risks"
        artifacts={payload.risks.map(
          (r): ReviewArtifactView => ({
            rid: r.rid,
            kind: "risk",
            text: r.text,
            status: r.status,
            turns: r.turns,
          }),
        )}
        canReview={canReview}
        onResolve={resolveArtifact}
      />

      <ReviewSection
        title="Open questions"
        artifacts={payload.questions.map(
          (q): ReviewArtifactView => ({
            qid: q.qid,
            kind: "question",
            text: q.text,
            raised_by: q.raised_by,
            status: q.status,
            turns: q.turns,
          }),
        )}
        canReview={canReview}
        onResolve={resolveArtifact}
      />

      {!hasArtifacts && !extractionError && (
        <Card className="p-6 text-center text-sm text-ink-2">
          {ASSISTANT_NAME_CAPITALIZED} didn't capture any structured
          knowledge from this transcript — only the raw turns were stored. There's nothing to
          review yet.
        </Card>
      )}

      {payload.dropped.length > 0 && (
        <InfoNote tone="warn">
          <p className="font-semibold text-ink">Dropped by the traceability check</p>
          <p className="mt-1">
            These candidates couldn't be traced to a specific transcript line, so they were never
            proposed:
          </p>
          <ul className="mt-1.5 list-inside list-disc space-y-0.5">
            {payload.dropped.map((reason, i) => (
              <li key={i}>{reason}</li>
            ))}
          </ul>
        </InfoNote>
      )}

      {resolve.isError && (
        <p className="text-xs text-crit">
          {resolve.error instanceof Error ? resolve.error.message : "Could not save that review."}
        </p>
      )}
    </div>
  );
}

function ReviewSection({
  title,
  artifacts,
  canReview,
  onResolve,
}: {
  title: string;
  artifacts: ReviewArtifactView[];
  canReview: boolean;
  onResolve: (
    kind: ResolveArtifactRequest["kind"],
    artifactId: string,
    action: "approve" | "reject",
    edits: Record<string, string>,
  ) => void;
}) {
  if (!artifacts.length) return null;
  return (
    <section>
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-3">{title}</h2>
      <div className="space-y-2">
        {artifacts.map((artifact) => {
          const artifactId =
            artifact.id ?? artifact.task_id ?? artifact.rid ?? artifact.qid ?? "";
          return (
            <ArtifactCard
              key={artifactId}
              artifact={artifact}
              canReview={canReview}
              onResolve={(action, edits) => onResolve(artifact.kind, artifactId, action, edits)}
            />
          );
        })}
      </div>
    </section>
  );
}

function BackLink() {
  return (
    <Link href="/meetings" className="inline-flex items-center gap-1 text-xs text-ink-3 hover:text-ink">
      <ArrowLeft className="size-3.5" /> Meetings
    </Link>
  );
}
