import { describe, expect, it } from "vitest";
import {
  answerProbs,
  ENGINE,
  isProbe,
  makeRng,
  nextQuestion,
  posterior,
  sampleFace,
  shouldStop,
  summarize,
  type Answer,
  type Celeb,
  type FaceSummary,
  type Vote,
} from "./engine";
import celebData from "@data/celebs.json";
import { slugify } from "./slug";

const BANK: Celeb[] = celebData.celebs.map((c) => ({ ...c, id: slugify(c.name) }));

function simulatedAnswer(theta: number, rating: number, s: number, rng: () => number): Answer {
  const [more, equal] = answerProbs(theta, rating, s);
  const u = rng();
  return u < more ? "more" : u < more + equal ? "equal" : "less";
}

interface Run {
  face: FaceSummary;
  answered: number;
  stoppedAt: number | null;
  votes: Vote[];
}

/** Run one simulated session until the stopping rule fires (or `maxQ`). */
function simulate(theta: number, s: number, seed: number, maxQ: number = ENGINE.maxQuestions): Run {
  const rng = makeRng(seed);
  const votes: Vote[] = [];
  let stoppedAt: number | null = null;
  let face = summarize(posterior([votes]), BANK);
  while (votes.length < maxQ) {
    const q = nextQuestion(BANK, [votes], 0, rng);
    if (!q) break;
    const answer = simulatedAnswer(theta, q.celeb.rating, s, rng);
    votes.push({ celebId: q.celeb.id, rating: q.celeb.rating, category: q.celeb.category, answer });
    face = summarize(posterior([votes]), BANK);
    if (stoppedAt === null && shouldStop(votes.length, face)) {
      stoppedAt = votes.length;
      break;
    }
  }
  return { face, answered: votes.length, stoppedAt, votes };
}

describe("answerProbs", () => {
  it("sums to one and favours the right answer", () => {
    for (const [theta, r] of [
      [8, 5],
      [3, 6],
      [5, 5],
    ]) {
      const p = answerProbs(theta, r, 0.5);
      expect(p[0] + p[1] + p[2]).toBeCloseTo(1, 10);
    }
    expect(answerProbs(8, 5, 0.5)[0]).toBeGreaterThan(0.9);
    expect(answerProbs(3, 6, 0.5)[2]).toBeGreaterThan(0.9);
  });

  it("'about equal' peaks when theta equals the celeb rating", () => {
    const eq = (t: number) => answerProbs(t, 6, 0.5)[1];
    expect(eq(6)).toBeGreaterThan(eq(5.5));
    expect(eq(6)).toBeGreaterThan(eq(6.5));
  });
});

describe("posterior", () => {
  it("starts at the prior", () => {
    const f = summarize(posterior([[]]), BANK);
    expect(f.mean).toBeCloseTo(ENGINE.priorMean, 1);
    expect(f.sd).toBeCloseTo(ENGINE.priorSd, 1);
  });

  it("supports several raters, each tightening the estimate", () => {
    const votes: Vote[] = [
      { celebId: "a", rating: 6, category: "actor", answer: "more" },
      { celebId: "b", rating: 7, category: "actor", answer: "less" },
    ];
    const one = summarize(posterior([votes]), BANK);
    const two = summarize(posterior([votes, votes]), BANK);
    expect(two.sd).toBeLessThan(one.sd);
    expect(posterior([votes, votes]).noise).toHaveLength(2);
  });
});

describe("question selection", () => {
  it("never repeats a celeb and varies categories", () => {
    const run = simulate(6.2, 0.5, 7, 30);
    const ids = run.votes.map((v) => v.celebId);
    expect(new Set(ids).size).toBe(ids.length);
    const cats = new Set(run.votes.map((v) => v.category));
    expect(cats.size).toBeGreaterThan(1);
  });

  it("probes every 4th question, 1.5-2 SDs from the estimate", () => {
    expect([1, 2, 3, 4, 5, 8, 12].map(isProbe)).toEqual([false, false, false, true, false, true, true]);
    const rng = makeRng(3);
    const votes: Vote[] = [];
    for (let i = 0; i < 3; i++) {
      const q = nextQuestion(BANK, [votes], 0, rng)!;
      votes.push({ celebId: q.celeb.id, rating: q.celeb.rating, category: q.celeb.category, answer: simulatedAnswer(6, q.celeb.rating, 0.5, rng) });
    }
    const post = posterior([votes]);
    const f = summarize(post, BANK);
    const q = nextQuestion(BANK, [votes], 0, rng, post)!;
    expect(q.probe).toBe(true);
    const dist = Math.abs(q.celeb.rating - f.mean) / f.sd;
    expect(dist).toBeGreaterThan(1.2);
    expect(dist).toBeLessThan(2.4);
  });
});

