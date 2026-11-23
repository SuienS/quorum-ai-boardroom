import type { Attachment } from "./attachments";

export type SeatId = "cfo" | "cmo" | "coo" | "cro" | "customer";
export type Vote = "approve" | "conditional" | "reject";
export type Provider = "openai" | "anthropic" | "google";
/** Display labels. Model ids are configured on the server (see `.env.example`). */
export const PROVIDERS: { id: Provider; label: string }[] = [
  { id: "openai", label: "OpenAI" },
  { id: "anthropic", label: "Anthropic" },
  { id: "google", label: "Google" },
];
export const providerLabel = (p?: Provider) => PROVIDERS.find((x) => x.id === p)?.label ?? "OpenAI";

/** Server AI configuration that is safe to expose to the browser (no keys or URLs). */
export interface PublicAiConfig {
  /** Provider used when a seat has none chosen; null when no API key is configured. */
  defaultProvider: Provider | null;
  /** Model id per configured provider. Providers without a key are absent. */
  models: Partial<Record<Provider, string>>;
  /** Operator-facing configuration warnings. */
  issues: string[];
}
export type Verdict = "APPROVED" | "CONDITIONAL APPROVAL" | "REJECTED";

export interface DecisionInput {
  decision: string;
  stage: "Startup" | "SMB" | "Enterprise";
  budget: string;
  risk: "Low" | "Medium" | "High";
  horizon: "30 days" | "6 months" | "1 year";
  seats: SeatId[];
  /** AI provider per seat; missing seats use the server's default provider. */
  providers?: Partial<Record<SeatId, Provider>>;
  attachment?: Attachment;
}
export interface MemberOpinion {
  role: SeatId;
  vote: Vote;
  confidence: number;
  thesis: string;
  dealbreaker: string;
  condition: string;
  /** Provider and model that actually answered for this seat. */
  provider?: Provider;
  model?: string;
  /** True when the chosen provider was unavailable and the default provider answered instead. */
  fallback?: boolean;
}
export interface Tension {
  sideA: SeatId;
  sideB: SeatId;
  conflictSummary: string;
}
export interface Guardrail {
  metric: string;
  threshold: string;
  timeframe: string;
}
export interface Scores {
  financialViability: number;
  marketUpside: number;
  executionFeasibility: number;
  riskSafety: number;
}
/** Exact JSON shape the AI board returns. */
export interface BoardResult {
  verdict: Verdict;
  consensusScore: number;
  executiveSummary: string;
  scores: Scores;
  members: MemberOpinion[];
  tensions: Tension[];
  preMortem: string;
  guardrails: Guardrail[];
}
export interface Revision extends BoardResult {
  challenge: string;
  shiftSummary: string;
  checked: number[];
}
export interface Report extends BoardResult {
  id: string;
  createdAt: number;
  input: DecisionInput;
  checked: number[];
  revision?: Revision;
}

export const CHALLENGES = [
  "Grandfather existing customers",
  "Run a 30-day pilot with 10% of budget",
  "Cut scope in half to ship in 2 weeks",
];

/** Seats whose vote changed between two rounds. */
export function voteShifts(
  before: { members: MemberOpinion[] },
  after: { members: MemberOpinion[] },
) {
  return after.members.flatMap((m) => {
    const prev = before.members.find((p) => p.role === m.role);
    return prev && prev.vote !== m.vote ? [{ role: m.role, from: prev.vote, to: m.vote }] : [];
  });
}

export const SEATS: { id: SeatId; title: string; short: string }[] = [
  { id: "cfo", title: "Chief Financial Officer", short: "CFO" },
  { id: "cmo", title: "Chief Marketing Officer", short: "CMO" },
  { id: "coo", title: "Chief Operating Officer", short: "COO" },
  { id: "cro", title: "Chief Risk Officer · Devil's Advocate", short: "CRO" },
  { id: "customer", title: "Customer Advocate", short: "Customer" },
];
export const seatShort = (id: SeatId) => SEATS.find((s) => s.id === id)?.short ?? id;

export const PRESETS: { label: string; input: Omit<DecisionInput, "seats"> }[] = [
  {
    label: "Raise SaaS pricing by 30% next quarter",
    input: {
      decision:
        "Raise our SaaS subscription pricing by 30% across all tiers starting next quarter, grandfathering existing annual customers for 6 months.",
      stage: "SMB",
      budget: "£0 direct · £1.2M ARR exposed",
      risk: "Medium",
      horizon: "6 months",
    },
  },
  {
    label: "Spend £60k on a senior sales hire vs. paid ads",
    input: {
      decision:
        "Allocate £60k to hire a senior B2B account executive instead of spending the same budget on paid acquisition (LinkedIn + Google Ads).",
      stage: "Startup",
      budget: "£60,000",
      risk: "Medium",
      horizon: "1 year",
    },
  },
  {
    label: "Launch an AI free tier to accelerate growth",
    input: {
      decision:
        "Launch a free tier of our AI product with capped usage to accelerate top-of-funnel growth and product-led conversion.",
      stage: "Startup",
      budget: "£40,000 inference costs",
      risk: "High",
      horizon: "6 months",
    },
  },
];

