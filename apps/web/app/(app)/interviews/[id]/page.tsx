"use client";

import {
  ArtifactReviewCard,
  kindMeta,
  RecordingIndicator,
} from "@/components/interview/shared";
import {
  Badge,
  Button,
  Card,
  CardSkeleton,
  Dialog,
  InfoNote,
  Spinner,
  Textarea,
} from "@/components/ui";
import { api } from "@/lib/api";
import type {
  InterviewArtifactInfo,
  InterviewSessionInfo,
  InterviewTurnInfo,
} from "@brainchain/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  Brain,
  Check,
  CheckCircle2,
  EyeOff,
  Keyboard,
  Landmark,
  ListChecks,
  Lock,
  MessageSquareHeart,
  Mic,
  Pause,
  Pencil,
  Play,
  Send,
  ShieldCheck,
  Trash2,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import * as React from "react";

const VISIBILITY_BADGE = {
  named: { icon: <UserRound className="size-3" />, label: "Named" },
  confidential: { icon: <Lock className="size-3" />, label: "Confidential" },
  anonymous: { icon: <EyeOff className="size-3" />, label: "Anonymous" },
} as const;

function receiptFor(sessionId: string): string | null {
  if (typeof window === "undefined") return null;
  return window.sessionStorage.getItem(`interview_receipt_${sessionId}`);
}

