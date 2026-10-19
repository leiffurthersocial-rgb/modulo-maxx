// Face-score engine: a Bayesian grid posterior over the subject's face rating (theta)
// and each rater's noise (s). All functions are pure; randomness comes in through `rng`.
//
// Model, per vote on a celeb with bank rating r:
//   P(more  | theta, s) = sigmoid((theta - r - d) / s)
//   P(less  | theta, s) = sigmoid((r - theta - d) / s)
//   P(equal | theta, s) = 1 - P(more) - P(less)        (peaks at theta = r)
// with d = equalBand. A small lapse rate mixes in a uniform answer so one mis-tap can't
// wreck the posterior. Each rater has their own s; s is marginalised per rater, so
// adding raters multiplies their theta-likelihoods together (linear cost per rater).

export type Answer = "more" | "equal" | "less";

export interface Celeb {
  id: string;
  name: string;
  rating: number;
  category: string;
}

export interface Vote {
  celebId: string;
  rating: number;
  category: string;
  answer: Answer;
}

export type Rng = () => number;

export const ENGINE = {
  thetaMin: 0,
  thetaMax: 10,
  thetaStep: 0.05,
  priorMean: 5.5,
  priorSd: 1.5,
  noiseGrid: [0.3, 0.5, 0.8, 1.2],
  noisePrior: [0.25, 0.35, 0.25, 0.15],
  equalBand: 0.45,
  lapse: 0.03,
  minQuestions: 12,
  maxQuestions: 30,
  targetSd: 0.3,
  probeEvery: 4,
  probeMinSds: 1.5,
  probeMaxSds: 2,
  // How much of the posterior has to sit beyond the bank's extremes to call it "out of bank".
  outOfBankMass: 0.5,
  // Width of the interval reported when the face is beyond the bank.
  outOfBankWidth: 1.5,
  // Category variety: EIG multipliers when a candidate repeats the last / second-to-last category.
  repeatCategoryPenalty: [0.85, 0.93],
  // Pick randomly among candidates within this fraction of the best score.
  choiceTolerance: 0.97,
  // Extra questions granted by "keep going".
  extendBy: 8,
} as const;

const N_THETA = Math.round((ENGINE.thetaMax - ENGINE.thetaMin) / ENGINE.thetaStep) + 1;

export const THETA: readonly number[] = Array.from(
  { length: N_THETA },
  (_, i) => +(ENGINE.thetaMin + i * ENGINE.thetaStep).toFixed(4),
);

const LOG_PRIOR_THETA = THETA.map((t) => -0.5 * ((t - ENGINE.priorMean) / ENGINE.priorSd) ** 2);

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

/** [more, equal, less] probabilities for one vote. */
export function answerProbs(theta: number, rating: number, s: number): [number, number, number] {
  const more = sigmoid((theta - rating - ENGINE.equalBand) / s);
  const less = sigmoid((rating - theta - ENGINE.equalBand) / s);
  const equal = Math.max(0, 1 - more - less);
  const l = ENGINE.lapse;
  return [(1 - l) * more + l / 3, (1 - l) * equal + l / 3, (1 - l) * less + l / 3];
}

const ANSWER_INDEX: Record<Answer, number> = { more: 0, equal: 1, less: 2 };

/** Log-likelihood of one rater's votes on the (s, theta) grid: logL[sIndex][thetaIndex]. */
function raterLogLik(votes: Vote[]): Float64Array[] {
  return ENGINE.noiseGrid.map((s) => {
    const out = new Float64Array(N_THETA);
    for (const v of votes) {
      const k = ANSWER_INDEX[v.answer];
      for (let i = 0; i < N_THETA; i++) out[i] += Math.log(answerProbs(THETA[i], v.rating, s)[k]);
    }
    return out;
  });
}

export interface Posterior {
  /** Normalised posterior over THETA. */
  theta: Float64Array;
  /** Per rater: normalised posterior over ENGINE.noiseGrid. */
  noise: Float64Array[];
  /** Per rater: joint posterior p(theta, s_rater | data) as [sIndex][thetaIndex], for information gain. */
  raterJoint: Float64Array[][];
}

function logSumExp(xs: ArrayLike<number>): number {
  let m = -Infinity;
  for (let i = 0; i < xs.length; i++) if (xs[i] > m) m = xs[i];
  if (!isFinite(m)) return m;
  let sum = 0;
  for (let i = 0; i < xs.length; i++) sum += Math.exp(xs[i] - m);
  return m + Math.log(sum);
}

function normalizeLog(logs: Float64Array): Float64Array {
  let m = -Infinity;
  for (const x of logs) if (x > m) m = x;
  const out = new Float64Array(logs.length);
  let sum = 0;
  for (let i = 0; i < logs.length; i++) {
    out[i] = Math.exp(logs[i] - m);
    sum += out[i];
  }
  for (let i = 0; i < out.length; i++) out[i] /= sum;
  return out;
}

