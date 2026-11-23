import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  History,
  X,
  PencilLine,
  FilePlus2,
  Trash2,
  Gavel,
  Loader2,
  CheckCircle2,
  Sparkles,
  AlertTriangle,
  Paperclip,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ATTACHMENT_ACCEPT, readAttachment } from "@/lib/attachments";
import {
  PRESETS,
  PROVIDERS,
  SEATS,
  type Provider,
  type DecisionInput,
  type Report,
  type SeatId,
} from "@/lib/council";
import { conveneCouncil, getCouncilConfig } from "@/lib/council.functions";
import { ICONS, ReportView } from "@/components/quorum/Report";
import { ChallengePanel, ShiftBanner } from "@/components/quorum/Challenge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Quorum — Stress-test decisions with an AI boardroom" },
      {
        name: "description",
        content:
          "Convene a CFO, CMO, COO, Risk Officer and Customer Advocate to vote on your next business decision.",
      },
      { property: "og:title", content: "Quorum — AI Boardroom" },
      {
        property: "og:description",
        content: "Stress-test business decisions with an AI executive council.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  // Which AI providers have server-side API keys; drives the seat pickers and setup notice.
  loader: () => getCouncilConfig(),
  component: Index,
});

const KEY = "quorum.history.v2";
const SEAT_STEPS: Record<SeatId, string> = {
  cfo: "CFO analyzing unit economics...",
  cmo: "CMO sizing market upside...",
  coo: "COO pressure-testing execution...",
  cro: "Risk Officer running pre-mortem...",
  customer: "Customer Advocate gauging trust...",
};
const stepsFor = (seats: SeatId[]) => [
  ...seats.map((s) => SEAT_STEPS[s]),
  "Mapping boardroom tensions...",
  "Synthesizing verdict...",
];
const field =
  "w-full rounded-md border border-input bg-background/60 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";

