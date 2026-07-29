"use client";

/** Shared Brain Interview building blocks: purpose/visibility pickers, the
 * recording indicator, and artifact review cards. Kept presentational so they
 * are unit-testable without the API. */

import { Badge, Card } from "@/components/ui";
import { cn } from "@/lib/utils";
import type {
  InterviewArtifactInfo,
  InterviewArtifactKind,
  InterviewMode,
  InterviewPurpose,
  InterviewVisibility,
} from "@brainchain/shared";
import {
  AlertTriangle,
  BookOpenCheck,
  CalendarDays,
  Check,
  CircleDot,
  CircleHelp,
  EyeOff,
  GitBranch,
  Landmark,
  Lightbulb,
  ListChecks,
  Lock,
  MessageCircleHeart,
  Mic,
  MicOff,
  Pencil,
  Route,
  UserRound,
  Wrench,
} from "lucide-react";
import * as React from "react";

/* ------------------------------------------------------------- purposes */

export const PURPOSES: {
  key: InterviewPurpose;
  label: string;
  blurb: string;
  icon: React.ReactNode;
}[] = [
  {
    key: "open",
    label: "Just talk",
    blurb: "No agenda, no form — say how things are going and the brain listens.",
    icon: <MessageCircleHeart className="size-4" />,
  },
  {
    key: "process",
    label: "Explain a process",
    blurb: "How the work really happens — steps, handoffs, exceptions, workarounds.",
    icon: <Route className="size-4" />,
  },
  {
    key: "meeting_prep",
    label: "Prepare for a meeting",
    blurb: "Topics, needed decisions, risks and evidence before the room.",
    icon: <CalendarDays className="size-4" />,
  },
  {
    key: "concern",
    label: "Share a concern or idea",
    blurb: "Friction, risks, or improvements — with follow-up only if you allow it.",
    icon: <Lightbulb className="size-4" />,
  },
  {
    key: "decision",
    label: "Document a decision",
    blurb: "What was decided, the alternatives, the dissent, and how success is measured.",
    icon: <Landmark className="size-4" />,
  },
  {
    key: "expert",
    label: "Capture expert knowledge",
    blurb: "The heuristics, diagnostics and edge cases that live only in your head.",
    icon: <BookOpenCheck className="size-4" />,
  },
  {
    key: "outcome_review",
    label: "Review a plan or outcome",
    blurb: "Did the approved plan happen, did it work, and what should we remember?",
    icon: <ListChecks className="size-4" />,
  },
];

export function PurposePicker({
  value,
  onChange,
}: {
  value: InterviewPurpose | null;
  onChange: (purpose: InterviewPurpose) => void;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Interview purpose">
      {PURPOSES.map((purpose) => (
        <button
          key={purpose.key}
          role="radio"
          aria-checked={value === purpose.key}
          onClick={() => onChange(purpose.key)}
          className={cn(
            "rounded-xl border p-3.5 text-left transition-colors",
            value === purpose.key
              ? "border-accent bg-accent-soft"
              : "border-line hover:border-line-strong",
          )}
        >
          <p className="flex items-center gap-2 text-xs font-semibold text-ink">
            <span className="text-accent">{purpose.icon}</span>
            {purpose.label}
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-ink-3">{purpose.blurb}</p>
        </button>
      ))}
    </div>
  );
}

/* ----------------------------------------------------------- visibility */

const VISIBILITY_META: Record<
  InterviewVisibility,
  { label: string; icon: React.ReactNode; blurb: string }
> = {
  named: {
    label: "Named",
    icon: <UserRound className="size-4" />,
    blurb: "You are attributed and may receive follow-up. Best for knowledge you want credit for.",
  },
  confidential: {
    label: "Confidential",
    icon: <Lock className="size-4" />,
    blurb: "Your identity is kept only for protected follow-up — never shown to managers or in published knowledge.",
  },
  anonymous: {
    label: "Anonymous",
    icon: <EyeOff className="size-4" />,
    blurb: "No identity is stored. Managers only ever see cohort-protected aggregates. Text only.",
  },
};

