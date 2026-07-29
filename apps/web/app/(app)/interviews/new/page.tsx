"use client";

import { PurposePicker, VisibilityPicker } from "@/components/interview/shared";
import { Badge, Button, Card, InfoNote, Input, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type {
  InterviewMode,
  InterviewPurpose,
  InterviewSessionInfo,
  InterviewVisibility,
  MeetingInfo,
} from "@brainchain/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Brain, Keyboard, Mic, Zap } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";

const MODES: { key: InterviewMode; label: string; blurb: string; icon: React.ReactNode }[] = [
  {
    key: "voice",
    label: "Voice interview",
    blurb: "Speak naturally; the brain asks follow-ups. Requires explicit consent before the microphone starts.",
    icon: <Mic className="size-4" />,
  },
  {
    key: "text",
    label: "Text interview",
    blurb: "A focused written conversation. Supports named, confidential, and anonymous sharing.",
    icon: <Keyboard className="size-4" />,
  },
  {
    key: "quick_text",
    label: "Quick capture",
    blurb: "One thought, at most three follow-up questions — skip straight to review any time.",
    icon: <Zap className="size-4" />,
  },
];

function NewInterviewInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [mode, setMode] = React.useState<InterviewMode | null>(
    (params.get("mode") as InterviewMode) || null,
  );
  const [purpose, setPurpose] = React.useState<InterviewPurpose | null>(
    (params.get("purpose") as InterviewPurpose) || null,
  );
  const [visibility, setVisibility] = React.useState<InterviewVisibility>("named");
  const [title, setTitle] = React.useState("");
  const meetingId = params.get("meeting");
  const assignmentId = params.get("assignment");
  const anonymousDisabled = params.get("noanon") === "1";

  const { data: meetings } = useQuery({
    queryKey: ["meetings"],
    queryFn: () => api<{ items: MeetingInfo[] }>("/meetings"),
    enabled: !!meetingId,
  });
  const meeting = meetings?.items.find((m) => m.id === meetingId);

  // Voice can never be anonymous — the UI simply doesn't offer it, and if the
  // user picked anonymous first and then switches to voice, we reset safely.
  React.useEffect(() => {
    if ((mode === "voice" || mode === "quick_voice") && visibility === "anonymous") {
      setVisibility("named");
    }
  }, [mode, visibility]);

  const create = useMutation({
    mutationFn: () =>
      api<InterviewSessionInfo>("/interviews", {
        method: "POST",
        body: {
          mode,
          purpose,
          visibility,
          title: title.trim(),
          meeting_id: meetingId,
          assignment_id: assignmentId,
        },
      }),
    onSuccess: (session) => {
      // Anonymous sessions are reachable only by receipt — keep it in
      // sessionStorage (this browser, this tab lifetime), never on the server
      // tied to the account.
      if (session.visibility === "anonymous" && session.receipt_token) {
        window.sessionStorage.setItem(`interview_receipt_${session.id}`, session.receipt_token);
      }
      router.push(`/interviews/${session.id}`);
    },
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/" className="inline-flex items-center gap-1 text-xs text-ink-3 hover:text-ink">
          <ArrowLeft className="size-3.5" /> Today
        </Link>
        <h1 className="mt-2 flex items-center gap-2 text-xl font-semibold tracking-tight text-ink">
          <Brain className="size-5 text-accent" /> Talk to the Brain
        </h1>
        <p className="mt-1 text-sm text-ink-3">
          Tell the company brain something it should understand. You control what is saved — every
          extracted item is reviewed by you before it enters company memory.
        </p>
        {meeting && (
          <Badge tone="accent" className="mt-2">
            For meeting: {meeting.title}
          </Badge>
        )}
        {assignmentId && (
          <Badge tone="accent" className="mt-2">
            Responding to a request — it stays your choice what to share
          </Badge>
        )}
      </div>

      <section aria-labelledby="mode-heading">
        <h2 id="mode-heading" className="mb-2 text-sm font-semibold text-ink">
          1 · How do you want to share?
        </h2>
        <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Interview mode">
          {MODES.map((option) => (
            <button
              key={option.key}
              role="radio"
              aria-checked={mode === option.key}
              onClick={() => setMode(option.key)}
              className={cn(
                "rounded-xl border p-3.5 text-left transition-colors",
                mode === option.key ? "border-accent bg-accent-soft" : "border-line hover:border-line-strong",
              )}
            >
              <p className="flex items-center gap-2 text-xs font-semibold text-ink">
                <span className="text-accent">{option.icon}</span> {option.label}
              </p>
              <p className="mt-1 text-[10.5px] leading-relaxed text-ink-3">{option.blurb}</p>
            </button>
          ))}
        </div>
      </section>

      {mode && (
        <section aria-labelledby="purpose-heading">
          <h2 id="purpose-heading" className="mb-2 text-sm font-semibold text-ink">
            2 · What is this about?
          </h2>
          <PurposePicker value={purpose} onChange={setPurpose} />
        </section>
      )}

      {mode && purpose && (
        <section aria-labelledby="visibility-heading" className="space-y-3">
          <h2 id="visibility-heading" className="text-sm font-semibold text-ink">
            3 · Who is this from?
          </h2>
          <VisibilityPicker
            mode={mode}
            value={visibility}
            onChange={setVisibility}
            allowAnonymous={!anonymousDisabled}
          />
          <div>
            <label htmlFor="interview-title" className="mb-1 block text-xs font-medium text-ink-2">
              Give it a short title (optional)
            </label>
            <Input
              id="interview-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={
                purpose === "process" ? "e.g. Supplier qualification process" : "What should we call this?"
              }
              maxLength={200}
            />
          </div>
          {visibility === "anonymous" && (
            <InfoNote tone="privacy">
              Anonymous means structurally anonymous: no user ID, no email, no precise timestamp is
              stored. You'll get a receipt token — the only link to this interview, held by you.
              Honest limitation: your writing itself can identify you if it contains identifying
              details.
            </InfoNote>
          )}
          <Card className="flex items-center justify-between gap-3 p-4">
            <p className="text-xs leading-relaxed text-ink-3">
              Next: {mode === "voice" || mode === "quick_voice"
                ? "a consent screen before the microphone activates."
                : "the conversation. Finish and review whenever you're ready."}
            </p>
            <Button onClick={() => create.mutate()} disabled={create.isPending}>
              {create.isPending ? "Creating…" : "Begin"} <ArrowRight className="size-4" />
            </Button>
          </Card>
          {create.isError && (
            <p className="text-xs text-crit">{(create.error as Error).message}</p>
          )}
        </section>
      )}
    </div>
  );
}

export default function NewInterviewPage() {
  return (
    <React.Suspense fallback={<Spinner label="Loading…" />}>
      <NewInterviewInner />
    </React.Suspense>
  );
}
