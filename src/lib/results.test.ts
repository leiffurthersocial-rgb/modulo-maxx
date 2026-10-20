import { describe, expect, it } from "vitest";
import { BANK } from "./bank";
import { answerProbs, makeRng, type Answer, type Vote } from "./engine";
import { computeResults, verdict } from "./results";
import { initialState, newRater, type AppState } from "./state";

function votesFor(theta: number, s: number, seed: number, n = 14): Vote[] {
  const rng = makeRng(seed);
  // Celebs spread evenly across the rating range near the truth, so the test doesn't depend on the bank's exact contents.
  const sorted = [...BANK].sort((a, b) => a.rating - b.rating);
  const near = sorted.filter((c) => Math.abs(c.rating - theta) <= 2);
  const pool = Array.from({ length: n }, (_, i) => near[Math.floor(((i + (seed % 2) * 0.5) * near.length) / n)]);
  return pool.map((c) => {
    const [more, equal] = answerProbs(theta, c.rating, s);
    const u = rng();
    const answer: Answer = u < more ? "more" : u < more + equal ? "equal" : "less";
    return { celebId: c.id, rating: c.rating, category: c.category, answer };
  });
}

function stateWith(...voteSets: Vote[][]): AppState {
  const s = initialState();
  return { ...s, raters: voteSets.map((votes, i) => ({ ...newRater(`rater-${i + 1}`), votes })), activeRater: voteSets.length - 1 };
}

describe("multiple raters", () => {
  it("pools everyone's answers and lists each person", () => {
    const res = computeResults(stateWith(votesFor(6.5, 0.4, 1), votesFor(6.5, 0.4, 2)));
    expect(res.raters.map((r) => r.label)).toEqual(["Person 1", "Person 2"]);
    expect(res.answered).toBe(28);
    expect(Math.abs(res.face.mean - 6.5)).toBeLessThan(0.6);
  });

  it("narrows the estimate compared with one rater", () => {
    const one = computeResults(stateWith(votesFor(6.5, 0.4, 1)));
    const two = computeResults(stateWith(votesFor(6.5, 0.4, 1), votesFor(6.5, 0.4, 2)));
    expect(two.face.sd).toBeLessThan(one.face.sd);
    expect(one.raters).toEqual([]);
  });

  it("reports the face percentile", () => {
    const res = computeResults(stateWith(votesFor(7, 0.3, 3)));
    expect(res.faceTop).toBeGreaterThan(5);
    expect(res.faceTop).toBeLessThan(40);
  });
});

describe("verdict", () => {
  it("agrees with the percentile", () => {
    expect(verdict(15)).toMatch(/^Above average/);
    expect(verdict(50)).toMatch(/^Around average/);
    expect(verdict(1)).toMatch(/^Exceptional/);
    expect(verdict(95)).toMatch(/^Below average/);
  });
});
