// Archetypes: which character would a guy be cast as? Separate from the attractiveness test.
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
  { id: "prince", label: "Prince charming", blurb: "Regal, elegant, fairytale lead. Born for a ballroom." },
  { id: "hero", label: "Hero", blurb: "The good guy who saves the day. Noble, square-jawed, trustworthy." },
  { id: "villain", label: "Villain", blurb: "The antagonist everyone secretly roots for. Cold, sharp, magnetic." },
  { id: "vampire", label: "Vampire", blurb: "Pale, dark, brooding, intense stare. Centuries old, still 17." },
  { id: "werewolf", label: "Werewolf", blurb: "Wild, warm, rugged and a little feral. Runs hot." },
  { id: "bad-boy", label: "Bad boy", blurb: "Leather jacket, rebellious streak, definitely trouble." },
  { id: "bully", label: "The bully", blurb: "Cocky, popular, smug. Peaked in high school and knows it." },
  { id: "jock", label: "Jock", blurb: "Team captain energy. Sporty, competitive, everyone knows him." },
  { id: "surfer", label: "Surfer", blurb: "Sun-kissed, salty hair, laid-back. Lives in boardshorts." },
  { id: "skater", label: "Skater", blurb: "Lanky, messy hair, streetwear, unbothered." },
  { id: "rockstar", label: "Rockstar", blurb: "Stage presence, messy hair, all the charisma." },
  { id: "cowboy", label: "Cowboy", blurb: "Southern charm, rugged americana, yes ma'am." },
  { id: "soldier", label: "Soldier", blurb: "Disciplined, stoic, buzzcut-ready. Strong silent type." },
  { id: "nerd", label: "Cute nerd", blurb: "Smart, a bit awkward, adorable in glasses." },
  { id: "artsy", label: "Indie artist", blurb: "Creative, thoughtful, film-student vibe." },
  { id: "poet", label: "Poet", blurb: "Soulful, romantic, longing looks. Period-drama lead." },
  { id: "golden-retriever", label: "Golden retriever", blurb: "Sunny, loyal, enthusiastic boyfriend energy." },
  { id: "boy-next-door", label: "Boy next door", blurb: "Wholesome, sweet and easy to talk to." },
  { id: "pretty-boy", label: "Pretty boy", blurb: "Soft, delicate, youthful. Prettier than you." },
  { id: "model", label: "Model", blurb: "Striking, angular, editorial. Belongs on a billboard." },
  { id: "old-money", label: "Old money", blurb: "Polished, preppy heir. Country club on weekends." },
  { id: "playboy", label: "Playboy", blurb: "Smooth, flirty, charming. Has a line for everyone." },
  { id: "mysterious", label: "Mysterious loner", blurb: "Quiet, aloof, enigmatic. Sits in the back." },
  { id: "silver-fox", label: "Silver fox", blurb: "Distinguished and aging like fine wine." },
  { id: "e-boy", label: "E-boy", blurb: "Internet-era alt. Chains, dyed hair, Gen-Z aesthetic." },
  { id: "frat-boy", label: "Frat boy", blurb: "Party, backwards cap, 'bro' in every sentence." },
  { id: "rugged", label: "Lumberjack", blurb: "Bearded, weathered, outdoorsy. Smells like campfire." },
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

/**
 * Only reasonably attractive celebs (rating >= MIN_RATING) take part: matching a vibe only feels
 * right against someone people find good-looking.
 */
export const MIN_RATING = 6.3;

/** Celebs that can appear in the archetypes quiz: attractive, tagged and with a photo. */
export const VIBE_POOL: BankCeleb[] = BANK.filter((c) => c.image && c.rating >= MIN_RATING && archetypesOf(c).length > 0);

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

export const VIBE_QUESTIONS = 20;
/** Questions spent covering the least-seen archetypes before narrowing in on the leaders. */
const EXPLORE = 12;

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
 * Next celeb to show. The first EXPLORE questions go to the least-seen archetypes (each celeb
 * covers 2-4, so this reaches all of them); after that it probes the least-seen of the current
 * top five, so the leaders get separated. Within an
 * archetype it prefers celebs who are mainly that archetype (first-listed, few tags).
 */
export function nextVibeCeleb(votes: VibeVote[], rng: () => number = Math.random, pool: BankCeleb[] = VIBE_POOL): BankCeleb | null {
  if (votes.length >= VIBE_QUESTIONS) return null;
  const used = new Set(votes.map((v) => v.celebId));
  const scores = scoreVibe(votes, pool);
  const candidates = votes.length < EXPLORE ? scores : scores.slice(0, 5);
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

const KEY = "modulo-maxx:archetypes:v1";

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
