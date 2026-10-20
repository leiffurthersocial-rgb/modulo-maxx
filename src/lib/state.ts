import type { Vote } from "./engine";
import { DEFAULT_BUILD_ID } from "./builds";

export type Screen = "landing" | "subject" | "handoff" | "rating" | "results";

export interface Subject {
  name: string;
  heightCm?: number;
  weightKg?: number;
  buildId: string;
  heightUnit: "cm" | "ftin";
  weightUnit: "kg" | "lb";
}

/** One person rating the subject. Answers from all raters are pooled into one face estimate. */
export interface RaterState {
  id: string;
  votes: Vote[];
  /** Celeb currently on screen, so a reload shows the same question. */
  current?: string;
  /** "Keep going" presses, and the answer count at the last press. */
  extensions: number;
  extendedAt: number;
  seed: number;
}

export interface AppState {
  version: 1;
  screen: Screen;
  subject: Subject;
  raters: RaterState[];
  activeRater: number;
}

const KEY = "modulo-maxx:v1";

export function newRater(id = "rater-1"): RaterState {
  return { id, votes: [], extensions: 0, extendedAt: 0, seed: Math.floor(Math.random() * 2 ** 31) };
}

export function initialState(): AppState {
  return {
    version: 1,
    screen: "landing",
    subject: { name: "", buildId: DEFAULT_BUILD_ID, heightUnit: "cm", weightUnit: "kg" },
    raters: [newRater()],
    activeRater: 0,
  };
}

export function loadState(): AppState | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as AppState;
    if (s?.version !== 1 || !Array.isArray(s.raters) || s.raters.length === 0) return null;
    return s;
  } catch {
    return null;
  }
}

export function saveState(s: AppState): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Private mode or storage full: the app still works, it just won't survive a reload.
  }
}

export function clearState(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

/** Display name for copy: the subject's name, or "he". */
export function subjectRef(s: Subject): string {
  return s.name.trim() || "he";
}
