import { describe, expect, it } from "vitest";
import { ARCHETYPES, archetypesOf, nextVibeCeleb, scoreVibe, VIBE_POOL, VIBE_QUESTIONS, type VibeVote } from "./archetypes";
import { BANK } from "./bank";
import { makeRng } from "./engine";

/** Answer as a guy whose true vibe is `target`. */
function run(target: string, seed = 1): VibeVote[] {
  const rng = makeRng(seed);
  const votes: VibeVote[] = [];
  for (let c = nextVibeCeleb(votes, rng); c; c = nextVibeCeleb(votes, rng)) {
    const pos = archetypesOf(c).indexOf(target);
    votes.push({ celebId: c.id, answer: pos === 0 ? "very" : pos > 0 ? "bit" : "not" });
  }
  return votes;
}

describe("vibe check", () => {
  it("tags every celeb in the bank", () => {
    expect(BANK.filter((c) => archetypesOf(c).length === 0).map((c) => c.name)).toEqual([]);
    expect(VIBE_POOL.length).toBeGreaterThan(200);
  });

  it("asks a fixed number of questions without repeats", () => {
    const votes = run("rugged");
    expect(votes).toHaveLength(VIBE_QUESTIONS);
    expect(new Set(votes.map((v) => v.celebId)).size).toBe(VIBE_QUESTIONS);
  });

  it("finds the archetype a consistent answerer has", () => {
    for (const a of ["pretty-boy", "rugged", "funny-guy", "athlete", "artsy"]) {
      expect(scoreVibe(run(a))[0].archetype.id).toBe(a);
    }
  });

  it("returns a score for every archetype", () => {
    expect(scoreVibe([])).toHaveLength(ARCHETYPES.length);
  });
});
