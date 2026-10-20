import { describe, expect, it } from "vitest";
import { ARCHETYPES, archetypesOf, MIN_RATING, nextVibeCeleb, scoreVibe, VIBE_POOL, VIBE_QUESTIONS, type VibeVote } from "./archetypes";
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
  it("tags every attractive celeb and keeps the rest out", () => {
    const eligible = BANK.filter((c) => c.image && c.rating >= MIN_RATING);
    expect(eligible.filter((c) => archetypesOf(c).length === 0).map((c) => c.name)).toEqual([]);
    expect(VIBE_POOL.every((c) => c.rating >= MIN_RATING)).toBe(true);
    expect(VIBE_POOL.length).toBeGreaterThan(80);
  });

  it("has several celebs for every archetype", () => {
    for (const a of ARCHETYPES) expect(VIBE_POOL.filter((c) => archetypesOf(c).includes(a.id)).length).toBeGreaterThanOrEqual(5);
  });

  it("asks a fixed number of questions without repeats", () => {
    const votes = run("rugged");
    expect(votes).toHaveLength(VIBE_QUESTIONS);
    expect(new Set(votes.map((v) => v.celebId)).size).toBe(VIBE_QUESTIONS);
  });

  it("finds the archetype a consistent answerer has", () => {
    for (const a of ["vampire", "werewolf", "surfer", "hero", "nerd", "jock", "bully"]) {
      expect(scoreVibe(run(a))[0].archetype.id).toBe(a);
    }
  });

  it("returns a score for every archetype", () => {
    expect(scoreVibe([])).toHaveLength(ARCHETYPES.length);
  });
});
