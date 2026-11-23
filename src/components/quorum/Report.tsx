import { useState } from "react";
import {
  Copy,
  Printer,
  Banknote,
  Megaphone,
  Cog,
  ShieldAlert,
  HeartHandshake,
  Swords,
  Skull,
  Check,
} from "lucide-react";
import type { Report, SeatId, Vote, Verdict } from "@/lib/council";
import { SEATS, providerLabel, seatShort, tallyVotes, buildBoardMemo } from "@/lib/council";
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
} from "recharts";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const ICONS: Record<SeatId, typeof Banknote> = {
  cfo: Banknote,
  cmo: Megaphone,
  coo: Cog,
  cro: ShieldAlert,
  customer: HeartHandshake,
};
const voteCls: Record<Vote, string> = {
  approve: "bg-approve/15 text-approve border-approve/30",
  conditional: "bg-conditional/15 text-conditional border-conditional/30",
  reject: "bg-reject/15 text-reject border-reject/30",
};
const verdictCls: Record<Verdict, string> = {
  APPROVED: "text-approve border-approve/40",
  "CONDITIONAL APPROVAL": "text-conditional border-conditional/40",
  REJECTED: "text-reject border-reject/40",
};

export function VoteBadge({ vote }: { vote: Vote }) {
  return (
    <span
      className={cn(
        "rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider",
        voteCls[vote],
      )}
    >
      {vote}
    </span>
  );
}

const SCORE_LABELS = [
  ["financialViability", "Financial viability"],
  ["marketUpside", "Market upside"],
  ["executionFeasibility", "Execution feasibility"],
  ["riskSafety", "Risk safety"],
] as const;

