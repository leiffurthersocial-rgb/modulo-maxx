import { describe, expect, it } from "vitest";
import { BUILDS } from "./builds";
import { bodyScore, effectiveWeights, faceTopPercent, heightScore, overallRange, overallScore, percentile, SCORING, topPercent } from "./scoring";

describe("heightScore", () => {
  it("is 5.5 at the mean and 1.5 points per SD", () => {
    expect(heightScore(176)).toBeCloseTo(5.5);
    expect(heightScore(183)).toBeCloseTo(7);
    expect(heightScore(169)).toBeCloseTo(4);
  });
  it("clamps z to [-3, 2.5] and is flat at the top", () => {
    expect(heightScore(140)).toBeCloseTo(1);
    expect(heightScore(195)).toBeCloseTo(9.25);
    expect(heightScore(210)).toBeCloseTo(heightScore(195));
  });
});

describe("bodyScore", () => {
  it("puts the average guy near 5.5", () => {
    expect(bodyScore("average", 176, 27 * 1.76 ** 2)).toBeCloseTo(5.5, 0);
  });
  it("peaks for BMI 21-25", () => {
    const at = (b: number) => bodyScore("average", 180, b * 1.8 ** 2);
    expect(at(22)).toBeCloseTo(at(24.5));
    expect(at(22)).toBeGreaterThan(at(28));
    expect(at(22)).toBeGreaterThan(at(18.5));
  });
  it("treats high BMI differently depending on the build", () => {
    const w = 29 * 1.8 ** 2;
    expect(bodyScore("muscular", 180, w)).toBeGreaterThan(bodyScore("average", 180, w) + 2);
  });
  it("orders builds sensibly at a healthy BMI", () => {
    const at = (id: string) => bodyScore(id, 180, 23 * 1.8 ** 2);
    expect(at("skinny")).toBeLessThan(at("average"));
    expect(at("athletic")).toBeGreaterThan(at("average"));
    expect(at("soft")).toBeLessThan(at("average"));
    expect(at("heavy")).toBeLessThan(at("soft"));
  });
  it("makes too much muscle a minus", () => {
    const at = (id: string) => bodyScore(id, 180, 25 * 1.8 ** 2);
    expect(at("athletic")).toBeGreaterThan(at("muscular"));
    expect(at("muscular")).toBeGreaterThan(at("very-muscular"));
    expect(bodyScore("very-muscular")).toBeLessThan(bodyScore("average"));
  });
  it("has a population share for every body type", () => {
    expect(SCORING.population.buildShares).toHaveLength(BUILDS.length);
    expect(SCORING.population.buildShares.reduce((a, b) => a + b, 0)).toBeCloseTo(1);
  });
  it("falls back to the slider alone without height or weight", () => {
    expect(bodyScore("average")).toBeCloseTo(5.5);
  });
});

describe("overallScore", () => {
  it("returns the average for an average guy", () => {
    expect(overallScore({ face: 5.5, height: 5.5, body: 5.5 })).toBeCloseTo(5.5);
  });
  it("is the weighted mean when nothing is under 5", () => {
    expect(overallScore({ face: 8, height: 6, body: 7 })).toBeCloseTo(0.6 * 8 + 0.2 * 6 + 0.2 * 7);
  });
  it("penalises weak spots more than strengths help", () => {
    const up = overallScore({ face: 5.5, height: 7.5, body: 5.5 }) - 5.5;
    const down = 5.5 - overallScore({ face: 5.5, height: 2.5, body: 5.5 });
    expect(down).toBeGreaterThan(up);
    const penalty = SCORING.flaw.factor * 0.2 * 2.5 ** 2;
    expect(down).toBeCloseTo(0.2 * 3 + penalty);
  });
  it("renormalises weights when something is missing", () => {
    const w = effectiveWeights({ face: 6, body: 6 });
    expect(w.face).toBeCloseTo(0.75);
    expect(w.body).toBeCloseTo(0.25);
    expect(overallScore({ face: 6, body: 6 })).toBeCloseTo(6);
  });
  it("clamps to 0-10", () => {
    expect(overallScore({ face: 0, height: 0, body: 0 })).toBe(0);
    expect(overallScore({ face: 10, height: 10, body: 10 })).toBe(10);
  });
});

describe("overallRange and percentile", () => {
  it("has zero spread for a fixed face", () => {
    const r = overallRange([6, 6, 6], { height: 6, body: 6 });
    expect(r.mean).toBeCloseTo(6);
    expect(r.sd).toBeCloseTo(0);
  });
  it("is monotonic and sensible", () => {
    expect(percentile(3)).toBeLessThan(percentile(5.5));
    expect(percentile(5.5)).toBeLessThan(percentile(8));
    expect(topPercent(9.5)).toBeLessThan(2);
    expect(topPercent(5.3)).toBeGreaterThan(30);
    expect(topPercent(5.3)).toBeLessThan(70);
  });
});

describe("faceTopPercent", () => {
  it("follows the population bell curve", () => {
    expect(faceTopPercent(5.5)).toBe(50);
    expect(faceTopPercent(7)).toBe(16);
    expect(faceTopPercent(8.5)).toBe(2);
    expect(faceTopPercent(4)).toBe(84);
  });
});
