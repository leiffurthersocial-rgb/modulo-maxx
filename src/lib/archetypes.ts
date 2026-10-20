// Vibe check: which archetype does a guy fit? Separate from the attractiveness test.
//
// The rater sees one celeb at a time and says how similar the guy's vibe is (very / a bit / not).
// Each celeb belongs to 1-3 archetypes (data/archetypes.json, best fit first), so an answer counts
// toward each of his archetypes with a weight that falls off by position. An archetype's match is
// the share of possible points it earned, with a light prior so one answer can't decide it.

import archetypeData from "@data/archetypes.json";
import { BANK, type BankCeleb } from "./bank";

export interface Archetype {
  id: string;
  label: string;
  blurb: string;
}

export const ARCHETYPES: Archetype[] = [
  { id: "pretty-boy", label: "Pretty boy", blurb: "Soft, youthful features. More beautiful than rugged." },
  { id: "model", label: "Model", blurb: "Striking, angular, editorial. Looks like he walks runways." },
  { id: "leading-man", label: "Leading man", blurb: "Classic, polished handsome. Movie-poster face." },
  { id: "rugged", label: "Rugged", blurb: "Weathered, stubbled, outdoorsy. Masculine with an edge." },
  { id: "boy-next-door", label: "Boy next door", blurb: "Warm, friendly and approachable. Easy to like." },
  { id: "bad-boy", label: "Bad boy", blurb: "Edgy, brooding, a bit of trouble." },
  { id: "artsy", label: "Artsy", blurb: "Indie, creative, a little unconventional." },
  { id: "athlete", label: "Athlete", blurb: "Sporty, competitive, jock energy." },
  { id: "funny-guy", label: "Funny guy", blurb: "Goofy, lovable, the one who makes the room laugh." },
  { id: "silver-fox", label: "Silver fox", blurb: "Distinguished, mature, aging like wine." },
  { id: "tough-guy", label: "Tough guy", blurb: "Hard, intimidating, don't-mess-with-me." },
  { id: "character", label: "Character", blurb: "Distinctive and memorable. A face nobody forgets." },
];

const BY_ID = new Map(ARCHETYPES.map((a) => [a.id, a]));

export function getArchetype(id: string): Archetype | undefined {
  return BY_ID.get(id);
}

const TAGS = (archetypeData as { celebs: Record<string, string[]> }).celebs;

/** A celeb's archetypes, best fit first (unknown ids dropped). */
export function archetypesOf(c: Pick<BankCeleb, "name">): string[] {
  return (TAGS[c.name] ?? []).filter((id) => BY_ID.has(id));
}

/** Celebs that can appear in the vibe check: tagged and with a photo. */
export const VIBE_POOL: BankCeleb[] = BANK.filter((c) => c.image && archetypesOf(c).length > 0);

export type VibeAnswer = "very" | "bit" | "not";

export interface VibeVote {
  celebId: string;
  answer: VibeAnswer;
}

const POINTS: Record<VibeAnswer, number> = { very: 2, bit: 1, not: 0 };
/** Weight of a celeb's 1st, 2nd and 3rd archetype. */
const POSITION_WEIGHT = [1, 0.6, 0.4];
/** Prior: as if each archetype had already been seen once with a "bit" answer at weight PRIOR. */
const PRIOR = 0.5;

export const VIBE_QUESTIONS = 18;

export interface ArchetypeScore {
  archetype: Archetype;
  /** 0..1 */
  match: number;
  /** Total weight of evidence. */
  seen: number;
}

export function scoreVibe(votes: VibeVote[], pool: BankCeleb[] = VIBE_POOL): ArchetypeScore[] {
  const byId = new Map(pool.map((c) => [c.id, c]));
  const earned = new Map(ARCHETYPES.map((a) => [a.id, PRIOR]));
  const possible = new Map(ARCHETYPES.map((a) => [a.id, 2 * PRIOR]));
  const seen = new Map(ARCHETYPES.map((a) => [a.id, 0]));
  for (const v of votes) {
    const c = byId.get(v.celebId);
    if (!c) continue;
    archetypesOf(c).forEach((id, i) => {
      const w = POSITION_WEIGHT[i] ?? 0.3;
      earned.set(id, earned.get(id)! + w * POINTS[v.answer]);
      possible.set(id, possible.get(id)! + w * 2);
      seen.set(id, seen.get(id)! + w);
    });
  }
  return ARCHETYPES.map((archetype) => ({
    archetype,
    match: earned.get(archetype.id)! / possible.get(archetype.id)!,
    seen: seen.get(archetype.id)!,
  })).sort((a, b) => b.match - a.match || b.seen - a.seen);
}

/**
 * Next celeb to show. The first pass covers every archetype once; after that it probes the
 * archetypes least seen among the current top four, so the leaders get separated. Within an
 * archetype it prefers celebs who are mainly that archetype (first-listed, few tags).
 */
export function nextVibeCeleb(votes: VibeVote[], rng: () => number = Math.random, pool: BankCeleb[] = VIBE_POOL): BankCeleb | null {
  if (votes.length >= VIBE_QUESTIONS) return null;
  const used = new Set(votes.map((v) => v.celebId));
  const scores = scoreVibe(votes, pool);
  const firstPass = votes.length < ARCHETYPES.length;
  const candidates = firstPass ? scores : scores.slice(0, 4);
  const target = [...candidates].sort((a, b) => a.seen - b.seen || rng() - 0.5)[0].archetype.id;

  let best: BankCeleb | null = null;
  let bestScore = -Infinity;
  for (const c of pool) {
    if (used.has(c.id)) continue;
    const tags = archetypesOf(c);
    const pos = tags.indexOf(target);
    if (pos < 0) continue;
    const score = (pos === 0 ? 2 : 1 - pos * 0.3) - (tags.length - 1) * 0.3 + rng() * 0.8;
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  if (best) return best;
  const rest = pool.filter((c) => !used.has(c.id));
  return rest.length ? rest[Math.floor(rng() * rest.length)] : null;
}

/** Celebs to show next to a result: the ones he was said to resemble first, then typical examples. */
export function vibeExamples(archetypeId: string, votes: VibeVote[], n = 3, pool: BankCeleb[] = VIBE_POOL): BankCeleb[] {
  const byId = new Map(pool.map((c) => [c.id, c]));
  const liked = votes
    .filter((v) => v.answer === "very")
    .map((v) => byId.get(v.celebId))
    .filter((c): c is BankCeleb => !!c && archetypesOf(c).includes(archetypeId));
  const typical = pool
    .filter((c) => archetypesOf(c)[0] === archetypeId && !liked.includes(c))
    .sort((a, b) => b.rating - a.rating);
  return [...liked, ...typical].slice(0, n);
}

const KEY = "modulo-maxx:vibe:v1";

export interface VibeState {
  version: 1;
  name: string;
  votes: VibeVote[];
  current?: string;
  done: boolean;
}

export function loadVibe(): VibeState | null {
  try {
    const s = JSON.parse(window.localStorage.getItem(KEY) ?? "null") as VibeState | null;
    return s?.version === 1 ? s : null;
  } catch {
    return null;
  }
}

export function saveVibe(s: VibeState): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // ignore
  }
}

export function clearVibe(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