function Index() {
  const ai = Route.useLoaderData();
  const defaultProvider: Provider = ai.defaultProvider ?? "openai";
  const configured = ai.defaultProvider !== null;
  const [inputState, setInput] = useState<DecisionInput>({
    decision: "",
    stage: "Startup",
    budget: "",
    risk: "Medium",
    horizon: "6 months",
    seats: SEATS.map((s) => s.id),
  });
  const input = inputState;
  const runSample = () => {
    const preset = PRESETS[0];
    if (!preset) return;
    const next = { ...inputState, ...preset.input, seats: SEATS.map((s) => s.id) };
    setInput(next);
    void convene(next);
  };
  const fileInput = useRef<HTMLInputElement>(null);
  const [readingFile, setReadingFile] = useState(false);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const attachFile = async (file?: File) => {
    if (!file) return;
    setReadingFile(true);
    setAttachmentError(null);
    try {
      const attachment = await readAttachment(file);
      setInput((previous) => ({ ...previous, attachment }));
    } catch (error) {
      setAttachmentError(
        error instanceof Error
          ? error.message
          : "This file couldn't be read. Try another document.",
      );
    } finally {
      setReadingFile(false);
    }
  };
  const removeAttachment = () => {
    setInput(({ attachment: _attachment, ...rest }) => rest);
    setAttachmentError(null);
  };
  const [history, setHistory] = useState<Report[]>([]);
  const [current, setCurrent] = useState<Report | null>(null);
  const [step, setStep] = useState(-1);
  const [drawer, setDrawer] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [steps, setSteps] = useState<string[]>([]);
  const convFn = useServerFn(conveneCouncil);
  const [intakeOpen, setIntakeOpen] = useState(true);
  const [view, setView] = useState<"original" | "revised">("original");
  const [revoting, setRevoting] = useState(false);
  const shown: Report | null =
    current && current.revision && view === "revised"
      ? { ...current, ...current.revision, revision: current.revision }
      : current;
  const persist = (r: Report) => {
    setCurrent(r);
    save(
      history.some((h) => h.id === r.id)
        ? history.map((h) => (h.id === r.id ? r : h))
        : [r, ...history],
    );
  };
  const challengeBoard = async (challenge: string) => {
    if (!current) return;
    setRevoting(true);
    try {
      const { verdict, consensusScore, executiveSummary, members } = current;
      const res = await convFn({
        data: {
          ...current.input,
          challenge,
          previousReport: { verdict, consensusScore, executiveSummary, members },
        },
      });
      if (!res.ok) {
        toast.error("Re-vote failed", { description: res.error });
        return;
      }
      persist({
        ...current,
        revision: { ...res.result, challenge, shiftSummary: res.shiftSummary ?? "", checked: [] },
      });
      setView("revised");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      console.error(e);
      toast.error("Re-vote failed", {
        description: "We couldn't reach the council. Please try again.",
      });
    } finally {
      setRevoting(false);
    }
  };

  useEffect(() => {
    try {
      const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
      if (Array.isArray(v)) setHistory(v);
    } catch {
      /* ignore */
    }
  }, []);
  const save = (h: Report[]) => {
    setHistory(h);
    localStorage.setItem(KEY, JSON.stringify(h));
  };

  const convene = async (override?: DecisionInput) => {
    const input = override ?? inputState;
    const st = stepsFor(input.seats);
    setCurrent(null);
    setError(null);
    setSteps(st);
    setStep(0);
    setIntakeOpen(false);
    // Advance the tracker while the board deliberates, holding on the final step until the answer arrives.
    const timer = setInterval(() => setStep((i) => Math.min(i + 1, st.length - 1)), 2200);
    try {
      const res = await convFn({ data: input });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const r: Report = {
        ...res.result,
        id: `${Date.now().toString(36)}`,
        createdAt: Date.now(),
        input,
        checked: [],
      };
      setCurrent(r);
      setView("original");
      save([r, ...history].slice(0, 30));
    } catch (e) {
      console.error(e);
      setError("We couldn't reach the council. Check your connection and try again.");
    } finally {
      clearInterval(timer);
      setStep(-1);
    }
  };
  const toggleSeat = (id: SeatId) =>
    setInput((p) => ({
      ...p,
      seats: p.seats.includes(id)
        ? p.seats.filter((s) => s !== id)
        : SEATS.map((s) => s.id).filter((s) => s === id || p.seats.includes(s)),
    }));
  const toggleGuard = (i: number) => {
    if (!current) return;
    const flip = (c: number[]) => (c.includes(i) ? c.filter((x) => x !== i) : [...c, i]);
    if (view === "revised" && current.revision)
      persist({
        ...current,
        revision: { ...current.revision, checked: flip(current.revision.checked) },
      });
    else persist({ ...current, checked: flip(current.checked) });
  };
  const busy = step >= 0;
  const canGo =
    configured &&
    input.decision.trim().length > 5 &&
    input.seats.length > 0 &&
    !busy &&
    !readingFile;

  return (
    <div className="min-h-screen">
      <header className="no-print sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between px-4 py-3 md:px-6">
          <div className="flex items-center gap-2">
            <Gavel className="h-5 w-5 text-primary" />
            <span className="font-serif text-2xl font-semibold tracking-tight">Quorum</span>
            <span className="hidden font-mono text-xs text-muted-foreground sm:inline">
              · AI Boardroom
            </span>
          </div>
          <button
            onClick={() => setDrawer(true)}
            className="flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent"
          >
            <History className="h-4 w-4" /> Past Decisions{" "}
            <span className="font-mono text-xs text-muted-foreground">{history.length}</span>
          </button>
        </div>
      </header>

      <main className="mx-auto grid max-w-[1400px] gap-6 px-4 py-6 md:px-6 lg:grid-cols-[380px_1fr] print:block">
        <aside
          className={cn(
            "no-print glass h-fit min-w-0 space-y-5 p-5 lg:sticky lg:top-20",
            !intakeOpen && "hidden md:block",
          )}
        >
          <div>
            <label className="font-serif text-lg">
              What business decision are you considering?
            </label>
            <textarea
              id="decision"
              aria-label="What business decision are you considering?"
              value={input.decision}
              onChange={(e) => setInput({ ...input, decision: e.target.value })}
              rows={5}
              placeholder="e.g. Expand into the German market in Q3…"
              className={cn(field, "mt-2 resize-none")}
            />
            <input
              ref={fileInput}
              type="file"
              accept={ATTACHMENT_ACCEPT}
              className="hidden"
              aria-label="Attach supporting document"
              onChange={(event) => {
                void attachFile(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
            <div className="mt-2 flex min-w-0 items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy || readingFile}
                title="Attach PDF, Word, TXT, Markdown, CSV or JSON · up to 5 MB"
                onClick={() => fileInput.current?.click()}
                className="shrink-0 text-muted-foreground"
              >
                {readingFile ? <Loader2 className="animate-spin" /> : <Paperclip />}{" "}
                {readingFile ? "Reading…" : "Attach file"}
              </Button>
              {input.attachment && (
                <div className="flex min-w-0 flex-1 items-center gap-1 rounded-md border border-border bg-secondary px-2 text-xs">
                  <FileText className="h-3.5 w-3.5 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1 truncate" title={input.attachment.name}>
                    {input.attachment.name}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    aria-label="Remove attachment"
                    title="Remove attachment"
                    disabled={busy || readingFile}
                    onClick={removeAttachment}
                  >
                    <X />
                  </Button>
                </div>
              )}
            </div>
            {attachmentError && (
              <p role="alert" className="mt-2 text-xs text-reject">
                {attachmentError}
              </p>
            )}
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              Try a sample decision
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p.label}
                  onClick={() => setInput({ ...input, ...p.input })}
                  className="rounded-full border border-border bg-secondary px-3 py-1 text-left text-xs hover:border-primary hover:text-primary"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Sel
              label="Company stage"
              value={input.stage}
              opts={["Startup", "SMB", "Enterprise"]}
              onChange={(v) => setInput({ ...input, stage: v as DecisionInput["stage"] })}
            />
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">Budget at stake</span>
              <input
                value={input.budget}
                onChange={(e) => setInput({ ...input, budget: e.target.value })}
                placeholder="£50,000"
                className={field}
              />
            </label>
            <Sel
              label="Risk appetite"
              value={input.risk}
              opts={["Low", "Medium", "High"]}
              onChange={(v) => setInput({ ...input, risk: v as DecisionInput["risk"] })}
            />
            <Sel
              label="Time horizon"
              value={input.horizon}
              opts={["30 days", "6 months", "1 year"]}
              onChange={(v) => setInput({ ...input, horizon: v as DecisionInput["horizon"] })}
            />
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              Council seats · {input.seats.length}/5
            </p>
            <div className="mt-2 space-y-1.5">
              {SEATS.map((s) => {
                const on = input.seats.includes(s.id);
                const Icon = ICONS[s.id];
                const prov = input.providers?.[s.id] ?? defaultProvider;
                return (
                  <div
                    key={s.id}
                    className={cn(
                      "flex min-w-0 items-center gap-2 rounded-md border pr-2 text-sm transition",
                      on
                        ? "border-primary/40 bg-primary/10"
                        : "border-border opacity-55 hover:opacity-80",
                    )}
                  >
                    <button
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggleSeat(s.id)}
                      className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2 text-left"
                    >
                      <Icon
                        className={cn(
                          "h-4 w-4 shrink-0",
                          on ? "text-primary" : "text-muted-foreground",
                        )}
                      />
                      <span className="min-w-0 flex-1">{s.title}</span>
                      <span
                        className={cn(
                          "h-4 w-7 shrink-0 rounded-full p-0.5 transition",
                          on ? "bg-primary" : "bg-muted",
                        )}
                      >
                        <span
                          className={cn(
                            "block h-3 w-3 rounded-full bg-background transition",
                            on && "translate-x-3",
                          )}
                        />
                      </span>
                    </button>
                    <select
                      aria-label={`AI provider for ${s.short}`}
                      title={ai.models[prov] ?? "Not configured on the server"}
                      disabled={!on || !configured}
                      value={prov}
                      onChange={(e) =>
                        setInput((p) => ({
                          ...p,
                          providers: { ...p.providers, [s.id]: e.target.value as Provider },
                        }))
                      }
                      className="shrink-0 rounded border border-input bg-background/70 px-1.5 py-1 font-mono text-[11px] outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                    >
                      {PROVIDERS.map((p) => (
                        <option key={p.id} value={p.id} disabled={!ai.models[p.id]}>
                          {p.label}
                          {ai.models[p.id] ? "" : " (no key)"}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
          </div>
          {!configured && (
            <div
              role="alert"
              className="rounded-md border border-conditional/40 bg-conditional/10 p-3 text-xs leading-relaxed"
            >
              <p className="flex items-center gap-1.5 font-semibold text-conditional">
                <AlertTriangle className="h-3.5 w-3.5" /> No AI provider configured
              </p>
              <p className="mt-1 text-muted-foreground">
                Set <code className="font-mono">OPENAI_API_KEY</code>,{" "}
                <code className="font-mono">ANTHROPIC_API_KEY</code> or{" "}
                <code className="font-mono">GEMINI_API_KEY</code> in the server environment (see{" "}
                <code className="font-mono">.env.example</code>) and restart.
              </p>
            </div>
          )}
          {ai.issues.length > 0 && (
            <ul
              role="status"
              className="space-y-1 rounded-md border border-border p-3 text-xs text-muted-foreground"
            >
              {ai.issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          )}
          <button
            disabled={!canGo}
            onClick={() => convene()}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-3 font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-40"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gavel className="h-4 w-4" />}{" "}
            Convene Council
          </button>
        </aside>

        <section className="min-w-0">
          {!intakeOpen && (
            <div className="no-print mb-4 grid grid-cols-2 gap-2 md:hidden">
              <button
                onClick={() => {
                  setIntakeOpen(true);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                className="flex items-center justify-center gap-2 rounded-md border border-border bg-secondary px-3 py-2 text-sm"
              >
                <PencilLine className="h-4 w-4 shrink-0" /> Edit Decision
              </button>
              <button
                disabled={busy || readingFile}
                onClick={() => {
                  setCurrent(null);
                  setError(null);
                  setIntakeOpen(true);
                  setAttachmentError(null);
                  setInput(({ attachment: _attachment, ...p }) => ({
                    ...p,
                    decision: "",
                    budget: "",
                  }));
                }}
                className="flex items-center justify-center gap-2 rounded-md border border-border bg-secondary px-3 py-2 text-sm disabled:opacity-40"
              >
                <FilePlus2 className="h-4 w-4 shrink-0" /> New Case
              </button>
            </div>
          )}
          {busy ? (
            <div className="glass mx-auto max-w-lg p-8">
              <p className="font-serif text-2xl">Council deliberating…</p>
              <div className="mt-4 h-1 overflow-hidden rounded bg-muted">
                <div
                  className="h-1 rounded bg-primary transition-all duration-700"
                  style={{ width: `${((step + 1) / steps.length) * 100}%` }}
                />
              </div>
              <ul className="mt-6 space-y-3">
                {steps.map((s, i) => (
                  <li
                    key={s}
                    className={cn(
                      "flex items-center gap-3 text-sm transition",
                      i > step && "opacity-30",
                    )}
                  >
                    {i < step ? (
                      <CheckCircle2 className="h-4 w-4 text-approve" />
                    ) : i === step ? (
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    ) : (
                      <span className="h-4 w-4 rounded-full border border-border" />
                    )}
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          ) : error ? (
            <div className="glass mx-auto max-w-lg border-reject/40 p-8 text-center">
              <AlertTriangle className="mx-auto h-8 w-8 text-reject" />
              <p className="mt-3 font-serif text-2xl">The council couldn't reach a verdict</p>
              <p className="mt-2 text-sm text-muted-foreground">{error}</p>
              <button
                onClick={() => convene()}
                disabled={!canGo}
                className="mt-5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-40"
              >
                Try again
              </button>
            </div>
          ) : current && shown ? (
            <div className="space-y-6">
              {current.revision && (
                <ShiftBanner
                  original={current}
                  revision={current.revision}
                  view={view}
                  onView={setView}
                />
              )}
              <ReportView report={shown} onToggle={toggleGuard} />
              <ChallengePanel busy={revoting} onSubmit={challengeBoard} />
            </div>
          ) : (
            <div className="glass flex min-h-[60vh] flex-col items-center justify-center p-10 text-center">
              <Sparkles className="h-8 w-8 text-primary" />
              <h1 className="mt-4 font-serif text-4xl font-semibold md:text-5xl">
                The board is waiting.
              </h1>
              <p className="mt-3 max-w-md text-muted-foreground">
                Describe a decision, seat your council, and get a verdict, vote tally, tension map
                and pre-mortem before you commit.
              </p>
              <button
                disabled={readingFile || !configured}
                onClick={runSample}
                className="mt-6 rounded-md bg-primary px-5 py-2.5 font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-40"
              >
                Run Sample Decision →
              </button>
              <p className="mt-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                Raise SaaS pricing by 30% · full 5-seat board
              </p>
            </div>
          )}
        </section>
      </main>

      {drawer && (
        <div
          className="fixed inset-0 z-40 flex justify-end bg-background/60 backdrop-blur-sm"
          onClick={() => setDrawer(false)}
        >
          <div
            className="h-full w-full max-w-sm overflow-y-auto border-l border-border bg-card p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="font-serif text-xl">Past Decisions</h2>
              <button onClick={() => setDrawer(false)} aria-label="Close">
                <X className="h-5 w-5" />
              </button>
            </div>
            {history.length === 0 && (
              <p className="mt-6 text-sm text-muted-foreground">
                No decisions yet. Convene the council to start your record.
              </p>
            )}
            <ul className="mt-4 space-y-2">
              {history.map((h) => (
                <li
                  key={h.id}
                  className="group rounded-md border border-border p-3 hover:border-primary/40"
                >
                  <button
                    className="w-full text-left"
                    onClick={() => {
                      setCurrent(h);
                      setIntakeOpen(false);
                      setView(h.revision ? "revised" : "original");
                      setError(null);
                      setDrawer(false);
                    }}
                  >
                    <p
                      className={cn(
                        "font-mono text-[10px] uppercase tracking-wider",
                        h.verdict === "APPROVED"
                          ? "text-approve"
                          : h.verdict === "REJECTED"
                            ? "text-reject"
                            : "text-conditional",
                      )}
                    >
                      {h.verdict} · {h.consensusScore}
                    </p>
                    <p className="mt-1 line-clamp-2 text-sm">{h.input.decision}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {new Date(h.createdAt).toLocaleString()}
                    </p>
                  </button>
                  <button
                    onClick={() => {
                      save(history.filter((x) => x.id !== h.id));
                      if (current?.id === h.id) setCurrent(null);
                    }}
                    className="mt-1 flex items-center gap-1 text-xs text-muted-foreground hover:text-reject"
                  >
                    <Trash2 className="h-3 w-3" /> Delete
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

function Sel({
  label,
  value,
  opts,
  onChange,
}: {
  label: string;
  value: string;
  opts: string[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="space-y-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={field}>
        {opts.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    </label>
  );
}