/** Posterior given each rater's list of votes. */
export function posterior(votesByRater: Vote[][]): Posterior {
  const S = ENGINE.noiseGrid.length;
  const logTheta = Float64Array.from(LOG_PRIOR_THETA);
  const joints: Float64Array[][] = [];
  const margs: Float64Array[] = [];

  for (const votes of votesByRater) {
    const ll = raterLogLik(votes);
    const joint = ll.map((row, si) => row.map((x) => x + Math.log(ENGINE.noisePrior[si])));
    // Marginalise this rater's noise: log Σ_s p(s) L_r(theta, s).
    const marg = new Float64Array(N_THETA);
    const col = new Float64Array(S);
    for (let i = 0; i < N_THETA; i++) {
      for (let si = 0; si < S; si++) col[si] = joint[si][i];
      marg[i] = logSumExp(col);
      logTheta[i] += marg[i];
    }
    joints.push(joint);
    margs.push(marg);
  }

  const theta = normalizeLog(logTheta);

  // p(theta, s_r | data) = p(theta | data) * p(s_r | theta, rater r's votes).
  const raterJoint = joints.map((joint, r) =>
    joint.map((row) => row.map((x, i) => theta[i] * Math.exp(x - margs[r][i]))),
  );
  const noise = raterJoint.map((rows) => {
    const ps = Float64Array.from(rows, (row) => row.reduce((a, b) => a + b, 0));
    const total = ps.reduce((a, b) => a + b, 0);
    return ps.map((x) => x / total);
  });

  return { theta, noise, raterJoint };
}

function moments(p: ArrayLike<number>): { mean: number; sd: number } {
  let mean = 0;
  for (let i = 0; i < N_THETA; i++) mean += p[i] * THETA[i];
  let v = 0;
  for (let i = 0; i < N_THETA; i++) v += p[i] * (THETA[i] - mean) ** 2;
  return { mean, sd: Math.sqrt(v) };
}

function quantile(p: ArrayLike<number>, q: number): number {
  let c = 0;
  for (let i = 0; i < N_THETA; i++) {
    c += p[i];
    if (c >= q) return THETA[i];
  }
  return THETA[N_THETA - 1];
}

export type OutOfBank = "below" | "above" | null;

export interface FaceSummary {
  mean: number;
  sd: number;
  /** Central ~68% interval (or the widened out-of-bank interval). */
  lo: number;
  hi: number;
  outOfBank: OutOfBank;
  /** Posterior mean of the first rater's noise. */
  noise: number;
}

export function bankRange(bank: Celeb[]): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (const c of bank) {
    min = Math.min(min, c.rating);
    max = Math.max(max, c.rating);
  }
  return { min, max };
}

export function summarize(post: Posterior, bank: Celeb[]): FaceSummary {
  const { min, max } = bankRange(bank);
  let below = 0;
  let above = 0;
  for (let i = 0; i < N_THETA; i++) {
    if (THETA[i] < min) below += post.theta[i];
    if (THETA[i] > max) above += post.theta[i];
  }
  const noise = post.noise[0]
    ? ENGINE.noiseGrid.reduce((acc, s, i) => acc + s * post.noise[0][i], 0)
    : ENGINE.noiseGrid.reduce((acc, s, i) => acc + s * ENGINE.noisePrior[i], 0);

  // Beyond the bank we can't measure how far beyond, so report a wide interval rather
  // than the narrow prior-truncated posterior.
  const w = ENGINE.outOfBankWidth;
  if (above > ENGINE.outOfBankMass) {
    const lo = max;
    const hi = Math.min(ENGINE.thetaMax, max + w);
    return { mean: (lo + hi) / 2, sd: (hi - lo) / Math.sqrt(12), lo, hi, outOfBank: "above", noise };
  }
  if (below > ENGINE.outOfBankMass) {
    const lo = Math.max(ENGINE.thetaMin, min - w);
    const hi = min;
    return { mean: (lo + hi) / 2, sd: (hi - lo) / Math.sqrt(12), lo, hi, outOfBank: "below", noise };
  }
  const { mean, sd } = moments(post.theta);
  return { mean, sd, lo: quantile(post.theta, 0.16), hi: quantile(post.theta, 0.84), outOfBank: null, noise };
}

function entropy(p: ArrayLike<number>): number {
  let h = 0;
  for (let i = 0; i < p.length; i++) if (p[i] > 0) h -= p[i] * Math.log(p[i]);
  return h;
}

/**
 * Expected information gain (nats) about theta from asking `rater` about a celeb with `rating`.
 * Uses the joint posterior over (theta, s_rater), so noise uncertainty is accounted for.
 */
export function expectedInfoGain(post: Posterior, rater: number, rating: number): number {
  const weights = post.raterJoint[rater];
  const outcomes = [new Float64Array(N_THETA), new Float64Array(N_THETA), new Float64Array(N_THETA)];
  ENGINE.noiseGrid.forEach((s, si) => {
    const row = weights[si];
    for (let i = 0; i < N_THETA; i++) {
      const w = row[i];
      if (w < 1e-12) continue;
      const pr = answerProbs(THETA[i], rating, s);
      outcomes[0][i] += w * pr[0];
      outcomes[1][i] += w * pr[1];
      outcomes[2][i] += w * pr[2];
    }
  });
  let expectedH = 0;
  for (const o of outcomes) {
    let py = 0;
    for (let i = 0; i < N_THETA; i++) py += o[i];
    if (py <= 0) continue;
    // H(theta | y) = log py - Σ o log o / py
    let h = 0;
    for (let i = 0; i < N_THETA; i++) if (o[i] > 0) h -= (o[i] / py) * Math.log(o[i] / py);
    expectedH += py * h;
  }
  return entropy(post.theta) - expectedH;
}