export function ReportView({
  report,
  onToggle,
}: {
  report: Report;
  onToggle: (i: number) => void;
}) {
  const t = tallyVotes(report.members);
  const [full, setFull] = useState(false);
  const RADAR_LABELS = {
    financialViability: "Financial",
    marketUpside: "Market",
    executionFeasibility: "Execution",
    riskSafety: "Risk safety",
  } as const;
  const radar = SCORE_LABELS.map(([k]) => ({ axis: RADAR_LABELS[k], value: report.scores[k] }));
  const ready = report.checked.length,
    total = report.guardrails.length;
  const copyMemo = async () => {
    try {
      await navigator.clipboard.writeText(buildBoardMemo(report));
      toast.success("Board memo copied", { description: "Markdown summary is on your clipboard." });
    } catch {
      toast.error("Couldn't copy — your browser blocked clipboard access.");
    }
  };
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Executive decision report · {new Date(report.createdAt).toLocaleDateString()}
          </p>
          <p className="mt-1 line-clamp-1 max-w-2xl font-serif text-base sm:line-clamp-2 sm:text-lg">
            {report.input.decision}
          </p>
        </div>
        <div className="no-print flex gap-2">
          <button
            onClick={copyMemo}
            className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-accent"
          >
            <Copy className="h-3.5 w-3.5" /> Copy Board Memo
          </button>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-accent"
          >
            <Printer className="h-3.5 w-3.5" /> Export PDF
          </button>
        </div>
      </div>
      <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
        <section className={cn("glass min-w-0 border-l-4 p-4 sm:p-6", verdictCls[report.verdict])}>
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
            <div className="min-w-0">
              <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
                Final decision
              </p>
              <h2 className="mt-1 font-serif text-2xl font-semibold leading-tight sm:text-3xl md:text-4xl">
                {report.verdict}
              </h2>
              <p className="mt-2 font-mono text-xs text-muted-foreground sm:text-sm">
                {t.approve} Approve · {t.conditional} Conditional · {t.reject} Reject
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
                Consensus
              </p>
              <p className="font-serif text-4xl text-foreground sm:text-5xl">
                {report.consensusScore}
                <span className="text-lg text-muted-foreground">/100</span>
              </p>
            </div>
          </div>
          <p
            onClick={() => setFull((f) => !f)}
            className={cn(
              "mt-4 max-w-3xl cursor-pointer text-sm leading-relaxed text-foreground/90 sm:cursor-auto sm:text-base",
              !full && "line-clamp-4 sm:line-clamp-none print:line-clamp-none",
            )}
          >
            {report.executiveSummary}
          </p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {SCORE_LABELS.map(([k, label]) => {
              const v = report.scores[k];
              return (
                <div key={k}>
                  <div className="flex justify-between font-mono text-xs text-muted-foreground">
                    <span>{label}</span>
                    <span className="text-foreground">{v}</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded bg-muted">
                    <div
                      className={cn(
                        "h-1.5 rounded",
                        v >= 67 ? "bg-approve" : v >= 40 ? "bg-conditional" : "bg-reject",
                      )}
                      style={{ width: `${v}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
        <section className="glass flex min-w-0 flex-col p-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            4-axis assessment
          </p>
          <div className="h-56 w-full shrink-0 sm:h-64 xl:h-auto xl:min-h-64 xl:flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radar} outerRadius="55%">
                <PolarGrid stroke="var(--border)" />
                <PolarAngleAxis
                  dataKey="axis"
                  tick={{
                    fill: "var(--muted-foreground)",
                    fontSize: 10,
                    fontFamily: "var(--font-mono)",
                  }}
                />
                <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                <Radar
                  dataKey="value"
                  stroke="var(--primary)"
                  fill="var(--primary)"
                  fillOpacity={0.25}
                  strokeWidth={2}
                  isAnimationActive={false}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {report.members.map((m) => {
          const Icon = ICONS[m.role];
          return (
            <article key={m.role} className="glass flex flex-col gap-3 p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon className="h-5 w-5 text-primary" />
                  <span className="font-semibold">{seatShort(m.role)}</span>
                  <span
                    title={
                      m.fallback
                        ? `Chosen provider was unavailable; answered by ${providerLabel(m.provider)}${m.model ? ` (${m.model})` : ""}`
                        : m.model
                    }
                    className="rounded border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                  >
                    {providerLabel(m.provider)}
                    {m.fallback ? "*" : ""}
                  </span>
                </div>
                <VoteBadge vote={m.vote} />
              </div>
              <div>
                <div className="flex justify-between font-mono text-xs text-muted-foreground">
                  <span>Confidence</span>
                  <span>{m.confidence}%</span>
                </div>
                <div className="mt-1 h-1 rounded bg-muted">
                  <div className="h-1 rounded bg-primary" style={{ width: `${m.confidence}%` }} />
                </div>
              </div>
              <p className="font-serif text-lg leading-snug">"{m.thesis}"</p>
              <dl className="space-y-2 text-sm">
                <div>
                  <dt className="font-mono text-[10px] uppercase tracking-wider text-reject">
                    #1 Dealbreaker
                  </dt>
                  <dd className="text-foreground/85">{m.dealbreaker}</dd>
                </div>
                <div>
                  <dt className="font-mono text-[10px] uppercase tracking-wider text-approve">
                    Recommended condition
                  </dt>
                  <dd className="text-foreground/85">{m.condition}</dd>
                </div>
              </dl>
            </article>
          );
        })}
      </section>

      {report.tensions.length > 0 && (
        <section className="glass p-6">
          <h3 className="flex items-center gap-2 font-serif text-xl">
            <Swords className="h-5 w-5 text-conditional" /> Boardroom Tension Map
          </h3>
          <ul className="mt-4 grid gap-3 md:grid-cols-3">
            {report.tensions.map((x) => (
              <li
                key={x.sideA + x.sideB}
                className="rounded-lg border border-border bg-background/40 p-4"
              >
                <p className="font-mono text-sm">
                  <span className="text-primary">{seatShort(x.sideA)}</span>{" "}
                  <span className="text-muted-foreground">vs.</span>{" "}
                  <span className="text-primary">{seatShort(x.sideB)}</span>
                </p>
                <p className="mt-2 text-sm text-foreground/85">{x.conflictSummary}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="glass p-6">
          <h3 className="flex items-center gap-2 font-serif text-xl">
            <Skull className="h-5 w-5 text-reject" /> 12-Month Pre-Mortem
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            If this fails in 12 months, here is why:
          </p>
          <p className="mt-4 font-serif text-lg leading-relaxed text-foreground/90">
            {report.preMortem}
          </p>
        </div>
        <div className="glass p-6">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-serif text-xl">Guardrails & Kill Criteria</h3>
            <span
              className={cn(
                "rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider",
                ready === total && total > 0
                  ? "border-approve/30 bg-approve/15 text-approve"
                  : "border-conditional/30 bg-conditional/15 text-conditional",
              )}
            >
              {ready}/{total} Ready
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Tick each one off as you put it in place.
          </p>
          <ul className="mt-4 space-y-2">
            {report.guardrails.map((g, i) => {
              const done = report.checked.includes(i);
              return (
                <li key={i}>
                  <button
                    role="checkbox"
                    aria-checked={done}
                    onClick={() => onToggle(i)}
                    className="flex w-full items-start gap-3 rounded-md p-2 text-left text-sm hover:bg-accent/50"
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                        done ? "border-approve bg-approve text-primary-foreground" : "border-input",
                      )}
                    >
                      {done && <Check className="h-3 w-3" />}
                    </span>
                    <span className={cn("flex-1", done && "text-muted-foreground line-through")}>
                      <span className="font-medium">{g.metric}</span>
                      <span className="mt-0.5 block font-mono text-xs text-muted-foreground">
                        <span className="text-reject">{g.threshold}</span> · {g.timeframe}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </section>
    </div>
  );
}
export { SEATS };
