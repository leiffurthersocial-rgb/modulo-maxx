// Mog battle: a group ranks its own faces by passing one device around. Each rater answers
// head-to-head "who has the better face?" questions; nobody sees results until the reveal.
//
// Ranking is a Bradley-Terry fit over every vote (the maximum-likelihood version of Elo:
// order-independent, so an early vote counts as much as a late one), shown on the familiar
// Elo scale: 1500 average, +400 points = 10x the odds of winning a head-to-head.

export interface Player {
  id: string;
  name: string;
  /** Downscaled JPEG data URL. */
  photo: string;
}

/** "a" or "b" won; "tie" when the rater couldn't pick. */
export interface MogVote {
  a: string;
  b: string;
  winner: "a" | "b" | "tie";
  rater: number;
}

export interface MogState {
  version: 1;
  screen: "setup" | "handoff" | "vote" | "between" | "reveal";
  players: Player[];
  votes: MogVote[];
  /** Index of the rater currently holding the device (0-based). */
  rater: number;
  /** Pairs left for the current rater, as [aId, bId]. */
  queue: [string, string][];
}

export interface Standing {
  player: Player;
  elo: number;
  /** ± one standard error on the Elo scale. */
  err: number;
  wins: number;
  losses: number;
  ties: number;
}

const KEY = "modulo-maxx:mog:v1";
const ELO_SCALE = 400 / Math.LN10;

export function initialMog(): MogState {
  return { version: 1, screen: "setup", players: [], votes: [], rater: 0, queue: [] };
}

export function loadMog(): MogState | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as MogState;
    return s?.version === 1 && Array.isArray(s.players) ? s : null;
  } catch {
    return null;
  }
}

/** Returns false when the photos don't fit in storage (the game still works until a reload). */
export function saveMog(s: MogState): boolean {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s));
    return true;
  } catch {
    return false;
  }
}

export function clearMog(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

/** Questions per rater: every pair for small groups, otherwise enough for each face to appear ~6 times. */
export function questionsPerRater(n: number): number {
  const all = (n * (n - 1)) / 2;
  return Math.min(all, Math.max(10, 3 * n), 30);
}

function shuffle<T>(xs: T[], rng: () => number): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Pairs for the next rater. Small groups get every pair. Larger groups get the pairs that tell us
 * most: least-compared first, then closest in current rating, with each face spread evenly.
 */
export function pairsForRater(players: Player[], votes: MogVote[], rng: () => number = Math.random): [string, string][] {
  const ids = players.map((p) => p.id);
  const all: [string, string][] = [];
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) all.push([ids[i], ids[j]]);
  const k = questionsPerRater(ids.length);
  let chosen: [string, string][];
  if (k >= all.length) {
    chosen = shuffle(all, rng);
  } else {
    const elo = new Map(fitRanking(players, votes).map((s) => [s.player.id, s.elo]));
    const seen = new Map<string, number>();
    for (const v of votes) {
      const key = [v.a, v.b].sort().join("|");
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
    const appear = new Map(ids.map((id) => [id, 0]));
    chosen = [];
    const pool = shuffle(all, rng);
    while (chosen.length < k) {
      let best = -1;
      let bestScore = Infinity;
      pool.forEach(([a, b], i) => {
        const score =
          (seen.get([a, b].sort().join("|")) ?? 0) * 3 +
          (appear.get(a)! + appear.get(b)!) +
          Math.abs(elo.get(a)! - elo.get(b)!) / 200;
        if (score < bestScore) {
          bestScore = score;
          best = i;
        }
      });
      const [pair] = pool.splice(best, 1);
      chosen.push(pair);
      appear.set(pair[0], appear.get(pair[0])! + 1);
      appear.set(pair[1], appear.get(pair[1])! + 1);
    }
  }
  // Random left/right so position doesn't bias anyone.
  return chosen.map(([a, b]) => (rng() < 0.5 ? [a, b] : [b, a]));
}

/**
 * Bradley-Terry by MM iterations, with a weak prior (one virtual tie against an average opponent)
 * so a face that won or lost everything still gets a finite score. Ties count half a win each.
 */
export function fitRanking(players: Player[], votes: MogVote[]): Standing[] {
  const n = players.length;
  if (n === 0) return [];
  const idx = new Map(players.map((p, i) => [p.id, i]));
  const wins = new Float64Array(n);
  const games: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  const tally = players.map(() => ({ w: 0, l: 0, t: 0 }));
  for (const v of votes) {
    const i = idx.get(v.a);
    const j = idx.get(v.b);
    if (i === undefined || j === undefined) continue;
    games[i][j]++;
    games[j][i]++;
    if (v.winner === "a") {
      wins[i]++;
      tally[i].w++;
      tally[j].l++;
    } else if (v.winner === "b") {
      wins[j]++;
      tally[j].w++;
      tally[i].l++;
    } else {
      wins[i] += 0.5;
      wins[j] += 0.5;
      tally[i].t++;
      tally[j].t++;
    }
  }
  const PRIOR = 1; // virtual games against a strength-1 opponent, half won
  let p = new Float64Array(n).fill(1);
  for (let it = 0; it < 500; it++) {
    const next = new Float64Array(n);
    let maxDiff = 0;
    for (let i = 0; i < n; i++) {
      let denom = PRIOR / (p[i] + 1);
      for (let j = 0; j < n; j++) if (games[i][j]) denom += games[i][j] / (p[i] + p[j]);
      next[i] = (wins[i] + PRIOR / 2) / denom;
    }
    // Normalise so the geometric mean is 1 (average = 1500).
    const g = Math.exp(next.reduce((s, x) => s + Math.log(x), 0) / n);
    for (let i = 0; i < n; i++) {
      next[i] /= g;
      maxDiff = Math.max(maxDiff, Math.abs(Math.log(next[i]) - Math.log(p[i])));
    }
    p = next;
    if (maxDiff < 1e-9) break;
  }
  // Standard error from the Fisher information of each log-strength (holding the others fixed).
  const standings = players.map((player, i) => {
    let info = (PRIOR * p[i]) / (p[i] + 1) ** 2;
    for (let j = 0; j < n; j++) if (games[i][j]) info += (games[i][j] * p[i] * p[j]) / (p[i] + p[j]) ** 2;
    return {
      player,
      elo: Math.round(1500 + ELO_SCALE * Math.log(p[i])),
      err: Math.round(ELO_SCALE / Math.sqrt(info)),
      wins: tally[i].w,
      losses: tally[i].l,
      ties: tally[i].t,
    };
  });
  return standings.sort((a, b) => b.elo - a.elo);
}

/** Expected chance that a beats b, from Elo-scale scores. */
export function winChance(eloA: number, eloB: number): number {
  return 1 / (1 + 10 ** ((eloB - eloA) / 400));
}

/** Downscale an uploaded image to a small square-ish JPEG data URL so a whole group fits in storage. */
export function downscale(file: File, maxSide = 360, quality = 0.8): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, maxSide / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * s);
      canvas.height = Math.round(img.height * s);
      canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Couldn't read that image"));
    };
    img.src = url;
  });
}
