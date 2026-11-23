import { describe, expect, it } from "vitest";
import { normalizeBoardResult, tallyVotes } from "./council";
describe("council", () => {
  it("tallies votes", () =>
    expect(tallyVotes([{ vote: "approve" }, { vote: "reject" }, { vote: "approve" }])).toEqual({
      approve: 2,
      conditional: 0,
      reject: 1,
    }));
  it("drops members for roles that weren't seated and clamps scores", () => {
    const r = normalizeBoardResult(
      {
        verdict: "APPROVED",
        consensusScore: 140,
        members: [
          { role: "cfo", vote: "approve", confidence: 80 },
          { role: "cmo", vote: "reject", confidence: 50 },
        ],
      },
      ["cfo"],
    );
    expect(r.members.map((m) => m.role)).toEqual(["cfo"]);
    expect(r.consensusScore).toBe(100);
  });
  it("throws when no usable members", () =>
    expect(() => normalizeBoardResult({}, ["cfo"])).toThrow());
});
import { buildBoardMemo, type Report } from "./council";
describe("board memo", () => {
  it("includes verdict, score, top tension and checked guardrails", () => {
    const r = {
      verdict: "REJECTED",
      consensusScore: 31,
      executiveSummary: "S",
      scores: { financialViability: 1, marketUpside: 2, executionFeasibility: 3, riskSafety: 4 },
      members: [
        {
          role: "cfo",
          vote: "reject",
          confidence: 90,
          thesis: "T",
          dealbreaker: "D",
          condition: "C",
        },
      ],
      tensions: [{ sideA: "cfo", sideB: "cro", conflictSummary: "Cash vs risk" }],
      preMortem: "PM",
      guardrails: [{ metric: "Churn", threshold: "<2%", timeframe: "90 days" }],
      id: "x",
      createdAt: 0,
      checked: [0],
      input: {
        decision: "D",
        stage: "SMB",
        budget: "",
        risk: "Low",
        horizon: "1 year",
        seats: ["cfo"],
      },
    } as Report;
    const m = buildBoardMemo(r);
    expect(m).toContain("**REJECTED** — Consensus 31/100");
    expect(m).toContain("**CFO vs. CRO** — Cash vs risk");
    expect(m).toContain("- [x] **Churn** — <2% (90 days)");
  });
});
import { voteShifts } from "./council";
describe("vote shifts", () => {
  it("lists only seats whose vote changed", () => {
    const m = (role: string, vote: string) =>
      ({ role, vote, confidence: 50, thesis: "", dealbreaker: "", condition: "" }) as never;
    expect(
      voteShifts(
        { members: [m("cfo", "reject"), m("cmo", "approve")] },
        { members: [m("cfo", "conditional"), m("cmo", "approve")] },
      ),
    ).toEqual([{ role: "cfo", from: "reject", to: "conditional" }]);
  });
});
