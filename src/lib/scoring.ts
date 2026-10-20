import { BUILDS, getBuild } from "./builds";
import { makeRng, type Rng } from "./engine";

// Every attribute is on a 0-10 scale where the average guy is 5.5
// (the general-male-population bell curve: mean 5.5, SD 1.5).

export const SCORING = {
  average: 5.5,
  weights: { face: 0.6, height: 0.2, body: 0.2 },
  // overall = weightedMean - factor * Σ w_i * max(0, threshold - a_i)^2
  flaw: { threshold: 5, factor: 0.35 },
  height: {
    meanCm: 176,
    sdCm: 7,
    pointsPerSd: 1.5,
    zMin: -3,
    zMax: 2.5,
    // Height beyond this adds nothing (with zMax = 2.5 the curve is already flat from 193.5 cm).
    flatAboveCm: 195,
  },
  body: {
    // BMI baseline: flat optimum, then a curved decline on both sides.
    optimumLow: 21,
    optimumHigh: 25,
    peak: 6.3,
    aboveLinear: 0.38,
    aboveQuad: 0.008,
    belowLinear: 0.5,
    belowQuad: 0.08,
    // Muscle explains weight: each muscularity level credits this many BMI points above `muscleFrom`.
    muscleFrom: 23,
    musclePerLevel: 2.5,
    // Tone from the body type: m >= 0 -> toneLinear*m - toneQuad*m^2 (peaks at athletic, m ~ 1,
    // and turns negative past m ~ 2.1, so a bodybuilder scores below average); m < 0 -> toneBelow*m.
    toneLinear: 1.5,
    toneQuad: 0.7,
    toneBelow: 0.6,
    // Soft / heavy types: penalty per fat level, on top of what BMI already says.
    fatPenalty: 0.6,
    // Baseline when BMI is unknown (no height or weight given).
    unknownBmiBaseline: 5.5,
  },
  // Reference population for the percentile ("top X% of guys").
  population: {
    bmiMean: 26.5,
    bmiSd: 4.2,
    // Share of guys with each body type, in BUILDS order.
    buildShares: [0.06, 0.12, 0.08, 0.27, 0.09, 0.05, 0.01, 0.17, 0.08, 0.07],
    samples: 20000,
    seed: 20240601,
  },
  monteCarloSamples: 2000,
} as const;

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const clamp10 = (x: number) => clamp(x, 0, 10);

export function heightScore(cm: number): number {
  const h = SCORING.height;
  const z = (Math.min(cm, h.flatAboveCm) - h.meanCm) / h.sdCm;
  return clamp10(SCORING.average + h.pointsPerSd * clamp(z, h.zMin, h.zMax));
}

export function bmi(heightCm: number, weightKg: number): number {
  const m = heightCm / 100;
  return weightKg / (m * m);
}

function bmiBaseline(b: number): number {
  const c = SCORING.body;
  if (b > c.optimumHigh) {
    const d = b - c.optimumHigh;
    return c.peak - c.aboveLinear * d - c.aboveQuad * d * d;
  }
  if (b < c.optimumLow) {
    const d = c.optimumLow - b;
    return c.peak - c.belowLinear * d - c.belowQuad * d * d;
  }
  return c.peak;
}

/**
 * Body score from BMI and the body type.
 *
 *   m, f      = body type muscle (-1 .. 2.5, average = 0) and fat (0 .. 2) levels
 *   credit    = m > 0 ? min(max(0, BMI - 23), 2.5 * m) : 0
 *   effective = BMI - credit                       (muscle explains some of the weight)
 *   baseline  = 6.3 for effective BMI 21-25, falling off as
 *               6.3 - 0.38 d - 0.008 d^2   above 25 (d = BMI - 25)
 *               6.3 - 0.50 d - 0.08  d^2   below 21 (d = 21 - BMI)
 *   tone      = m >= 0 ? 1.5 m - 0.7 m^2 : 0.6 m  (best at athletic, m = 1; too much muscle hurts)
 *   body      = clamp(baseline + tone - 0.6 f, 0, 10)
 *
 * At BMI 23: Athletic ~7.1, Lean ~6.9, Muscular ~7.0, Average 6.3, Bodybuilder ~5.7, Soft ~5.7.
 * Average guy (BMI ~27, Average) ~5.5. Without a BMI the baseline is 5.5.
 */
