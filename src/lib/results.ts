import { BANK, type BankCeleb } from "./bank";
import {
  extendedLimits,
  makeRng,
  nextQuestion,
  posterior,
  sampleFace,
  shouldStop,
  summarize,
  type FaceSummary,
  type Posterior,
  type StopLimits,
} from "./engine";
import { bodyScore, heightScore, overallRange, SCORING, topPercent, type AttributeKey, type Range } from "./scoring";
import type { AppState, RaterState } from "./state";

export function votesByRater(state: AppState) {
  return state.raters.map((r) => r.votes);
}

export function limitsFor(r: RaterState): StopLimits {
  return extendedLimits(r.extendedAt, r.extensions);
}

export interface FaceState {
  post: Posterior;
  face: FaceSummary;
}

export function faceState(state: AppState): FaceState {
  const post = posterior(votesByRater(state));
  return { post, face: summarize(post, BANK) };
}

export function isDone(state: AppState, face: FaceSummary): boolean {
  const r = state.raters[state.activeRater];
  return shouldStop(r.votes.length, face, limitsFor(r)) || r.votes.length >= BANK.length;
}

/** Pick the next celeb for the active rater (deterministic given the rater's seed). */
export function pickNext(state: AppState, post: Posterior): BankCeleb | null {
  const r = state.raters[state.activeRater];
  const rng = makeRng(r.seed + r.votes.length * 7919);
  const q = nextQuestion(BANK, votesByRater(state), state.activeRater, rng, post);
  return (q?.celeb as BankCeleb) ?? null;
}

export interface Attribute {
  key: AttributeKey;
  label: string;
  value: number;
}

export interface Results {
  face: FaceSummary;
  height?: number;
  body: number;
  overall: Range;
  top: number;
  match?: BankCeleb;
  attributes: Attribute[];
  strongest?: Attribute;
  weakest?: Attribute;
  verdict: string;
  answered: number;
}

export function verdict(overall: number): string {
  if (overall >= 8.5) return "Exceptional. Very few guys score this high.";
  if (overall >= 7.5) return "Well above average. You'd stand out in most rooms.";
  if (overall >= 6.5) return "Above average. Good-looking by most people's standards.";
  if (overall >= 5) return "Around average, which is where most guys are.";
  if (overall >= 4) return "A bit below average on these three things. Style, grooming and confidence aren't counted here, and they count for a lot.";
  return "Below average on these three things, which leave out most of what people actually like about someone.";
}

/** Celeb closest to the face estimate, preferring ones with a photo. */
export function closestCeleb(face: number): BankCeleb | undefined {
  let best: BankCeleb | undefined;
  for (const c of BANK) {
    const d = Math.abs(c.rating - face) - (c.image ? 0.05 : 0);
    if (!best || d < Math.abs(best.rating - face) - (best.image ? 0.05 : 0)) best = c;
  }
  return best;
}

export function computeResults(state: AppState, fs: FaceState = faceState(state)): Results {
  const { subject } = state;
  const r = state.raters[state.activeRater];
  const height = subject.heightCm ? heightScore(subject.heightCm) : undefined;
  const body = bodyScore(subject.buildId, subject.heightCm, subject.weightKg);
  const samples = sampleFace(fs.post, fs.face, SCORING.monteCarloSamples, makeRng(r.seed ^ 0x5eed));
  const overall = overallRange(samples, { height, body });

  const attributes: Attribute[] = [
    { key: "face", label: "Face", value: fs.face.mean },
    ...(height !== undefined ? [{ key: "height" as const, label: "Height", value: height }] : []),
    { key: "body", label: "Body", value: body },
  ];
  const sorted = [...attributes].sort((a, b) => b.value - a.value);
  const spread = sorted[0].value - sorted[sorted.length - 1].value;

  return {
    face: fs.face,
    height,
    body,
    overall,
    top: topPercent(overall.mean),
    match: fs.face.outOfBank === "below" ? undefined : closestCeleb(fs.face.mean),
    attributes,
    strongest: spread >= 0.3 ? sorted[0] : undefined,
    weakest: spread >= 0.3 ? sorted[sorted.length - 1] : undefined,
    verdict: verdict(overall.mean),
    answered: r.votes.length,
  };
}

export const fmt = (x: number) => x.toFixed(1);

/** "6.4 ± 0.4" */
export function fmtRange(mean: number, sd: number): string {
  return `${fmt(mean)} ± ${fmt(Math.max(0.1, sd))}`;
}

export function fmtFace(face: FaceSummary): string {
  if (face.outOfBank === "above") return `${fmt(face.lo)}+ (above the bank)`;
  if (face.outOfBank === "below") return `under ${fmt(face.hi)} (below the bank)`;
  return fmtRange(face.mean, face.sd);
}

export function shareText(res: Results, name: string): string {
  const who = name.trim() ? `${name.trim()}: ` : "";
  const parts = [
    `face ${fmtFace(res.face)}`,
    res.height !== undefined ? `height ${fmt(res.height)}` : null,
    `body ${fmt(res.body)}`,
  ].filter(Boolean);
  const match = res.match ? ` Face around the level of ${res.match.name}.` : "";
  return `Modulo Maxx. ${who}${fmtRange(res.overall.mean, res.overall.sd)} overall, top ${res.top}% of guys. ${parts.join(", ")}.${match} For fun, not science.`;
}