export interface NextQuestion {
  celeb: Celeb;
  probe: boolean;
}

/** True when question number `n` (1-based) is a consistency probe. */
export function isProbe(n: number): boolean {
  return n > ENGINE.probeEvery - 1 && n % ENGINE.probeEvery === 0;
}

function categoryMultiplier(category: string, recent: string[]): number {
  let m = 1;
  ENGINE.repeatCategoryPenalty.forEach((penalty, back) => {
    if (recent[recent.length - 1 - back] === category) m *= penalty;
  });
  return m;
}

/** Pick the next celeb for `rater`, or null if the bank is exhausted. */
export function nextQuestion(
  bank: Celeb[],
  votesByRater: Vote[][],
  rater: number,
  rng: Rng,
  post: Posterior = posterior(votesByRater),
): NextQuestion | null {
  const votes = votesByRater[rater] ?? [];
  const used = new Set(votes.map((v) => v.celebId));
  const pool = bank.filter((c) => !used.has(c.id));
  if (pool.length === 0) return null;
  const recent = votes.map((v) => v.category);
  const n = votes.length + 1;

  if (isProbe(n)) {
    const { mean, sd } = moments(post.theta);
    const k = ENGINE.probeMinSds + rng() * (ENGINE.probeMaxSds - ENGINE.probeMinSds);
    const target = mean + (rng() < 0.5 ? -1 : 1) * k * sd;
    let best = pool[0];
    let bestScore = Infinity;
    for (const c of pool) {
      const score = Math.abs(c.rating - target) / categoryMultiplier(c.category, recent);
      if (score < bestScore) {
        best = c;
        bestScore = score;
      }
    }
    return { celeb: best, probe: true };
  }

  const scored = pool.map((c) => ({
    celeb: c,
    score: expectedInfoGain(post, rater, c.rating) * categoryMultiplier(c.category, recent),
  }));
  const top = scored.reduce((m, x) => Math.max(m, x.score), -Infinity);
  const shortlist = scored.filter((x) => x.score >= top * ENGINE.choiceTolerance);
  return { celeb: shortlist[Math.floor(rng() * shortlist.length)].celeb, probe: false };
}

export interface StopLimits {
  minQuestions: number;
  maxQuestions: number;
}

export const DEFAULT_LIMITS: StopLimits = { minQuestions: ENGINE.minQuestions, maxQuestions: ENGINE.maxQuestions };

/** Limits after pressing "keep going" `times` times at question count `answered`. */
export function extendedLimits(answered: number, times: number): StopLimits {
  if (times <= 0) return DEFAULT_LIMITS;
  const until = answered + ENGINE.extendBy;
  return { minQuestions: until, maxQuestions: Math.max(ENGINE.maxQuestions, until) };
}

export function shouldStop(answered: number, face: FaceSummary, limits: StopLimits = DEFAULT_LIMITS): boolean {
  if (answered >= limits.maxQuestions) return true;
  if (answered < limits.minQuestions) return false;
  return face.sd < ENGINE.targetSd || face.outOfBank !== null;
}

/** Progress toward a confident answer, 0..1, for the progress bar. */
export function progress(answered: number, face: FaceSummary, limits: StopLimits = DEFAULT_LIMITS): number {
  const byCount = Math.min(1, answered / limits.minQuestions);
  const sdRange = ENGINE.priorSd - ENGINE.targetSd;
  const bySd = face.outOfBank ? 1 : Math.min(1, Math.max(0, (ENGINE.priorSd - face.sd) / sdRange));
  const byCap = answered / limits.maxQuestions;
  return Math.min(1, Math.max(byCap, Math.min(byCount, bySd)));
}

/** Draw face samples for Monte Carlo. Out-of-bank faces sample the widened interval uniformly. */
export function sampleFace(post: Posterior, face: FaceSummary, n: number, rng: Rng): number[] {
  if (face.outOfBank) return Array.from({ length: n }, () => face.lo + rng() * (face.hi - face.lo));
  const cdf = new Float64Array(N_THETA);
  let c = 0;
  for (let i = 0; i < N_THETA; i++) cdf[i] = c += post.theta[i];
  return Array.from({ length: n }, () => {
    const u = rng() * c;
    let lo = 0;
    let hi = N_THETA - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cdf[mid] < u) lo = mid + 1;
      else hi = mid;
    }
    const jitter = (rng() - 0.5) * ENGINE.thetaStep;
    return Math.min(ENGINE.thetaMax, Math.max(ENGINE.thetaMin, THETA[lo] + jitter));
  });
}

/** Deterministic PRNG (mulberry32), so sessions and tests are reproducible. */
export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