export function bodyScore(buildId: string, heightCm?: number, weightKg?: number): number {
  const c = SCORING.body;
  const { muscle: m, fat } = getBuild(buildId);
  const tone = (m >= 0 ? c.toneLinear * m - c.toneQuad * m * m : c.toneBelow * m) - c.fatPenalty * fat;
  if (!heightCm || !weightKg) return clamp10(c.unknownBmiBaseline + tone);
  const b = bmi(heightCm, weightKg);
  const credit = m > 0 ? Math.min(Math.max(0, b - c.muscleFrom), c.musclePerLevel * m) : 0;
  return clamp10(bmiBaseline(b - credit) + tone);
}

export interface Attributes {
  face?: number;
  height?: number;
  body?: number;
}

export type AttributeKey = keyof Attributes;

export const ATTRIBUTE_KEYS: AttributeKey[] = ["face", "height", "body"];

/** Weights renormalised over the attributes that are present. */
export function effectiveWeights(a: Attributes): Partial<Record<AttributeKey, number>> {
  const present = ATTRIBUTE_KEYS.filter((k) => a[k] !== undefined);
  const total = present.reduce((s, k) => s + SCORING.weights[k], 0);
  return Object.fromEntries(present.map((k) => [k, SCORING.weights[k] / total]));
}

/** overall = weightedMean - flawPenalty, clamped to 0-10. */
export function overallScore(a: Attributes): number {
  const w = effectiveWeights(a);
  let mean = 0;
  let penalty = 0;
  for (const k of ATTRIBUTE_KEYS) {
    const wk = w[k];
    const x = a[k];
    if (wk === undefined || x === undefined) continue;
    mean += wk * x;
    penalty += wk * Math.max(0, SCORING.flaw.threshold - x) ** 2;
  }
  return clamp10(mean - SCORING.flaw.factor * penalty);
}

export interface Range {
  mean: number;
  sd: number;
}

/** Monte Carlo over face samples (height and body are fixed inputs). */
export function overallRange(faceSamples: number[], rest: Omit<Attributes, "face">): Range {
  const xs = faceSamples.map((face) => overallScore({ ...rest, face }));
  const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((s, x) => s + (x - mean) ** 2, 0) / xs.length);
  return { mean, sd };
}

function normal(rng: Rng): number {
  const u = 1 - rng();
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

let populationCache: Float64Array | null = null;

/** Sorted overall scores of a simulated reference population (deterministic). */
function population(): Float64Array {
  if (populationCache) return populationCache;
  const p = SCORING.population;
  const rng = makeRng(p.seed);
  const xs = new Float64Array(p.samples);
  for (let i = 0; i < p.samples; i++) {
    const face = clamp10(SCORING.average + 1.5 * normal(rng));
    const h = SCORING.height.meanCm + SCORING.height.sdCm * normal(rng);
    const b = clamp(p.bmiMean + p.bmiSd * normal(rng), 16, 45);
    let u = rng();
    let bi = 0;
    while (bi < p.buildShares.length - 1 && (u -= p.buildShares[bi]) > 0) bi++;
    const w = b * (h / 100) ** 2;
    xs[i] = overallScore({ face, height: heightScore(h), body: bodyScore(BUILDS[bi].id, h, w) });
  }
  xs.sort();
  populationCache = xs;
  return xs;
}

/** Fraction of the reference population scoring below `overall` (0..1). */
export function percentile(overall: number): number {
  const xs = population();
  let lo = 0;
  let hi = xs.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (xs[mid] < overall) lo = mid + 1;
    else hi = mid;
  }
  return lo / xs.length;
}

/** "Top X%" label value, rounded sensibly. */
export function topPercent(overall: number): number {
  const top = 100 * (1 - percentile(overall));
  if (top < 1) return Math.max(0.1, Math.round(top * 10) / 10);
  return Math.min(99, Math.round(top));
}
