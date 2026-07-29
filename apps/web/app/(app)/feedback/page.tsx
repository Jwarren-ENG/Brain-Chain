"use client";

import { useSession } from "@/components/providers";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  CardSkeleton,
  EmptyState,
  InfoNote,
  Input,
  Select,
  StatusChip,
  Tabs,
  Textarea,
} from "@/components/ui";
import { api } from "@/lib/api";
import { ASSISTANT_NAME } from "@/lib/brand";
import { cn, formatDate, hasRole } from "@/lib/utils";
import type { FeedbackAggregate, SurveyInfo } from "@brainchain/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  EyeOff,
  Frown,
  Lightbulb,
  Lock,
  Meh,
  MessageSquareHeart,
  ShieldCheck,
  Smile,
  Sparkles,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import * as React from "react";

const VISIBILITIES = [
  {
    key: "anonymous",
    label: "Anonymous",
    icon: <EyeOff className="size-4" />,
    blurb:
      "Your identity is never stored with the submission. Managers only ever see aggregated themes once enough people have contributed.",
  },
  {
    key: "confidential",
    label: "Confidential",
    icon: <Lock className="size-4" />,
    blurb:
      "Your name is stored but only visible to the feedback system for follow-up — never shown to managers in dashboards.",
  },
  {
    key: "named",
    label: "Named",
    icon: <UserRound className="size-4" />,
    blurb: "Your name travels with the feedback. Best for ideas you want credit for.",
  },
];

const CATEGORIES = ["thought", "idea", "concern", "question", "process", "friction"];

export default function FeedbackPage() {
  const { user } = useSession();
  const isManager = hasRole(user, "manager", "executive", "security_admin");
  const [tab, setTab] = React.useState("share");

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-semibold text-ink">
            <MessageSquareHeart className="size-5 text-accent" /> Employee Feedback
          </h1>
          <p className="text-xs text-ink-3">
            Thoughts, ideas and surveys — with anonymity enforced by the platform, not by promise.
          </p>
        </div>
        <Tabs
          tabs={[
            { key: "share", label: "Share feedback" },
            { key: "surveys", label: "Surveys" },
            { key: "mine", label: "My submissions" },
            ...(isManager ? [{ key: "manager", label: "Manager dashboard" }] : []),
          ]}
          value={tab}
          onChange={setTab}
        />
      </div>

      {tab === "share" && <Composer />}
      {tab === "surveys" && <Surveys />}
      {tab === "mine" && <MySubmissions />}
      {tab === "manager" && isManager && <ManagerDashboard />}
    </div>
  );
}