export default function InterviewWorkspacePage() {
  const params = useParams<{ id: string }>();
  const sessionId = params.id;
  const receipt = receiptFor(sessionId);
  const queryClient = useQueryClient();
  const router = useRouter();

  const query = useQuery({
    queryKey: ["interview", sessionId],
    queryFn: () =>
      api<InterviewSessionInfo>(`/interviews/${sessionId}`, {
        params: { receipt },
      }),
  });
  const session = query.data;

  const refresh = (updated?: InterviewSessionInfo) => {
    if (updated) queryClient.setQueryData(["interview", sessionId], (prev: InterviewSessionInfo | undefined) => ({ ...prev, ...updated }));
    else queryClient.invalidateQueries({ queryKey: ["interview", sessionId] });
  };

  const action = useMutation({
    mutationFn: ({ path, body }: { path: string; body?: unknown }) =>
      api<InterviewSessionInfo>(`/interviews/${sessionId}/${path}`, {
        method: "POST",
        body: body ?? {},
        params: { receipt },
      }),
    onSuccess: (updated) => refresh(updated),
  });

  React.useEffect(() => {
    if (session && session.status === "draft") {
      action.mutate({ path: "start" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.status === "draft"]);

  if (query.isLoading || !session) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <CardSkeleton rows={4} />
      </div>
    );
  }
  if (query.isError) {
    return (
      <div className="mx-auto max-w-3xl">
        <Card className="p-6 text-center text-sm text-ink-2">
          This interview could not be loaded. Anonymous interviews are only reachable from the
          browser session that created them (via the receipt token).
        </Card>
      </div>
    );
  }

  const vis = VISIBILITY_BADGE[session.visibility];

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <header className="flex flex-wrap items-center gap-2">
        <Link href="/interviews" className="inline-flex items-center gap-1 text-xs text-ink-3 hover:text-ink">
          <ArrowLeft className="size-3.5" /> Interviews
        </Link>
        <span className="text-ink-3">/</span>
        <h1 className="text-sm font-semibold text-ink">
          {session.title || "Brain Interview"}
        </h1>
        <div className="ml-auto flex items-center gap-1.5">
          <Badge tone="neutral">{session.purpose.replace(/_/g, " ")}</Badge>
          <Badge tone={session.visibility === "anonymous" ? "good" : "accent"}>
            {vis.icon} {vis.label}
          </Badge>
        </div>
      </header>

      {session.assignment && session.status !== "published" && (
        <Card className="border-accent/30 p-3.5">
          <p className="text-xs font-semibold text-ink">
            {session.assignment.created_by?.name} asked: “{session.assignment.title}”
          </p>
          {session.assignment.note && (
            <p className="mt-1 text-[11.5px] leading-relaxed text-ink-3">{session.assignment.note}</p>
          )}
          <p className="mt-1 text-[10.5px] text-ink-3">
            A request, not an order — you still choose what is saved, and the requester never sees
            this conversation.
          </p>
        </Card>
      )}

      {session.status === "consent_required" && (
        <ConsentScreen
          pending={action.isPending}
          onConsent={(policy) => action.mutate({ path: "consent", body: { audio_retention_policy: policy } })}
          onSwitchToText={() => action.mutate({ path: "switch-to-text" })}
          onDiscard={() => action.mutate({ path: "discard" })}
        />
      )}

      {(session.status === "active" || session.status === "paused") &&
        (session.mode === "voice" || session.mode === "quick_voice" ? (
          <VoiceWorkspace session={session} receipt={receipt} onAction={action.mutate} pending={action.isPending} onRefresh={refresh} />
        ) : (
          <TextWorkspace session={session} receipt={receipt} onAction={action.mutate} pending={action.isPending} onRefresh={refresh} />
        ))}

      {session.status === "processing" && (
        <Card className="flex items-center gap-3 p-6">
          <Spinner />
          <p className="text-sm text-ink-2">
            Reading the conversation and extracting what the company should remember…
          </p>
        </Card>
      )}

      {session.status === "review_required" && (
        <ReviewWorkspace session={session} receipt={receipt} onRefresh={refresh} />
      )}

      {session.status === "published" && <PublishedSummary session={session} />}

      {session.status === "failed" && (
        <Card className="space-y-3 p-5">
          <p className="flex items-center gap-2 text-sm font-semibold text-crit">
            <AlertTriangle className="size-4" /> Something went wrong
          </p>
          <p className="text-xs leading-relaxed text-ink-3">
            {session.failure_code === "transcription_provider_error"
              ? "Transcription failed midway. Your existing transcript is safe — you can retry, switch to a text interview, or delete the session."
              : "Processing failed. You can retry, or delete the session."}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => action.mutate({ path: "retry" })} disabled={action.isPending}>
              <Play className="size-3.5" /> Retry
            </Button>
            {(session.mode === "voice" || session.mode === "quick_voice") && (
              <Button size="sm" variant="secondary" onClick={() => action.mutate({ path: "switch-to-text" })}>
                <Keyboard className="size-3.5" /> Switch to text
              </Button>
            )}
            <DeleteButton sessionId={session.id} receipt={receipt} onDeleted={() => router.push("/interviews")} />
          </div>
        </Card>
      )}

      {session.status === "discarded" && (
        <Card className="p-6 text-center">
          <p className="text-sm font-medium text-ink">Interview discarded</p>
          <p className="mt-1 text-xs text-ink-3">Nothing from this session entered company memory.</p>
        </Card>
      )}

      {action.isError && (
        <p className="text-xs text-crit">{(action.error as Error).message}</p>
      )}
    </div>
  );
}

/* -------------------------------------------------------------- consent */

