// Celebrity ranker: people pick the better face out of two celebs, again and again, to correct the
// bank's ratings. The export goes back into data/celebs.json.
//
// Model: ordered logit on the rating scale. With d = (θa − θb) / S, the five answers
// (b much better, b better, too close, a better, a much better) are the bins of d + noise cut at
// −CUT_MUCH, −CUT_TIE, +CUT_TIE, +CUT_MUCH. So "much better" says "probably a point or more
// apart", and a few of those can move a badly misrated celeb a long way. Each θ starts from (and
// is pulled towards) the celeb's current rating by a Gaussian prior, so the result is directly a
// new rating. Fit by MAP with Newton steps per celeb; the curvature gives a ± per celeb.
//
// Pair choice: the celeb just judged comes straight back while his rating is still uncertain,
// against partners near his new estimate (a binary search for where he belongs). Otherwise an
// uncertain, seldom-compared celeb against a close partner, plus the odd long-range pair to catch
// big misratings.

import { BANK, type BankCeleb } from "./bank";

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

/** Rating points per logit. */
export const S = 0.55;
/** Prior SD around the current rating: loose enough that a clearly misrated celeb can move 1-2 points. */
export const PRIOR_SD = 1.4;
/** Cut points (in logits) between "too close" / "better" / "much better". */
export const CUT_TIE = 0.35;
export const CUT_MUCH = 2.0;

/** How much better a is than b: 2 = a much better, 1 = a better, 0 = too close, -1, -2 for b. */
export type Margin = -2 | -1 | 0 | 1 | 2;

export interface RankVote {
  /** Celeb ids, in the order shown. */
  a: string;
  b: string;
  margin: Margin;
  rater: string;
}

const CUTS = [-CUT_MUCH, -CUT_TIE, CUT_TIE, CUT_MUCH];

/** Answer probabilities for d = (θa − θb) / S, index margin + 2. */
export function marginProbs(d: number): number[] {
  // P(d + noise > cut) for each cut, with the open ends as 1 and 0.
  const above = [1, ...CUTS.map((c) => sigmoid(d - c)), 0];
  return [0, 1, 2, 3, 4].map((k) => above[k] - above[k + 1]);
}

export interface Fitted {
  celeb: BankCeleb;
  old: number;
  /** New rating (MAP), same 0-10 scale. */
  rating: number;
  /** ± one SD. */
  sd: number;
  comparisons: number;
}

export type Band = "all" | "high" | "mid" | "low";

export const BANDS: Record<Band, { label: string; test: (r: number) => boolean }> = {
  all: { label: "Everyone", test: () => true },
  high: { label: "7 and up", test: (r) => r >= 7 },
  mid: { label: "5 to 7", test: (r) => r >= 5 && r < 7 },
  low: { label: "Under 5", test: (r) => r < 5 },
};

const f1 = (x: number) => {
  const p = sigmoid(x);
  return p * (1 - p);
};

/** Bounds of answer k (0..4) on the latent scale: ±∞ at the ends. */
function bin(k: number): [number, number] {
  return [k === 0 ? -Infinity : CUTS[k - 1], k === 4 ? Infinity : CUTS[k]];
}
const up = (d: number, c: number) => (c === -Infinity ? 1 : c === Infinity ? 0 : sigmoid(d - c));
const slope = (d: number, c: number) => (Math.abs(c) === Infinity ? 0 : f1(d - c));

/**
 * Gradient of log P(margin | d) with respect to d, and the expected (Fisher) information, which is
 * always positive and keeps the Newton steps stable for the middle answers.
 */
function logLikDerivs(d: number, m: Margin): { g: number; h: number } {
  let info = 0;
  let g = 0;
  for (let k = 0; k < 5; k++) {
    const [lo, hi] = bin(k);
    const P = Math.max(1e-12, up(d, lo) - up(d, hi));
    const dP = slope(d, lo) - slope(d, hi);
    info += (dP * dP) / P;
    if (k === m + 2) g = dP / P;
  }
  return { g, h: Math.max(1e-4, info) };
}

/** MAP fit under the ordered-logit model. */
export function fit(votes: RankVote[], pool: BankCeleb[] = BANK, priorSd: number = PRIOR_SD): Fitted[] {
  const idx = new Map(pool.map((c, i) => [c.id, i]));
  const n = pool.length;
  const mu = pool.map((c) => c.rating);
  const theta = Float64Array.from(mu);
  const games: [number, number, Margin][] = [];
  const count = new Array(n).fill(0);
  for (const v of votes) {
    const i = idx.get(v.a);
    const j = idx.get(v.b);
    if (i === undefined || j === undefined) continue;
    games.push([i, j, v.margin]);
    count[i]++;
    count[j]++;
  }
  const hess = new Float64Array(n);
  for (let it = 0; it < 200; it++) {
    const grad = new Float64Array(n);
    hess.fill(0);
    for (let i = 0; i < n; i++) {
      grad[i] = -(theta[i] - mu[i]) / priorSd ** 2;
      hess[i] = 1 / priorSd ** 2;
    }
    for (const [i, j, m] of games) {
      const { g, h } = logLikDerivs((theta[i] - theta[j]) / S, m);
      grad[i] += g / S;
      grad[j] -= g / S;
      hess[i] += h / S ** 2;
      hess[j] += h / S ** 2;
    }
    let maxStep = 0;
    for (let i = 0; i < n; i++) {
      // Damped: both celebs in a pair move at once, so a full step would overshoot.
      const step = Math.max(-0.5, Math.min(0.5, (0.6 * grad[i]) / hess[i]));
      theta[i] += step;
      maxStep = Math.max(maxStep, Math.abs(step));
    }
    if (maxStep < 1e-6) break;
  }
  return pool.map((celeb, i) => ({
    celeb,
    old: mu[i],
    rating: Math.round(Math.min(10, Math.max(0, theta[i])) * 10) / 10,
    sd: Math.round((1 / Math.sqrt(hess[i])) * 100) / 100,
    comparisons: count[i],
  }));
}