export function VisibilityPicker({
  mode,
  value,
  onChange,
  allowAnonymous = true,
  anonymousDisabledReason,
}: {
  mode: InterviewMode;
  value: InterviewVisibility;
  onChange: (visibility: InterviewVisibility) => void;
  allowAnonymous?: boolean;
  anonymousDisabledReason?: string;
}) {
  const isVoice = mode === "voice" || mode === "quick_voice";
  const options: InterviewVisibility[] =
    isVoice || !allowAnonymous
      ? ["named", "confidential"]
      : ["named", "confidential", "anonymous"];
  return (
    <div>
      <div
        className={cn("grid gap-2", options.length === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2")}
        role="radiogroup"
        aria-label="Visibility"
      >
        {options.map((option) => {
          const meta = VISIBILITY_META[option];
          return (
            <button
              key={option}
              role="radio"
              aria-checked={value === option}
              onClick={() => onChange(option)}
              className={cn(
                "rounded-xl border p-3 text-left transition-colors",
                value === option ? "border-accent bg-accent-soft" : "border-line hover:border-line-strong",
              )}
            >
              <p className="flex items-center gap-2 text-xs font-semibold text-ink">
                <span className="text-accent">{meta.icon}</span> {meta.label}
              </p>
              <p className="mt-1 text-[10.5px] leading-relaxed text-ink-3">{meta.blurb}</p>
            </button>
          );
        })}
      </div>
      {isVoice && (
        <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed text-ink-3">
          <MicOff className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          Voice interviews can't be anonymous — a voice can identify its speaker even without your
          name. Switch to a text interview for anonymity.
        </p>
      )}
      {!isVoice && !allowAnonymous && (
        <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed text-ink-3">
          <EyeOff className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {anonymousDisabledReason ??
            "Anonymous isn't available for this request because it was addressed to you personally — a cohort of one is not anonymous. You can respond confidentially, or decline."}
        </p>
      )}
    </div>
  );
}

/* ---------------------------------------------------- recording indicator */

export function RecordingIndicator({
  state,
  elapsedSeconds,
}: {
  state: "recording" | "paused" | "off";
  elapsedSeconds: number;
}) {
  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = Math.floor(elapsedSeconds % 60);
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold",
        state === "recording" && "border-crit/50 bg-crit/10 text-crit",
        state === "paused" && "border-warn/50 bg-warn/10 text-warn",
        state === "off" && "border-line bg-panel-2 text-ink-3",
      )}
    >
      {state === "recording" ? (
        <>
          <span className="relative flex size-2.5" aria-hidden>
            <span className="absolute inline-flex h-full w-full animate-pulse-soft rounded-full bg-crit motion-reduce:animate-none" />
          </span>
          <Mic className="size-3.5" aria-hidden />
          Recording — microphone is live
        </>
      ) : state === "paused" ? (
        <>
          <CircleDot className="size-3.5" aria-hidden /> Paused — microphone muted
        </>
      ) : (
        <>
          <MicOff className="size-3.5" aria-hidden /> Not recording
        </>
      )}
      <span className="font-mono tabular-nums" aria-label={`elapsed time ${minutes} minutes ${seconds} seconds`}>
        {minutes}:{String(seconds).padStart(2, "0")}
      </span>
    </div>
  );
}

/* ------------------------------------------------------- artifact review */

export const ARTIFACT_KIND_META: Record<
  string,
  { label: string; sentence: string; icon: React.ReactNode; group: string }
> = {
  claim: { label: "Fact", sentence: "The brain understood this as a fact.", icon: <BookOpenCheck className="size-3.5" />, group: "Knowledge" },
  process_step: { label: "Process step", sentence: "The brain understood this as a step in the process.", icon: <Route className="size-3.5" />, group: "Process" },
  process_exception: { label: "Exception", sentence: "The brain understood this as an exception.", icon: <GitBranch className="size-3.5" />, group: "Process" },
  workaround: { label: "Workaround", sentence: "The brain understood this as an undocumented workaround.", icon: <Wrench className="size-3.5" />, group: "Process" },
  risk: { label: "Risk", sentence: "The brain understood this as a risk.", icon: <AlertTriangle className="size-3.5" />, group: "Signals" },
  friction: { label: "Friction", sentence: "The brain understood this as recurring friction.", icon: <AlertTriangle className="size-3.5" />, group: "Signals" },
  idea: { label: "Idea", sentence: "The brain understood this as an improvement idea.", icon: <Lightbulb className="size-3.5" />, group: "Signals" },
  decision: { label: "Proposed decision", sentence: "The brain understood this as a proposed decision.", icon: <Landmark className="size-3.5" />, group: "Decision" },
  decision_alternative: { label: "Alternative", sentence: "The brain understood this as an alternative that was considered.", icon: <GitBranch className="size-3.5" />, group: "Decision" },
  decision_rationale: { label: "Rationale", sentence: "The brain understood this as the reasoning behind the decision.", icon: <BookOpenCheck className="size-3.5" />, group: "Decision" },
  dissent: { label: "Dissent", sentence: "The brain understood this as recorded disagreement.", icon: <AlertTriangle className="size-3.5" />, group: "Decision" },
  assumption: { label: "Assumption", sentence: "The brain understood this as an assumption the plan depends on.", icon: <CircleHelp className="size-3.5" />, group: "Decision" },
  success_metric: { label: "Success metric", sentence: "The brain understood this as how success will be measured.", icon: <Check className="size-3.5" />, group: "Decision" },
  action_item: { label: "Action item", sentence: "The brain understood this as a commitment to act.", icon: <ListChecks className="size-3.5" />, group: "Actions" },
  open_question: { label: "Open question", sentence: "The brain understood this as an unresolved question.", icon: <CircleHelp className="size-3.5" />, group: "Actions" },
  expert_heuristic: { label: "Expert heuristic", sentence: "The brain understood this as expert judgment worth preserving.", icon: <BookOpenCheck className="size-3.5" />, group: "Knowledge" },
  lesson: { label: "Lesson", sentence: "The brain understood this as a lesson for the future.", icon: <BookOpenCheck className="size-3.5" />, group: "Knowledge" },
  entity_relationship: { label: "Relationship", sentence: "The brain understood this as a relationship between things.", icon: <GitBranch className="size-3.5" />, group: "Knowledge" },
  meeting_topic: { label: "Meeting topic", sentence: "The brain understood this as a topic for the meeting.", icon: <CalendarDays className="size-3.5" />, group: "Meeting" },
  meeting_reflection: { label: "Meeting reflection", sentence: "The brain understood this as a reflection on how it went.", icon: <CalendarDays className="size-3.5" />, group: "Meeting" },
};

