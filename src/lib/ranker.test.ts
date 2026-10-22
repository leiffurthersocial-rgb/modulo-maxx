import { describe, expect, it } from "vitest";
import { BANK } from "./bank";
import { makeRng } from "./engine";
import { exportResults, fit, marginProbs, nextPair, S, type Margin, type RankVote } from "./ranker";

/** Pick with model probability using hidden "true" ratings. */
function simulate(truth: (id: string) => number, n: number, seed = 1, band: "all" | "high" = "all", start: RankVote[] = []): RankVote[] {
  const rng = makeRng(seed);
  const votes: RankVote[] = [...start];
  for (let k = 0; k < n; k++) {
    const pair = nextPair(votes, band, rng)!;
    const probs = marginProbs((truth(pair[0].id) - truth(pair[1].id)) / S);
    let u = rng();
    let k = 0;
    while (k < 4 && (u -= probs[k]) > 0) k++;
    votes.push({ a: pair[0].id, b: pair[1].id, margin: (k - 2) as Margin, rater: "t" });
  }
  return votes;
}

describe("celebrity ranker", () => {
  it("keeps current ratings when nobody has voted", () => {
    const f = fit([]);
    expect(f.every((x) => x.rating === Math.round(x.old * 10) / 10)).toBe(true);
  });

  it("moves a winner up and a loser down", () => {
    const [a, b] = BANK;
    const votes: RankVote[] = Array.from({ length: 4 }, () => ({ a: b.id, b: a.id, margin: 1 as Margin, rater: "x" }));
    const f = new Map(fit(votes).map((x) => [x.celeb.id, x]));
    expect(f.get(b.id)!.rating).toBeGreaterThan(b.rating);
    expect(f.get(a.id)!.rating).toBeLessThan(a.rating);
    expect(f.get(a.id)!.sd).toBeLessThan(fit([]).find((x) => x.celeb.id === a.id)!.sd);
  });

  it("pairs celebs that are close in rating and stays in the band", () => {
    const rng = makeRng(3);
    for (let i = 0; i < 30; i++) {
      const [x, y] = nextPair([], "high", rng)!;
      expect(x.rating).toBeGreaterThanOrEqual(7);
      expect(y.rating).toBeGreaterThanOrEqual(7);
      expect(Math.abs(x.rating - y.rating)).toBeLessThanOrEqual(2.5);
    }
  });

  it("corrects a celeb whose rating is a full point too low", () => {
    const target = BANK.find((c) => c.rating >= 7 && c.rating < 7.5)!;
    const truth = (id: string) => (id === target.id ? target.rating + 1 : BANK.find((c) => c.id === id)!.rating);
    const votes = simulate(truth, 400, 5, "high");
    const f = fit(votes).find((x) => x.celeb.id === target.id)!;
    expect(f.comparisons).toBeGreaterThan(3);
    expect(f.rating).toBeGreaterThan(target.rating + 0.3);
  });

  it("exports votes and changes", () => {
    const votes = simulate((id) => BANK.find((c) => c.id === id)!.rating, 20);
    const out = JSON.parse(exportResults(votes));
    expect(out.kind).toBe("modulo-maxx-celebrity-ranker");
    expect(out.votes).toHaveLength(20);
  });

  it("has answer probabilities that sum to 1 and lean the right way", () => {
    for (const d of [-4, -1, 0, 0.5, 3]) {
      const p = marginProbs(d);
      expect(p.reduce((x, y) => x + y, 0)).toBeCloseTo(1);
      expect(p.every((x) => x >= 0)).toBe(true);
    }
    expect(marginProbs(4)[4]).toBeGreaterThan(0.8);
    expect(marginProbs(0)[2]).toBeGreaterThan(marginProbs(0)[4]);
  });

  it("moves further on 'much better' than on 'better'", () => {
    const [a, b] = BANK;
    const one = (m: Margin) => fit([{ a: b.id, b: a.id, margin: m, rater: "x" }]).find((x) => x.celeb.id === b.id)!.rating;
    expect(one(2)).toBeGreaterThan(one(1));
  });

  it("brings an uncertain celeb straight back after a pick", () => {
    const rng = makeRng(9);
    const [x, y] = nextPair([], "all", rng)!;
    const votes: RankVote[] = [{ a: x.id, b: y.id, margin: 2, rater: "t" }];
    const next = nextPair(votes, "all", rng)!.map((c) => c.id);
    expect(next.includes(x.id) || next.includes(y.id)).toBe(true);
  });

  it("finds a badly misrated celeb (2 points too low)", () => {
    const target = BANK.find((c) => c.rating >= 5.5 && c.rating < 6)!;
    const truth = (id: string) => (id === target.id ? target.rating + 2 : BANK.find((c) => c.id === id)!.rating);
    // He's judged much better than two same-rated celebs; follow-ups do the rest.
    const peers = BANK.filter((c) => c.id !== target.id && Math.abs(c.rating - target.rating) < 0.2).slice(0, 2);
    const start = peers.map((p): RankVote => ({ a: target.id, b: p.id, margin: 2, rater: "t" }));
    const votes = simulate(truth, 12, 11, "all", start);
    const f = fit(votes).find((x) => x.celeb.id === target.id)!;
    expect(f.comparisons).toBeGreaterThanOrEqual(4);
    expect(f.rating).toBeGreaterThan(target.rating + 1);
  });
});