export function tallyVotes(members: { vote: Vote }[]): Record<Vote, number> {
  const t = { approve: 0, conditional: 0, reject: 0 };
  members.forEach((m) => t[m.vote]++);
  return t;
}

const clamp = (n: unknown) => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));
const str = (v: unknown, fb = "") => (typeof v === "string" && v.trim() ? v.trim() : fb);
const VOTES: Vote[] = ["approve", "conditional", "reject"];
const VERDICTS: Verdict[] = ["APPROVED", "CONDITIONAL APPROVAL", "REJECTED"];
const IDS = SEATS.map((s) => s.id);

/** Defensively normalise untrusted AI JSON into a BoardResult limited to the seated roles; throws if unusable. */
export function normalizeBoardResult(raw: unknown, seats: SeatId[]): BoardResult {
  const r = (raw ?? {}) as Record<string, unknown>;
  const arr = (v: unknown) => (Array.isArray(v) ? (v as Record<string, unknown>[]) : []);
  const members = arr(r["members"])
    .map((m) => ({
      role: (IDS.includes(m["role"] as SeatId) ? m["role"] : "") as SeatId,
      vote: (VOTES.includes(m["vote"] as Vote) ? m["vote"] : "conditional") as Vote,
      confidence: clamp(m["confidence"]),
      thesis: str(m["thesis"], "No thesis given."),
      dealbreaker: str(m["dealbreaker"], "—"),
      condition: str(m["condition"], "—"),
      ...(["openai", "anthropic", "google"].includes(m["provider"] as string)
        ? { provider: m["provider"] as Provider }
        : {}),
    }))
    .filter((m, i, a) => seats.includes(m.role) && a.findIndex((x) => x.role === m.role) === i);
  if (members.length === 0) throw new Error("The council returned no usable opinions.");
  const s = (r["scores"] ?? {}) as Record<string, unknown>;
  return {
    verdict: VERDICTS.includes(r["verdict"] as Verdict)
      ? (r["verdict"] as Verdict)
      : "CONDITIONAL APPROVAL",
    consensusScore: clamp(r["consensusScore"]),
    executiveSummary: str(r["executiveSummary"], "No summary provided."),
    scores: {
      financialViability: clamp(s["financialViability"]),
      marketUpside: clamp(s["marketUpside"]),
      executionFeasibility: clamp(s["executionFeasibility"]),
      riskSafety: clamp(s["riskSafety"]),
    },
    members,
    tensions: arr(r["tensions"])
      .map((t) => ({
        sideA: t["sideA"] as SeatId,
        sideB: t["sideB"] as SeatId,
        conflictSummary: str(t["conflictSummary"]),
      }))
      .filter((t) => IDS.includes(t.sideA) && IDS.includes(t.sideB) && t.conflictSummary)
      .slice(0, 3),
    preMortem: str(r["preMortem"], "No pre-mortem provided."),
    guardrails: arr(r["guardrails"])
      .map((g) => ({
        metric: str(g["metric"]),
        threshold: str(g["threshold"]),
        timeframe: str(g["timeframe"]),
      }))
      .filter((g) => g.metric)
      .slice(0, 8),
  };
}

/** Markdown board memo for copying/sharing. */
export function buildBoardMemo(r: Report): string {
  const t = tallyVotes(r.members);
  const top = r.tensions[0];
  return [
    `# Board Memo — ${r.verdict}`,
    ``,
    `**Decision:** ${r.input.decision}`,
    `**Context:** ${r.input.stage} · Budget ${r.input.budget || "n/a"} · ${r.input.risk} risk appetite · ${r.input.horizon}`,
    ``,
    `## Verdict`,
    `- **${r.verdict}** — Consensus ${r.consensusScore}/100`,
    `- Votes: ${t.approve} Approve · ${t.conditional} Conditional · ${t.reject} Reject`,
    `- Scores: Financial ${r.scores.financialViability} · Market ${r.scores.marketUpside} · Execution ${r.scores.executionFeasibility} · Risk safety ${r.scores.riskSafety}`,
    ``,
    r.executiveSummary,
    ``,
    `## Seat Votes`,
    ...r.members.map(
      (m) =>
        `- **${seatShort(m.role)}** (${providerLabel(m.provider)}) — ${m.vote.toUpperCase()} (${m.confidence}%): ${m.thesis}\n  - Dealbreaker: ${m.dealbreaker}\n  - Condition: ${m.condition}`,
    ),
    ``,
    `## Top Tension`,
    top
      ? `**${seatShort(top.sideA)} vs. ${seatShort(top.sideB)}** — ${top.conflictSummary}`
      : "None recorded.",
    ``,
    `## 12-Month Pre-Mortem`,
    r.preMortem,
    ``,
    `## Guardrails & Kill Criteria`,
    ...r.guardrails.map(
      (g, i) =>
        `- [${r.checked.includes(i) ? "x" : " "}] **${g.metric}** — ${g.threshold} (${g.timeframe})`,
    ),
  ].join("\n");
}