describe("convergence", () => {
  it("lands within ±0.5 of the true face score in ≤25 questions", () => {
    const thetas = [3.6, 4.2, 4.8, 5.3, 5.8, 6.3, 6.8, 7.3, 7.8, 8.3];
    let hits = 0;
    let total = 0;
    let worstQuestions = 0;
    for (const theta of thetas) {
      for (let seed = 1; seed <= 4; seed++) {
        const run = simulate(theta, 0.5, seed * 101 + Math.round(theta * 10), 25);
        total++;
        if (Math.abs(run.face.mean - theta) <= 0.5) hits++;
        worstQuestions = Math.max(worstQuestions, run.answered);
      }
    }
    expect(worstQuestions).toBeLessThanOrEqual(25);
    expect(hits / total).toBeGreaterThanOrEqual(0.9);
  });

  it("consistent raters usually stop early on the SD rule", () => {
    let stopped = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const run = simulate(6, 0.3, seed);
      if (run.stoppedAt !== null && run.stoppedAt <= 25 && run.face.sd < ENGINE.targetSd) stopped++;
    }
    expect(stopped).toBeGreaterThanOrEqual(8);
  });

  it("noisy raters get wider intervals and a higher noise estimate", () => {
    let cleanSd = 0;
    let noisySd = 0;
    let cleanNoise = 0;
    let noisyNoise = 0;
    const n = 12;
    for (let seed = 1; seed <= n; seed++) {
      const clean = simulate(6, 0.3, seed, 20);
      const noisy = simulate(6, 1.5, seed, 20);
      cleanSd += clean.face.sd / n;
      noisySd += noisy.face.sd / n;
      cleanNoise += clean.face.noise / n;
      noisyNoise += noisy.face.noise / n;
    }
    expect(noisySd).toBeGreaterThan(cleanSd * 1.3);
    expect(noisyNoise).toBeGreaterThan(cleanNoise);
  });

  it("a contradicting answer raises the noise estimate", () => {
    const base: Vote[] = [
      { celebId: "a", rating: 5, category: "actor", answer: "more" },
      { celebId: "b", rating: 7, category: "actor", answer: "less" },
      { celebId: "c", rating: 5.5, category: "actor", answer: "more" },
      { celebId: "d", rating: 6.5, category: "actor", answer: "less" },
    ];
    const contradiction: Vote = { celebId: "e", rating: 8.5, category: "athlete", answer: "more" };
    const before = summarize(posterior([base]), BANK);
    const after = summarize(posterior([[...base, contradiction]]), BANK);
    expect(after.noise).toBeGreaterThan(before.noise);
  });
});

describe("out of bank", () => {
  it("flags faces above the bank and widens the interval", () => {
    const run = simulate(9.95, 0.3, 11, 20);
    expect(run.face.outOfBank).toBe("above");
    const top = Math.max(...BANK.map((c) => c.rating));
    expect(run.face.lo).toBe(top);
    expect(run.face.hi).toBeCloseTo(Math.min(ENGINE.thetaMax, top + ENGINE.outOfBankWidth));
  });

  it("flags faces below the bank", () => {
    const run = simulate(1.2, 0.3, 12, 20);
    expect(run.face.outOfBank).toBe("below");
    expect(shouldStop(ENGINE.minQuestions, run.face)).toBe(true);
  });

  it("samples the widened interval uniformly", () => {
    const run = simulate(9.95, 0.3, 11, 20);
    const xs = sampleFace(posterior([run.votes]), run.face, 500, makeRng(1));
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(run.face.lo);
    expect(Math.max(...xs)).toBeLessThanOrEqual(run.face.hi);
  });
});