function ConsentScreen({
  onConsent,
  onSwitchToText,
  onDiscard,
  pending,
}: {
  onConsent: (policy: string) => void;
  onSwitchToText: () => void;
  onDiscard: () => void;
  pending: boolean;
}) {
  const [retain, setRetain] = React.useState(false);
  return (
    <Card className="space-y-4 p-5">
      <p className="flex items-center gap-2 text-sm font-semibold text-ink">
        <Mic className="size-4 text-accent" /> Before the microphone starts
      </p>
      <ul className="space-y-2 text-xs leading-relaxed text-ink-2">
        <li className="flex gap-2"><ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-good" /> A visible recording indicator stays on the whole time. There is no hidden recording.</li>
        <li className="flex gap-2"><ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-good" /> You see the live transcript and can correct any line before finishing.</li>
        <li className="flex gap-2"><ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-good" /> Raw audio is deleted after transcription unless you choose otherwise below.</li>
        <li className="flex gap-2"><ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-good" /> Nothing publishes automatically — you review every extracted item first.</li>
        <li className="flex gap-2"><AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warn" /> Voice sessions are attributed to you. A voice can identify its speaker, so voice can't be anonymous.</li>
      </ul>
      <label className="flex items-start gap-2 rounded-lg border border-line p-3 text-xs text-ink-2">
        <input
          type="checkbox"
          checked={retain}
          onChange={(event) => setRetain(event.target.checked)}
          className="mt-0.5 size-3.5 accent-[var(--accent)]"
        />
        <span>
          Keep the raw audio after transcription <span className="text-ink-3">(off = deleted automatically; keeping audio also requires an organization policy that allows retention)</span>
        </span>
      </label>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => onConsent(retain ? "retain_with_consent" : "delete_after_transcription")} disabled={pending}>
          <Mic className="size-4" /> I consent — start recording
        </Button>
        <Button variant="secondary" onClick={onSwitchToText}>
          <Keyboard className="size-4" /> Use text instead
        </Button>
        <Button variant="ghost" onClick={onDiscard}>
          Cancel
        </Button>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------ transcript */

function TurnBubble({
  turn,
  editable,
  onEdit,
}: {
  turn: InterviewTurnInfo;
  editable: boolean;
  onEdit?: (turnId: string, text: string) => void;
}) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(turn.text);
  if (turn.role === "interviewer") {
    return (
      <div className="flex gap-2.5">
        <span className="mt-1 flex size-7 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
          <Brain className="size-3.5" />
        </span>
        <div className="max-w-[85%] whitespace-pre-line rounded-2xl rounded-tl-sm bg-panel-2 px-3.5 py-2.5 text-sm leading-relaxed text-ink">
          {turn.text}
        </div>
      </div>
    );
  }
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%]">
        <div className="rounded-2xl rounded-br-sm bg-accent px-3.5 py-2.5 text-sm leading-relaxed text-accent-ink">
          {editing ? (
            <div>
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                rows={3}
                aria-label="Correct your answer"
                className="w-full rounded-lg border-0 bg-white/15 px-2 py-1.5 text-sm text-accent-ink placeholder:text-accent-ink/60"
              />
              <div className="mt-1 flex justify-end gap-2 text-[11px]">
                <button onClick={() => { onEdit?.(turn.id, draft.trim()); setEditing(false); }} className="font-semibold underline">
                  Save
                </button>
                <button onClick={() => { setDraft(turn.text); setEditing(false); }} className="opacity-80">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            turn.text
          )}
        </div>
        <div className="mt-0.5 flex items-center justify-end gap-2 text-[10.5px] text-ink-3">
          {turn.transcription_confidence != null && (
            <span>transcribed · {(turn.transcription_confidence * 100).toFixed(0)}%</span>
          )}
          {turn.edited && <span>corrected</span>}
          {editable && !editing && (
            <button onClick={() => setEditing(true)} className="inline-flex items-center gap-0.5 font-medium text-accent hover:underline">
              <Pencil className="size-2.5" /> correct
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function useTurnEditor(sessionId: string, receipt: string | null, onRefresh: () => void) {
  return useMutation({
    mutationFn: ({ turnId, text }: { turnId: string; text: string }) =>
      api(`/interviews/${sessionId}/turns/${turnId}`, {
        method: "PATCH",
        body: { text },
        params: { receipt },
      }),
    onSuccess: () => onRefresh(),
  });
}

/* ---------------------------------------------------------------- text UI */

function TextWorkspace({
  session,
  receipt,
  onAction,
  pending,
  onRefresh,
}: {
  session: InterviewSessionInfo;
  receipt: string | null;
  onAction: (args: { path: string; body?: unknown }) => void;
  pending: boolean;
  onRefresh: (s?: InterviewSessionInfo) => void;
}) {
  const [input, setInput] = React.useState("");
  const bottomRef = React.useRef<HTMLDivElement>(null);
  const editTurn = useTurnEditor(session.id, receipt, onRefresh);
  const turns = session.turns ?? [];
  const envelope = session.interviewer;

  const send = useMutation({
    mutationFn: (text: string) =>
      api<InterviewSessionInfo>(`/interviews/${session.id}/turns`, {
        method: "POST",
        body: { text },
        params: { receipt },
      }),
    onSuccess: (updated) => {
      onRefresh(updated);
      setInput("");
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    },
  });

  return (
    <div className="space-y-3">
      <InfoNote tone="privacy">
        You are <strong>contributing knowledge</strong>, not searching for it. You control what is
        saved — nothing enters company memory until you review and publish it. Skip any question,
        and finish whenever you want.
      </InfoNote>

      <Card className="space-y-3 p-4">
        <div className="max-h-[46vh] space-y-3 overflow-y-auto scroll-thin pr-1" aria-live="polite">
          {turns.map((turn) => (
            <TurnBubble
              key={turn.id}
              turn={turn}
              editable={turn.role === "employee"}
              onEdit={(turnId, text) => editTurn.mutate({ turnId, text })}
            />
          ))}
          <div ref={bottomRef} />
        </div>
        {envelope?.sensitive_warning && (
          <InfoNote tone="warn">{envelope.sensitive_warning}</InfoNote>
        )}
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (input.trim()) send.mutate(input.trim());
          }}
        >
          <Textarea
            rows={2}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                if (input.trim()) send.mutate(input.trim());
              }
            }}
            placeholder="Answer in your own words — or skip and finish below."
            aria-label="Your answer"
          />
          <Button type="submit" className="self-end" disabled={send.isPending || !input.trim()} aria-label="Send answer">
            <Send className="size-4" />
          </Button>
        </form>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => onAction({ path: "complete" })} disabled={pending || send.isPending}>
          <CheckCircle2 className="size-4" /> Finish and review
        </Button>
        <DeleteButton sessionId={session.id} receipt={receipt} label="Discard" />
        {envelope?.can_complete && (
          <span className="text-[11px] text-good">The brain has enough to work with whenever you're ready.</span>
        )}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- voice UI */

