import { describe, expect, it } from "vitest";
import { makeRng } from "./engine";
import { fitRanking, ownFace, pairsForRater, questionsPerRater, voterName, winChance, type MogVote, type Player } from "./mog";

const players: Player[] = ["A", "B", "C", "D", "E"].map((n) => ({ id: n, name: n, photo: "" }));

/** Simulate raters who pick the truly better face with Elo-model probability. */
function simulate(truth: Record<string, number>, raters: number, seed = 1): MogVote[] {
  const rng = makeRng(seed);
  const votes: MogVote[] = [];
  for (let r = 0; r < raters; r++) {
    for (const [a, b] of pairsForRater(players, votes, rng)) {
      const p = winChance(truth[a], truth[b]);
      votes.push({ a, b, winner: rng() < p ? "a" : "b", rater: r });
    }
  }
  return votes;
}

describe("mog battle", () => {
  it("asks every pair in small groups and caps big ones", () => {
    expect(questionsPerRater(5)).toBe(10);
    expect(questionsPerRater(20)).toBe(30);
    const pairs = pairsForRater(players, [], makeRng(1));
    expect(pairs).toHaveLength(10);
    expect(new Set(pairs.map((p) => [...p].sort().join())).size).toBe(10);
  });

  it("averages 1500 and ranks a clear winner first", () => {
    const votes: MogVote[] = [
      { a: "A", b: "B", winner: "a", rater: 0 },
      { a: "A", b: "C", winner: "a", rater: 0 },
      { a: "B", b: "C", winner: "tie", rater: 0 },
    ];
    const s = fitRanking(players.slice(0, 3), votes);
    expect(s[0].player.id).toBe("A");
    expect(s.reduce((x, y) => x + y.elo, 0) / 3).toBeCloseTo(1500, -1);
    expect(Number.isFinite(s[0].elo)).toBe(true);
  });

  it("recovers the true order from a few voters", () => {
    const truth = { A: 1800, B: 1650, C: 1500, D: 1350, E: 1200 };
    const s = fitRanking(players, simulate(truth, 6));
    expect(s.map((x) => x.player.id)).toEqual(["A", "B", "C", "D", "E"]);
    expect(s[0].err).toBeGreaterThan(0);
  });

  it("is order-independent", () => {
    const votes = simulate({ A: 1700, B: 1600, C: 1500, D: 1400, E: 1300 }, 3);
    const a = fitRanking(players, votes).map((x) => x.elo);
    const b = fitRanking(players, [...votes].reverse()).map((x) => x.elo);
    expect(a).toEqual(b);
  });

  it("names voters in player order, then guests", () => {
    expect(voterName(players, 0)).toBe("A");
    expect(voterName(players, 4)).toBe("E");
    expect(voterName(players, 5)).toBe("Guest 1");
  });

  it("leaves a voter's own face out when the toggle is on", () => {
    const own = ownFace({ players, hideOwn: true }, 1);
    expect(own).toBe("B");
    const pairs = pairsForRater(players, [], makeRng(2), own);
    expect(pairs).toHaveLength(6);
    expect(pairs.flat()).not.toContain("B");
    expect(ownFace({ players, hideOwn: false }, 1)).toBeUndefined();
    expect(ownFace({ players, hideOwn: true }, 7)).toBeUndefined();
  });
});
