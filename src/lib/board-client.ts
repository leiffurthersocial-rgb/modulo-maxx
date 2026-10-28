// Browser side of the group board: this device's identity and tokens (localStorage), and API calls.

import type { BoardView } from "./board";

const KEY = "modulo-maxx:board:v1";

export interface BoardLocal {
  /** Random id for this device; the server only keeps its hash. */
  voter: string;
  /** Name used for ratings on boards that show names, and to prefill "Post yourself". */
  name: string;
  /** Boards this device has opened, newest first. */
  boards: { id: string; name: string; adminToken?: string; seen: number }[];
  /** Delete tokens for posts made on this device. */
  owned: Record<string, string>;
}

function randomId() {
  const b = new Uint8Array(18);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

export function loadLocal(): BoardLocal {
  try {
    const s = JSON.parse(window.localStorage.getItem(KEY) ?? "null") as BoardLocal | null;
    if (s?.voter) return { voter: s.voter, name: s.name ?? "", boards: s.boards ?? [], owned: s.owned ?? {} };
  } catch {
    // fall through
  }
  return { voter: randomId(), name: "", boards: [], owned: {} };
}

export function saveLocal(s: BoardLocal): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // ignore: private mode etc.; the board still works for this visit
  }
}

export function rememberBoard(s: BoardLocal, b: { id: string; name: string; adminToken?: string }): BoardLocal {
  const old = s.boards.find((x) => x.id === b.id);
  const entry = { id: b.id, name: b.name, adminToken: b.adminToken ?? old?.adminToken, seen: Date.now() };
  return { ...s, boards: [entry, ...s.boards.filter((x) => x.id !== b.id)].slice(0, 20) };
}

export function forgetBoard(s: BoardLocal, id: string): BoardLocal {
  return { ...s, boards: s.boards.filter((x) => x.id !== id) };
}

/** Board code from a pasted link or a typed code. */
export function parseCode(input: string): string | null {
  const t = input.trim();
  const m = t.match(/[?&]g=([a-z0-9]{4,16})/i) ?? t.match(/^([a-z0-9]{4,16})$/i);
  return m ? m[1].toLowerCase() : null;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public setup = false,
  ) {
    super(message);
  }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/board/${path}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
  } catch {
    throw new ApiError("No connection. Try again.", 0);
  }
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(out.error ?? `Error ${res.status}`, res.status, !!out.setup);
  return out as T;
}

export const api = {
  create: (name: string, anon: boolean) => call<{ id: string; adminToken: string }>("POST", "", { name, anon }),
  get: (id: string, voter: string) => call<BoardView>("GET", `${id}/?voter=${encodeURIComponent(voter)}`),
  update: (id: string, adminToken: string, patch: { anon?: boolean; name?: string }) =>
    call("PATCH", `${id}/`, { adminToken, ...patch }),
  remove: (id: string, adminToken: string) => call("DELETE", `${id}/`, { adminToken }),
  post: (id: string, name: string, photo: string | null, voter: string) =>
    call<{ postId: string; ownerToken: string }>("POST", `${id}/posts/`, { name, photo, voter }),
  removePost: (id: string, postId: string, token: string) => call("DELETE", `${id}/posts/${postId}/`, { token }),
  rate: (id: string, postId: string, voter: string, score: number, name?: string) =>
    call("PUT", `${id}/posts/${postId}/rating/`, { voter, score, name }),
  unrate: (id: string, postId: string, voter: string) => call("DELETE", `${id}/posts/${postId}/rating/`, { voter }),
};

export const photoUrl = (id: string, postId: string) => `/api/board/${id}/posts/${postId}/photo/`;