/** A celeb keeps coming back while he's this uncertain (rating points) … */
const FOLLOW_SD = 0.5;
/** … up to this many times in a row. */
const FOLLOW_MAX = 4;

/** Next pair to show, or null if the band has fewer than two celebs. */
export function nextPair(
  votes: RankVote[],
  band: Band = "all",
  rng: () => number = Math.random,
  pool: BankCeleb[] = BANK,
): [BankCeleb, BankCeleb] | null {
  const fitted = fit(votes, pool);
  const byId = new Map(fitted.map((f) => [f.celeb.id, f]));
  const inBand = fitted.filter((f) => f.celeb.image && BANDS[band].test(f.old));
  if (inBand.length < 2) return null;
  const seen = new Set(votes.map((v) => [v.a, v.b].sort().join("|")));
  const streak = (id: string) => {
    let n = 0;
    for (let k = votes.length - 1; k >= 0 && (votes[k].a === id || votes[k].b === id); k--) n++;
    return n;
  };

  // Follow-up: a celeb from the last few picks comes back while his spot is unclear. The one whose
  // rating moved most from where it started goes first: he's the likely misrated one.
  const recentIds = [...new Set(votes.slice(-3).flatMap((v) => [v.a, v.b]))];
  let anchor: Fitted | undefined = recentIds
    .map((id) => byId.get(id))
    .filter((f): f is Fitted => !!f && f.sd > FOLLOW_SD && streak(f.celeb.id) < FOLLOW_MAX)
    .sort((x, y) => y.sd + 0.5 * Math.abs(y.rating - y.old) - (x.sd + 0.5 * Math.abs(x.rating - x.old)))[0];
  const recent = new Set(votes.slice(-4).flatMap((v) => [v.a, v.b]));
  recent.delete(anchor?.celeb.id ?? "");
  if (!anchor) {
    anchor =
      [...inBand]
        .filter((f) => !recent.has(f.celeb.id))
        .map((f) => ({ f, score: f.sd / Math.sqrt(1 + f.comparisons) + rng() * 0.3 }))
        .sort((x, y) => y.score - x.score)[0]?.f ?? inBand[Math.floor(rng() * inBand.length)];
  }

  // Partner: usually near the anchor's current estimate (≈ 50/50 is most informative); one time in
  // six, 1-2.5 points away to catch celebs who are badly misrated.
  const longRange = rng() < 1 / 6;
  let best: Fitted | null = null;
  let bestScore = -Infinity;
  for (const f of inBand) {
    if (f === anchor || recent.has(f.celeb.id)) continue;
    const gap = Math.abs(f.rating - anchor.rating);
    if (longRange ? gap < 1 || gap > 2.5 : gap > 1.5) continue;
    const p = sigmoid((anchor.rating - f.rating) / S);
    const repeat = seen.has([anchor.celeb.id, f.celeb.id].sort().join("|"));
    const score = (longRange ? 0 : p * (1 - p)) + f.sd * 0.05 - (repeat ? 0.5 : 0) + rng() * 0.05;
    if (score > bestScore) {
      bestScore = score;
      best = f;
    }
  }
  if (!best) best = inBand.find((f) => f !== anchor)!;
  return rng() < 0.5 ? [anchor.celeb, best.celeb] : [best.celeb, anchor.celeb];
}

/** Summary + raw votes, for handing back to be fitted into data/celebs.json. */
export function exportResults(votes: RankVote[]): string {
  const fitted = fit(votes).filter((f) => f.comparisons > 0);
  const raters = [...new Set(votes.map((v) => v.rater))];
  return JSON.stringify(
    {
      kind: "modulo-maxx-celebrity-ranker",
      exportedAt: new Date().toISOString(),
      raters,
      votes: votes.map((v) => ({ a: v.a, b: v.b, margin: v.margin, rater: v.rater })),
      changes: fitted
        .filter((f) => Math.abs(f.rating - f.old) >= 0.1)
        .sort((x, y) => Math.abs(y.rating - y.old) - Math.abs(x.rating - x.old))
        .map((f) => ({ name: f.celeb.name, old: f.old, new: f.rating, sd: f.sd, comparisons: f.comparisons })),
    },
    null,
    1,
  );
}

const KEY = "modulo-maxx:ranker:v2";

export interface RankerState {
  version: 2;
  votes: RankVote[];
  rater: string;
  raters: string[];
  band: Band;
  showNames: boolean;
  current?: [string, string];
}

export function initialRanker(): RankerState {
  return { version: 2, votes: [], rater: "", raters: [], band: "all", showNames: false };
}

export function loadRanker(): RankerState | null {
  try {
    const s = JSON.parse(window.localStorage.getItem(KEY) ?? "null") as RankerState | null;
    return s?.version === 2 ? s : null;
  } catch {
    return null;
  }
}

export function saveRanker(s: RankerState): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // ignore
  }
}

export function clearRanker(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