function VoiceWorkspace({
  session,
  receipt,
  onAction,
  pending,
  onRefresh,
}: {
  session: InterviewSessionInfo;
  receipt: string | null;
  onAction: (args: { path: string; body?: unknown }) => void;
  pending: boolean;
  onRefresh: (s?: InterviewSessionInfo) => void;
}) {
  const [micState, setMicState] = React.useState<"unknown" | "granted" | "denied">("unknown");
  const [elapsed, setElapsed] = React.useState(0);
  const streamRef = React.useRef<MediaStream | null>(null);
  const editTurn = useTurnEditor(session.id, receipt, onRefresh);
  const isPaused = session.status === "paused";
  const turns = session.turns ?? [];

  const chunk = useMutation({
    mutationFn: () =>
      api<InterviewSessionInfo>(`/interviews/${session.id}/voice-chunk`, {
        method: "POST",
        body: {},
        params: { receipt },
      }),
    onSuccess: (updated) => onRefresh(updated),
  });

  // Microphone lifecycle: request on mount (consent already given), release on
  // unmount/pause. The mock transcription stream advances every few seconds
  // while recording.
  React.useEffect(() => {
    let cancelled = false;
    if (!isPaused && micState === "unknown") {
      navigator.mediaDevices
        ?.getUserMedia({ audio: true })
        .then((stream) => {
          if (cancelled) {
            stream.getTracks().forEach((t) => t.stop());
            return;
          }
          streamRef.current = stream;
          setMicState("granted");
        })
        .catch(() => setMicState("denied"));
    }
    return () => {
      cancelled = true;
    };
  }, [isPaused, micState]);

  React.useEffect(
    () => () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    },
    [],
  );

  React.useEffect(() => {
    if (isPaused || micState !== "granted") return;
    const timer = setInterval(() => setElapsed((v) => v + 1), 1000);
    return () => clearInterval(timer);
  }, [isPaused, micState]);

  React.useEffect(() => {
    if (isPaused || micState !== "granted" || session.status !== "active") return;
    const poll = setInterval(() => {
      if (!chunk.isPending) chunk.mutate();
    }, 4000);
    return () => clearInterval(poll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPaused, micState, session.status]);

  if (micState === "denied") {
    return (
      <Card className="space-y-3 p-5">
        <p className="flex items-center gap-2 text-sm font-semibold text-warn">
          <AlertTriangle className="size-4" /> Microphone permission was denied
        </p>
        <p className="text-xs leading-relaxed text-ink-3">
          The browser blocked microphone access, so the voice interview can't record. You can allow
          the microphone in your browser's site settings and try again, continue in text, or delete
          this session.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => setMicState("unknown")}>
            <Mic className="size-3.5" /> Try again
          </Button>
          <Button size="sm" variant="secondary" onClick={() => onAction({ path: "switch-to-text" })}>
            <Keyboard className="size-3.5" /> Switch to text
          </Button>
          <DeleteButton sessionId={session.id} receipt={receipt} />
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <RecordingIndicator
            state={isPaused ? "paused" : micState === "granted" ? "recording" : "off"}
            elapsedSeconds={elapsed}
          />
          <span className="ml-auto text-[11px] text-ink-3">
            {session.audio_retention_policy === "delete_after_transcription"
              ? "Raw audio is deleted after transcription"
              : "Raw audio will be retained (you consented)"}
          </span>
        </div>

        <div className="max-h-[40vh] space-y-3 overflow-y-auto scroll-thin pr-1" aria-live="polite" aria-label="Live transcript">
          {turns.map((turn) => (
            <TurnBubble
              key={turn.id}
              turn={turn}
              editable={turn.role === "employee"}
              onEdit={(turnId, text) => editTurn.mutate({ turnId, text })}
            />
          ))}
          {micState === "granted" && !isPaused && (
            <p className="text-center text-[11px] text-ink-3">Listening… your words appear here as they're transcribed. Correct any line.</p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isPaused ? (
            <Button size="sm" onClick={() => onAction({ path: "resume" })} disabled={pending}>
              <Play className="size-3.5" /> Resume
            </Button>
          ) : (
            <Button size="sm" variant="secondary" onClick={() => onAction({ path: "pause" })} disabled={pending}>
              <Pause className="size-3.5" /> Pause
            </Button>
          )}
          <Button size="sm" variant="secondary" onClick={() => onAction({ path: "switch-to-text" })}>
            <Keyboard className="size-3.5" /> Switch to text
          </Button>
          <Button size="sm" onClick={() => onAction({ path: "complete" })} disabled={pending}>
            <CheckCircle2 className="size-3.5" /> Finish and review
          </Button>
          <DeleteButton sessionId={session.id} receipt={receipt} label="Delete session" />
        </div>
      </Card>
      <InfoNote>
        Local demo profile: transcription uses a deterministic sample stream so the full voice flow
        works without external services. A real provider plugs into the same adapter via
        environment variables.
      </InfoNote>
    </div>
  );
}