/* ---------------------------------------------------------------- composer */
function Composer() {
  const [visibility, setVisibility] = React.useState("anonymous");
  const [category, setCategory] = React.useState("thought");
  const [body, setBody] = React.useState("");
  const [departmentTag, setDepartmentTag] = React.useState("");
  const [projectTag, setProjectTag] = React.useState("");
  const [allowFollowup, setAllowFollowup] = React.useState(false);
  const [receipt, setReceipt] = React.useState<{ token: string; note?: string } | null>(null);
  const queryClient = useQueryClient();

  const submit = useMutation({
    mutationFn: (draft: boolean) =>
      api<{ receipt_token: string; privacy_note?: string; status: string }>("/feedback", {
        method: "POST",
        body: {
          body,
          visibility,
          category,
          department_tag: departmentTag || null,
          project_tag: projectTag || null,
          allow_followup: allowFollowup,
          draft,
        },
      }),
    onSuccess: (data) => {
      setReceipt({ token: data.receipt_token, note: data.privacy_note });
      setBody("");
      queryClient.invalidateQueries({ queryKey: ["my-feedback"] });
    },
  });

  const active = VISIBILITIES.find((v) => v.key === visibility)!;

  return (
    <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
      <Card className="p-5">
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Submission visibility">
          {VISIBILITIES.map((v) => (
            <button
              key={v.key}
              role="radio"
              aria-checked={visibility === v.key}
              onClick={() => setVisibility(v.key)}
              className={cn(
                "flex flex-col items-center gap-1.5 rounded-xl border px-3 py-3 text-xs font-medium transition-colors",
                visibility === v.key
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-line text-ink-2 hover:border-line-strong",
              )}
            >
              {v.icon}
              {v.label}
            </button>
          ))}
        </div>
        <InfoNote tone={visibility === "anonymous" ? "privacy" : "info"}>{active.blurb}</InfoNote>

        <div className="mt-4 space-y-3">
          <div className="flex gap-2">
            <Select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category">
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c[0].toUpperCase() + c.slice(1)}
                </option>
              ))}
            </Select>
            <Input
              value={departmentTag}
              onChange={(e) => setDepartmentTag(e.target.value)}
              placeholder="Department tag (optional)"
            />
            <Input
              value={projectTag}
              onChange={(e) => setProjectTag(e.target.value)}
              placeholder="Project tag (optional)"
            />
          </div>
          <Textarea
            rows={5}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="What's on your mind? A quick thought, an idea, a process that slows you down…"
            aria-label="Feedback body"
          />
          {visibility !== "anonymous" && (
            <label className="flex items-center gap-2 text-xs text-ink-2">
              <input
                type="checkbox"
                checked={allowFollowup}
                onChange={(e) => setAllowFollowup(e.target.checked)}
                className="size-3.5 accent-[var(--accent)]"
              />
              Someone may follow up with me about this
            </label>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => submit.mutate(false)} disabled={body.trim().length < 3 || submit.isPending}>
              {submit.isPending ? "Submitting…" : "Submit"}
            </Button>
            <Button
              variant="secondary"
              onClick={() => submit.mutate(true)}
              disabled={body.trim().length < 3 || submit.isPending}
            >
              Save draft
            </Button>
            <Link
              href={`/interviews/new?purpose=concern&mode=text`}
              className="inline-flex h-9.5 items-center gap-1.5 rounded-lg border border-dashed border-line-strong px-3.5 text-sm font-medium text-ink-2 hover:border-accent hover:text-accent"
              title={`Start a short interview — ${ASSISTANT_NAME} asks follow-up questions so your concern arrives with full context`}
            >
              <Sparkles className="size-4" /> Help me explain this
            </Link>
            {submit.isError && (
              <span className="text-xs text-crit">{(submit.error as Error).message}</span>
            )}
          </div>
        </div>
      </Card>

      <div className="space-y-3">
        {receipt && (
          <Card className="border-good/40 p-4">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-good">
              <ShieldCheck className="size-4" /> Submitted
            </p>
            {receipt.note && <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-2">{receipt.note}</p>}
            <p className="mt-2 text-[11px] text-ink-3">Receipt token (save it to check status):</p>
            <code className="mt-1 block break-all rounded bg-panel-2 p-2 font-mono text-[10.5px] text-ink-2">
              {receipt.token}
            </code>
          </Card>
        )}
        <Card className="p-4">
          <p className="text-xs font-semibold text-ink">How anonymity actually works here</p>
          <ul className="mt-2 space-y-1.5 text-[11.5px] leading-relaxed text-ink-3">
            <li>• Anonymous submissions are stored with <em>no</em> user ID, email or metadata link.</li>
            <li>• Timestamps are coarsened to the day to prevent timing correlation.</li>
            <li>• Managers see themes only after ≥5 submissions (configurable) — filters cannot shrink the cohort.</li>
            <li>• Audit events record that a submission happened without recording who.</li>
            <li>
              • Limitation: free-text can identify you if you include identifying details — write
              accordingly.
            </li>
          </ul>
        </Card>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- surveys */
function Surveys() {
  const { data, isLoading } = useQuery({
    queryKey: ["surveys"],
    queryFn: () => api<{ items: SurveyInfo[] }>("/surveys"),
  });
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {isLoading && (
        <>
          <CardSkeleton />
          <CardSkeleton />
        </>
      )}
      {data?.items.map((s) => (
        <SurveyCard key={s.id} survey={s} />
      ))}
      {data && !data.items.length && <EmptyState title="No open surveys right now" />}
    </div>
  );
}

function SurveyCard({ survey }: { survey: SurveyInfo }) {
  const [answers, setAnswers] = React.useState<Record<string, string>>({});
  const [visibility, setVisibility] = React.useState("anonymous");
  const [done, setDone] = React.useState(false);

  const submit = useMutation({
    mutationFn: () =>
      api("/feedback", {
        method: "POST",
        body: {
          body: Object.entries(answers)
            .map(([qid, a]) => {
              const q = survey.questions.find((x) => x.id === qid);
              return `${q?.text ?? qid}: ${a}`;
            })
            .join("\n"),
          visibility,
          category: "survey_answer",
          survey_id: survey.id,
          answers,
        },
      }),
    onSuccess: () => setDone(true),
  });

  if (done) {
    return (
      <Card className="flex flex-col items-center justify-center gap-2 p-6 text-center">
        <ShieldCheck className="size-6 text-good" />
        <p className="text-sm font-medium text-ink">Response recorded</p>
        <p className="text-xs text-ink-3">
          {visibility === "anonymous"
            ? "Submitted anonymously — no identity stored."
            : "Thanks for your response."}
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-ink">{survey.title}</p>
          <p className="text-[11px] text-ink-3">
            {survey.description} {survey.closes_at ? `· closes ${formatDate(survey.closes_at)}` : ""}
          </p>
        </div>
        <Badge tone="accent">{survey.kind.replace(/_/g, " ")}</Badge>
      </div>
      <div className="mt-3 space-y-3">
        {survey.questions.map((q) => (
          <div key={q.id}>
            <label className="mb-1 block text-xs font-medium text-ink-2">{q.text}</label>
            {q.qtype === "scale" ? (
              <div className="flex gap-1.5" role="radiogroup" aria-label={q.text}>
                {q.options.map((opt) => (
                  <button
                    key={opt}
                    role="radio"
                    aria-checked={answers[q.id] === opt}
                    onClick={() => setAnswers((a) => ({ ...a, [q.id]: opt }))}
                    className={cn(
                      "size-8 rounded-lg border text-xs font-semibold",
                      answers[q.id] === opt
                        ? "border-accent bg-accent text-accent-ink"
                        : "border-line text-ink-2 hover:border-line-strong",
                    )}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            ) : (
              <Textarea
                rows={2}
                value={answers[q.id] ?? ""}
                onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
              />
            )}
          </div>
        ))}
        <div className="flex items-center gap-2">
          <Select value={visibility} onChange={(e) => setVisibility(e.target.value)} aria-label="Visibility">
            <option value="anonymous">Anonymous</option>
            <option value="confidential">Confidential</option>
            <option value="named">Named</option>
          </Select>
          <Button
            size="sm"
            onClick={() => submit.mutate()}
            disabled={!Object.keys(answers).length || submit.isPending}
          >
            Submit survey
          </Button>
        </div>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------- mine */
function MySubmissions() {
  const { data, isLoading } = useQuery({
    queryKey: ["my-feedback"],
    queryFn: () =>
      api<{ items: { id: string; visibility: string; category: string; body: string; status: string; created_at: string }[] }>(
        "/feedback/mine",
      ),
  });
  return (
    <div className="space-y-3">
      <InfoNote tone="privacy">
        Only named and confidential submissions appear here. Anonymous submissions are deliberately
        not linked to your account — use your receipt token to check one.
      </InfoNote>
      {isLoading && <CardSkeleton />}
      {data?.items.map((f) => (
        <Card key={f.id} className="p-4">
          <div className="flex items-center gap-2">
            <Badge tone="neutral">{f.category}</Badge>
            <Badge tone={f.visibility === "confidential" ? "warn" : "accent"}>{f.visibility}</Badge>
            <span className="ml-auto text-[11px] text-ink-3">{formatDate(f.created_at)}</span>
            <StatusChip status={f.status} />
          </div>
          <p className="mt-2 text-xs leading-relaxed text-ink-2">{f.body}</p>
        </Card>
      ))}
      {data && !data.items.length && <EmptyState title="No named or confidential submissions yet" />}
    </div>
  );
}

/* -------------------------------------------------------- manager dashboard */
function ManagerDashboard() {
  const [category, setCategory] = React.useState("");
  const [departmentTag, setDepartmentTag] = React.useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["feedback-aggregate", category, departmentTag],
    queryFn: () =>
      api<FeedbackAggregate>("/feedback/aggregate", {
        params: { category, department_tag: departmentTag },
      }),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category filter">
          <option value="">All categories</option>
          {[...CATEGORIES, "survey_answer"].map((c) => (
            <option key={c} value={c}>
              {c.replace(/_/g, " ")}
            </option>
          ))}
        </Select>
        <Input
          value={departmentTag}
          onChange={(e) => setDepartmentTag(e.target.value)}
          placeholder="Department tag filter"
          className="max-w-48"
        />
        {data && (
          <Badge tone={data.cohort_met ? "good" : "warn"} className="ml-auto">
            {data.response_count} responses · cohort minimum {data.threshold}
          </Badge>
        )}
      </div>

      {isLoading && <CardSkeleton rows={5} />}

      {data && !data.cohort_met && (
        <Card className="border-warn/40 p-6 text-center">
          <EyeOff className="mx-auto size-6 text-warn" />
          <p className="mt-2 text-sm font-medium text-ink">Cohort too small to report</p>
          <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-ink-3">{data.message}</p>
        </Card>
      )}

      {data?.cohort_met && data.sentiment && (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <SentimentTile icon={<Smile className="size-4" />} label="Positive" value={data.sentiment.positive} total={data.response_count} tone="good" />
            <SentimentTile icon={<Meh className="size-4" />} label="Neutral" value={data.sentiment.neutral} total={data.response_count} tone="neutral" />
            <SentimentTile icon={<Frown className="size-4" />} label="Negative" value={data.sentiment.negative} total={data.response_count} tone="crit" />
          </div>

          <Card>
            <CardHeader
              title="Themes"
              sub={`Confidence: ${data.confidence} · themes below the cohort floor stay suppressed`}
            />
            <div className="divide-y divide-line">
              {data.themes.map((t) => (
                <div key={t.name} className="px-4 py-3">
                  {t.suppressed ? (
                    <div className="flex items-center gap-2">
                      <EyeOff className="size-3.5 text-ink-3" />
                      <p className="text-xs font-medium text-ink-2">{t.name}</p>
                      <span className="text-[11px] text-ink-3">— {t.message}</span>
                    </div>
                  ) : (
                    <>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium text-ink">{t.name}</p>
                        <Badge tone="accent">{t.count} responses</Badge>
                        <Badge tone={(t.negative_share ?? 0) >= 0.5 ? "crit" : "neutral"}>
                          {Math.round((t.negative_share ?? 0) * 100)}% negative
                        </Badge>
                        <Badge tone="neutral">{t.trend}</Badge>
                      </div>
                      <div className="mt-2 space-y-1">
                        {t.sample_excerpts?.map((ex, i) => (
                          <p key={i} className="border-l-2 border-line pl-2.5 text-[11.5px] italic text-ink-3">
                            “{ex}”
                          </p>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              ))}
              {!data.themes.length && (
                <p className="px-4 py-6 text-center text-xs text-ink-3">No themes matched.</p>
              )}
            </div>
          </Card>

          {data.suggested_actions.length > 0 && (
            <Card>
              <CardHeader icon={<Lightbulb className="size-4" />} title="Suggested management actions" />
              <ul className="space-y-1.5 p-4">
                {data.suggested_actions.map((a, i) => (
                  <li key={i} className="rounded-lg bg-panel-2 px-3 py-2 text-xs leading-relaxed text-ink-2">
                    {a}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}

      <InfoNote tone="privacy">
        This dashboard only ever receives cohort-protected aggregates from the server. There is no
        API that returns individual anonymous submissions, and author-level filters do not exist.
      </InfoNote>
    </div>
  );
}

function SentimentTile({
  icon,
  label,
  value,
  total,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  total: number;
  tone: "good" | "neutral" | "crit";
}) {
  const pct = total ? Math.round((value / total) * 100) : 0;
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-xs font-medium text-ink-2">
        <span className={cn(tone === "good" && "text-good", tone === "crit" && "text-crit", tone === "neutral" && "text-ink-3")}>
          {icon}
        </span>
        {label}
      </div>
      <p className="mt-1.5 text-2xl font-semibold tabular-nums text-ink">
        {value} <span className="text-sm font-normal text-ink-3">({pct}%)</span>
      </p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-panel-2" aria-hidden>
        <div
          className={cn(
            "h-full rounded-full",
            tone === "good" && "bg-good",
            tone === "crit" && "bg-crit",
            tone === "neutral" && "bg-ink-3",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </Card>
  );
}
