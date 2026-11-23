import { useState } from "react";
import { ArrowRight, Loader2, RotateCcw, TrendingDown, TrendingUp, Zap } from "lucide-react";
import { CHALLENGES, seatShort, voteShifts, type BoardResult, type Revision } from "@/lib/council";
import { cn } from "@/lib/utils";

export function ChallengePanel({
  busy,
  onSubmit,
}: {
  busy: boolean;
  onSubmit: (text: string) => void;
}) {
  const [text, setText] = useState("");
  const go = () => {
    if (text.trim().length >= 3 && !busy) onSubmit(text.trim());
  };
  return (
    <section className="no-print glass p-6">
      <h3 className="flex items-center gap-2 font-serif text-xl">
        <Zap className="h-5 w-5 text-primary" /> Challenge the Board
      </h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Add a counter-argument or constraint and the council will re-vote.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {CHALLENGES.map((c) => (
          <button
            key={c}
            disabled={busy}
            onClick={() => setText(c)}
            className="rounded-full border border-border bg-secondary px-3 py-1 text-xs hover:border-primary hover:text-primary disabled:opacity-40"
          >
            {c}
          </button>
        ))}
      </div>
      <form
        className="mt-3 flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          go();
        }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={busy}
          maxLength={1000}
          placeholder="Challenge the board with a counter-argument or constraint..."
          className="flex-1 rounded-md border border-input bg-background/60 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          type="submit"
          disabled={busy || text.trim().length < 3}
          className="flex items-center justify-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:brightness-110 disabled:opacity-40"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}{" "}
          {busy ? "Board re-voting…" : "Re-Vote"}
        </button>
      </form>
    </section>
  );
}

export function ShiftBanner({
  original,
  revision,
  view,
  onView,
}: {
  original: BoardResult;
  revision: Revision;
  view: "original" | "revised";
  onView: (v: "original" | "revised") => void;
}) {
  const d = revision.consensusScore - original.consensusScore;
  const shifts = voteShifts(original, revision);
  return (
    <section className="glass border-l-4 border-primary/60 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-widest text-primary">
            Board Shift · Round 2
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Challenge: <span className="text-foreground">"{revision.challenge}"</span>
          </p>
        </div>
        <div className="no-print flex rounded-md border border-border p-0.5 text-xs">
          {(["original", "revised"] as const).map((v) => (
            <button
              key={v}
              onClick={() => onView(v)}
              className={cn(
                "rounded px-3 py-1",
                view === v
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {v === "original" ? "View Original" : "View Revised"}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-4">
        <p
          className={cn(
            "flex items-center gap-2 font-mono text-2xl",
            d > 0 ? "text-approve" : d < 0 ? "text-reject" : "text-muted-foreground",
          )}
        >
          {d >= 0 ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
          {original.consensusScore} <ArrowRight className="h-4 w-4" /> {revision.consensusScore}{" "}
          <span className="text-base">
            ({d > 0 ? "+" : ""}
            {d})
          </span>
        </p>
        {original.verdict !== revision.verdict && (
          <span className="font-mono text-xs text-muted-foreground">
            {original.verdict} → <span className="text-foreground">{revision.verdict}</span>
          </span>
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {shifts.length === 0 ? (
          <span className="text-xs text-muted-foreground">No seat changed its vote.</span>
        ) : (
          shifts.map((s) => (
            <span
              key={s.role}
              className="rounded-full border border-border bg-secondary px-3 py-1 font-mono text-xs"
            >
              {seatShort(s.role)}: <span className="capitalize">{s.from}</span> →{" "}
              <span
                className={cn(
                  "capitalize",
                  s.to === "approve"
                    ? "text-approve"
                    : s.to === "reject"
                      ? "text-reject"
                      : "text-conditional",
                )}
              >
                {s.to}
              </span>
            </span>
          ))
        )}
      </div>
      {revision.shiftSummary && (
        <p className="mt-3 text-sm leading-relaxed text-foreground/90">{revision.shiftSummary}</p>
      )}
    </section>
  );
}