/* -------------------------------------------------------------- review UI */

function ReviewWorkspace({
  session,
  receipt,
  onRefresh,
}: {
  session: InterviewSessionInfo;
  receipt: string | null;
  onRefresh: () => void;
}) {
  const queryClient = useQueryClient();
  const [sourceFor, setSourceFor] = React.useState<InterviewArtifactInfo | null>(null);
  const [confirming, setConfirming] = React.useState(false);
  const artifacts = session.artifacts ?? [];
  const turnsById = new Map((session.turns ?? []).map((t) => [t.id, t]));

  const update = useMutation({
    mutationFn: ({ artifactId, body }: { artifactId: string; body: Record<string, unknown> }) =>
      api(`/interviews/${session.id}/artifacts/${artifactId}`, {
        method: "PATCH",
        body,
        params: { receipt },
      }),
    onSuccess: () => onRefresh(),
  });

  const publish = useMutation({
    mutationFn: () =>
      api<InterviewSessionInfo>(`/interviews/${session.id}/publish`, {
        method: "POST",
        params: { receipt },
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData(["interview", session.id], (prev: InterviewSessionInfo | undefined) => ({ ...prev, ...updated }));
      setConfirming(false);
    },
  });

  const selectedCount = artifacts.filter((a) => a.selected).length;
  const groups = new Map<string, InterviewArtifactInfo[]>();
  for (const artifact of artifacts) {
    const group = kindMeta(artifact.kind).group;
    groups.set(group, [...(groups.get(group) ?? []), artifact]);
  }

  return (
    <div className="space-y-4">
      <InfoNote tone="privacy">
        <strong>Nothing has been saved to company memory yet.</strong> Review what the brain
        understood, correct or exclude anything, then publish only what you approve.
      </InfoNote>

      {!artifacts.length && (
        <Card className="p-6 text-center text-sm text-ink-2">
          The brain didn't extract anything substantial from this conversation. You can discard the
          session, or delete it entirely.
        </Card>
      )}

      {[...groups.entries()].map(([group, items]) => (
        <section key={group} aria-label={group}>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-3">{group}</h2>
          <div className="space-y-2">
            {items.map((artifact) => (
              <ArtifactReviewCard
                key={artifact.id}
                artifact={artifact}
                onToggle={(selected) => update.mutate({ artifactId: artifact.id, body: { selected } })}
                onEdit={(summary) => update.mutate({ artifactId: artifact.id, body: { summary } })}
                onShowSource={() => setSourceFor(artifact)}
              />
            ))}
          </div>
        </section>
      ))}

      <Card className="space-y-3 p-4">
        <p className="text-xs font-semibold text-ink">Where approved knowledge will go</p>
        <ul className="grid gap-1.5 text-[11.5px] leading-relaxed text-ink-3 sm:grid-cols-2">
          <li className="flex gap-1.5"><Landmark className="mt-0.5 size-3.5 shrink-0 text-accent" /> Decisions become <em>proposals</em> needing confirmation by an authorized owner.</li>
          <li className="flex gap-1.5"><Brain className="mt-0.5 size-3.5 shrink-0 text-accent" /> Process &amp; expert knowledge becomes searchable, citable company knowledge{session.visibility === "anonymous" ? " — except for anonymous sessions, which go to the protected feedback pipeline instead" : ""}.</li>
          <li className="flex gap-1.5"><MessageSquareHeart className="mt-0.5 size-3.5 shrink-0 text-accent" /> Risks and friction join the protected feedback pipeline{session.visibility === "anonymous" ? " (aggregate-only, cohort-protected)" : ""}.</li>
          <li className="flex gap-1.5"><ListChecks className="mt-0.5 size-3.5 shrink-0 text-accent" /> Action items become draft tasks.</li>
        </ul>
        <p className="text-[11px] text-ink-3">
          Access: {session.visibility === "named"
            ? "published knowledge is attributed to you and readable org-wide (Internal)."
            : session.visibility === "confidential"
              ? "published knowledge is unattributed; your identity stays in the protected follow-up service only."
              : "no identity is stored; managers only ever see cohort-protected aggregates."}{" "}
          The transcript stays private to this session{session.mode.includes("voice") ? "; raw audio was already deleted after transcription" : ""}. You can delete this
          session later — deletion removes the transcript, extracted items, and published knowledge documents.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => setConfirming(true)} disabled={publish.isPending}>
            <Check className="size-4" /> Publish approved knowledge ({selectedCount})
          </Button>
          <DeleteButton sessionId={session.id} receipt={receipt} label="Delete everything" />
        </div>
        {publish.isError && <p className="text-xs text-crit">{(publish.error as Error).message}</p>}
      </Card>

      <Dialog open={confirming} onClose={() => setConfirming(false)} title="Publish approved knowledge">
        <div className="space-y-3">
          <p className="text-sm text-ink-2">
            {selectedCount} item{selectedCount === 1 ? "" : "s"} will enter company memory with the
            visibility you chose ({session.visibility}). Everything you excluded stays out.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirming(false)}>Cancel</Button>
            <Button onClick={() => publish.mutate()} disabled={publish.isPending}>
              {publish.isPending ? "Publishing…" : "Publish"}
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog open={!!sourceFor} onClose={() => setSourceFor(null)} title="What you said">
        {sourceFor && (
          <div className="space-y-2">
            {sourceFor.supporting_turn_ids.map((turnId) => {
              const turn = turnsById.get(turnId);
              return (
                <blockquote key={turnId} className="rounded-lg border-l-2 border-accent bg-panel-2 px-3 py-2 text-sm leading-relaxed text-ink-2">
                  {turn?.text ?? sourceFor.excerpt}
                </blockquote>
              );
            })}
            <p className="text-[11px] text-ink-3">
              The item was derived only from these words. If it doesn't match what you meant,
              correct or exclude it.
            </p>
          </div>
        )}
      </Dialog>
    </div>
  );
}

