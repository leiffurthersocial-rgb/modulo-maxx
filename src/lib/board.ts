// Group board: friends post themselves (name, optional photo), everyone in the group rates them on
// the same 1-10 scale as the celeb bank, and the results are visible to the whole group. Shared
// between the API routes and the client.

export const SCORE_MIN = 1;
export const SCORE_MAX = 10;
export const SCORE_STEP = 0.5;
export const NAME_MAX = 32;
export const BOARD_NAME_MAX = 40;
export const MAX_POSTS = 60;
/** Photos are resized on the phone to a ~480px JPEG; this caps the data URL. */
export const PHOTO_MAX_CHARS = 400_000;

export interface BoardRating {
  score: number;
  /** Absent on anonymous boards. */
  name?: string;
  at: number;
  /** This rating is from the device asking. */
  mine?: boolean;
}

export interface BoardPost {
  id: string;
  name: string;
  hasPhoto: boolean;
  createdAt: number;
  /** Posted from the device asking (it can't rate itself). */
  mine?: boolean;
  ratings: BoardRating[];
}

export interface BoardView {
  id: string;
  name: string;
  /** Raters don't give a name. */
  anon: boolean;
  createdAt: number;
  posts: BoardPost[];
}

export function validScore(x: unknown): x is number {
  return typeof x === "number" && x >= SCORE_MIN && x <= SCORE_MAX && Math.abs(x / SCORE_STEP - Math.round(x / SCORE_STEP)) < 1e-9;
}

export function cleanName(x: unknown, max = NAME_MAX): string {
  return typeof x === "string" ? x.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

export interface Stats {
  n: number;
  mean: number;
  median: number;
  /** Count per whole point, index 0 = 1-1.5 … index 9 = 10. */
  hist: number[];
}

export function stats(ratings: { score: number }[]): Stats {
  const s = ratings.map((r) => r.score).sort((a, b) => a - b);
  const n = s.length;
  const hist = new Array(10).fill(0);
  for (const x of s) hist[Math.min(9, Math.floor(x) - 1)]++;
  return {
    n,
    mean: n ? s.reduce((a, b) => a + b, 0) / n : 0,
    median: n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : 0,
    hist,
  };
}