export function kindMeta(kind: InterviewArtifactKind) {
  return (
    ARTIFACT_KIND_META[kind] ?? {
      label: kind,
      sentence: "The brain extracted this from your words.",
      icon: <BookOpenCheck className="size-3.5" />,
      group: "Knowledge",
    }
  );
}

export function ArtifactReviewCard({
  artifact,
  onToggle,
  onEdit,
  onShowSource,
}: {
  artifact: InterviewArtifactInfo;
  onToggle: (selected: boolean) => void;
  onEdit: (summary: string) => void;
  onShowSource: () => void;
}) {
  const meta = kindMeta(artifact.kind);
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(artifact.summary);

  return (
    <Card className={cn("p-3.5 transition-opacity", !artifact.selected && "opacity-55")}>
      <div className="flex items-start gap-3">
        <button
          role="checkbox"
          aria-checked={artifact.selected}
          aria-label={`Include "${artifact.summary.slice(0, 60)}"`}
          onClick={() => onToggle(!artifact.selected)}
          className={cn(
            "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border transition-colors",
            artifact.selected
              ? "border-accent bg-accent text-accent-ink"
              : "border-line-strong bg-panel",
          )}
        >
          {artifact.selected && <Check className="size-3.5" />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone="accent">
              {meta.icon}
              {meta.label}
            </Badge>
            <Badge tone={artifact.provenance === "firsthand" ? "good" : artifact.provenance === "hearsay" ? "warn" : "neutral"}>
              {artifact.provenance}
            </Badge>
            {(artifact.uncertain || Boolean(artifact.details.inference)) && (
              <Badge tone="warn">marked as inference</Badge>
            )}
            {artifact.employee_edited && <Badge tone="neutral">edited by you</Badge>}
            <span className="ml-auto text-[10.5px] tabular-nums text-ink-3">
              {(artifact.confidence * 100).toFixed(0)}% confidence
            </span>
          </div>
          <p className="mt-1.5 text-[11px] text-ink-3">{meta.sentence}</p>
          {editing ? (
            <div className="mt-1.5">
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                rows={3}
                aria-label="Edit summary"
                className="w-full rounded-lg border border-line-strong bg-panel px-3 py-2 text-sm text-ink focus:border-accent"
              />
              <div className="mt-1.5 flex gap-2">
                <button
                  onClick={() => {
                    onEdit(draft.trim());
                    setEditing(false);
                  }}
                  className="rounded-lg bg-accent px-3 py-1 text-xs font-medium text-accent-ink"
                >
                  Save correction
                </button>
                <button
                  onClick={() => {
                    setDraft(artifact.summary);
                    setEditing(false);
                  }}
                  className="rounded-lg px-3 py-1 text-xs text-ink-2 hover:bg-panel-2"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <p className="mt-1 text-sm leading-relaxed text-ink">{artifact.summary}</p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px]">
            <button onClick={() => setEditing(true)} className="inline-flex items-center gap-1 font-medium text-accent hover:underline">
              <Pencil className="size-3" /> Correct this
            </button>
            <button onClick={onShowSource} className="font-medium text-ink-3 hover:text-ink hover:underline">
              View what you said
            </button>
          </div>
        </div>
      </div>
    </Card>
  );
}