/* ------------------------------------------------------------ published UI */

function PublishedSummary({ session }: { session: InterviewSessionInfo }) {
  const destinations = session.destinations ?? [];
  const publishedArtifacts = (session.artifacts ?? []).filter((a) => a.published_target_type);
  const rows = destinations.length
    ? destinations
    : publishedArtifacts.map((a) => ({
        artifact_id: a.id,
        kind: a.kind,
        label: kindMeta(a.kind).label,
        target_type: (a.published_target_type ?? "document") as "document",
        target_id: a.published_target_id ?? "",
      }));
  return (
    <Card className="space-y-4 p-5">
      <p className="flex items-center gap-2 text-sm font-semibold text-good">
        <CheckCircle2 className="size-4" /> Published to company memory
      </p>
      <ul className="space-y-1.5">
        {rows.map((destination) => (
          <li key={destination.artifact_id} className="flex items-center gap-2 rounded-lg bg-panel-2 px-3 py-2 text-xs text-ink-2">
            <Badge tone="accent">{destination.label}</Badge>
            <span className="text-ink-3">→</span>
            {destination.target_type === "document" && <Link className="font-medium text-accent hover:underline" href={`/explorer?doc=${destination.target_id}`}>Company knowledge</Link>}
            {destination.target_type === "decision" && <Link className="font-medium text-accent hover:underline" href="/tribal">Decision memory (proposed)</Link>}
            {destination.target_type === "feedback" && <span className="font-medium text-ink">Protected feedback pipeline</span>}
            {destination.target_type === "task" && <Link className="font-medium text-accent hover:underline" href="/approvals">Draft task</Link>}
            {destination.target_type === "meeting" && <Link className="font-medium text-accent hover:underline" href="/meetings">Meeting preparation</Link>}
          </li>
        ))}
        {!rows.length && (
          <li className="rounded-lg bg-panel-2 px-3 py-2 text-xs text-ink-3">
            Nothing was selected for publication.
          </li>
        )}
      </ul>
      <p className="text-[11px] leading-relaxed text-ink-3">
        You can delete this interview later from your history — deletion also removes the published
        knowledge documents it produced.
      </p>
    </Card>
  );
}

/* -------------------------------------------------------------- deletion */

function DeleteButton({
  sessionId,
  receipt,
  label = "Delete",
  onDeleted,
}: {
  sessionId: string;
  receipt: string | null;
  label?: string;
  onDeleted?: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const router = useRouter();
  const remove = useMutation({
    mutationFn: () =>
      api(`/interviews/${sessionId}`, { method: "DELETE", params: { receipt } }),
    onSuccess: () => {
      setOpen(false);
      if (onDeleted) onDeleted();
      else router.push("/interviews");
    },
  });
  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)} aria-label={`${label} this interview`}>
        <Trash2 className="size-3.5" /> {label}
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Delete this interview?">
        <div className="space-y-3">
          <p className="text-sm leading-relaxed text-ink-2">
            This permanently removes the conversation, its transcript, any audio, everything
            extracted from it, and any knowledge it published. This cannot be undone.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>Keep it</Button>
            <Button variant="danger" onClick={() => remove.mutate()} disabled={remove.isPending}>
              {remove.isPending ? "Deleting…" : "Delete everything"}
            </Button>
          </div>
          {remove.isError && <p className="text-xs text-crit">{(remove.error as Error).message}</p>}
        </div>
      </Dialog>
    </>
  );
}
