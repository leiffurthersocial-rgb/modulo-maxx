// Group board storage. Nobody logs in: whoever makes a board gets an admin token, whoever posts gets
// a delete token for that post, and every device has a random voter id (all kept in the browser).
// Only hashes of those are stored, and voter ids are never sent back out, so nobody can delete or
// overwrite someone else's post or rating by reading the board.
//
// Keys (prefix mm:b:<board>):
//   (string)            board meta JSON
//   :posts  (hash)      post id → post JSON
//   :r:<post> (hash)    sha256(voter) → rating JSON
//   :p:<post> (string)  photo data URL

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import {
  BOARD_NAME_MAX,
  cleanName,
  MAX_POSTS,
  PHOTO_MAX_CHARS,
  validScore,
  type BoardRating,
  type BoardView,
} from "../board";
import type { Store } from "./store";

export class BoardError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

interface Meta {
  id: string;
  name: string;
  anon: boolean;
  createdAt: number;
  admin: string;
}
interface StoredPost {
  id: string;
  name: string;
  hasPhoto: boolean;
  createdAt: number;
  owner: string;
  /** Hash of the poster's voter id, so they can't rate themselves. */
  voter: string;
}
type StoredRating = Omit<BoardRating, "mine">;

const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
function newId(len: number) {
  const bytes = randomBytes(len);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}
const newToken = () => randomBytes(24).toString("base64url");
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
function sameHash(token: unknown, h: string) {
  if (typeof token !== "string" || !token) return false;
  return timingSafeEqual(Buffer.from(hash(token)), Buffer.from(h));
}

const ID_RE = /^[a-z0-9]{4,16}$/;
const key = (id: string) => `mm:b:${id}`;

async function meta(store: Store, id: string): Promise<Meta> {
  if (!ID_RE.test(id)) throw new BoardError(404, "No board with that code.");
  const raw = await store.get(key(id));
  if (!raw) throw new BoardError(404, "No board with that code. It may have been deleted.");
  return JSON.parse(raw);
}

async function posts(store: Store, id: string): Promise<StoredPost[]> {
  return Object.values(await store.hgetall(`${key(id)}:posts`)).map((p) => JSON.parse(p));
}

async function post(store: Store, id: string, postId: string): Promise<StoredPost> {
  const raw = ID_RE.test(postId) ? await store.hget(`${key(id)}:posts`, postId) : null;
  if (!raw) throw new BoardError(404, "That post is gone.");
  return JSON.parse(raw);
}

function voterHash(voter: unknown) {
  if (typeof voter !== "string" || voter.length < 16 || voter.length > 64) throw new BoardError(400, "Missing device id.");
  return hash(voter);
}

export async function createBoard(store: Store, input: { name?: unknown; anon?: unknown }) {
  const name = cleanName(input.name, BOARD_NAME_MAX);
  if (!name) throw new BoardError(400, "Give the board a name.");
  const adminToken = newToken();
  const m: Meta = { id: newId(8), name, anon: input.anon === true, createdAt: Date.now(), admin: hash(adminToken) };
  await store.set(key(m.id), JSON.stringify(m));
  return { id: m.id, adminToken };
}

export async function getBoard(store: Store, id: string, voter?: string | null): Promise<BoardView> {
  const m = await meta(store, id);
  const list = (await posts(store, id)).sort((a, b) => a.createdAt - b.createdAt);
  const ratings = await store.hgetallMany(list.map((p) => `${key(id)}:r:${p.id}`));
  const me = voter ? hash(voter) : null;
  return {
    id: m.id,
    name: m.name,
    anon: m.anon,
    createdAt: m.createdAt,
    posts: list.map((p, i) => ({
      id: p.id,
      name: p.name,
      hasPhoto: p.hasPhoto,
      createdAt: p.createdAt,
      mine: p.voter === me || undefined,
      ratings: Object.entries(ratings[i])
        .map(([v, raw]) => {
          const r = JSON.parse(raw) as StoredRating;
          return { score: r.score, ...(m.anon || !r.name ? {} : { name: r.name }), at: r.at, ...(v === me ? { mine: true } : {}) };
        })
        .sort((a, b) => a.at - b.at),
    })),
  };
}

export async function updateBoard(store: Store, id: string, input: { adminToken?: unknown; anon?: unknown; name?: unknown }) {
  const m = await meta(store, id);
  if (!sameHash(input.adminToken, m.admin)) throw new BoardError(403, "Only the board's creator can change that.");
  if (typeof input.anon === "boolean") m.anon = input.anon;
  if (input.name !== undefined) m.name = cleanName(input.name, BOARD_NAME_MAX) || m.name;
  await store.set(key(id), JSON.stringify(m));
}

export async function deleteBoard(store: Store, id: string, adminToken: unknown) {
  const m = await meta(store, id);
  if (!sameHash(adminToken, m.admin)) throw new BoardError(403, "Only the board's creator can delete it.");
  const ids = (await posts(store, id)).map((p) => p.id);
  await store.del(key(id), `${key(id)}:posts`, ...ids.flatMap((p) => [`${key(id)}:r:${p}`, `${key(id)}:p:${p}`]));
}

export async function addPost(store: Store, id: string, input: { name?: unknown; photo?: unknown; voter?: unknown }) {
  await meta(store, id);
  const name = cleanName(input.name);
  if (!name) throw new BoardError(400, "Add a name.");
  const voter = voterHash(input.voter);
  let photo: string | null = null;
  if (input.photo != null && input.photo !== "") {
    if (typeof input.photo !== "string" || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(input.photo))
      throw new BoardError(400, "That photo didn't work. Try another one.");
    if (input.photo.length > PHOTO_MAX_CHARS) throw new BoardError(413, "Photo too big.");
    photo = input.photo;
  }
  const existing = await posts(store, id);
  if (existing.length >= MAX_POSTS) throw new BoardError(409, `This board is full (${MAX_POSTS} posts).`);
  const ownerToken = newToken();
  const p: StoredPost = { id: newId(10), name, hasPhoto: !!photo, createdAt: Date.now(), owner: hash(ownerToken), voter };
  if (photo) await store.set(`${key(id)}:p:${p.id}`, photo);
  await store.hset(`${key(id)}:posts`, p.id, JSON.stringify(p));
  return { postId: p.id, ownerToken };
}

/** The poster (with their token) or the board's creator can delete a post. */
export async function deletePost(store: Store, id: string, postId: string, token: unknown) {
  const m = await meta(store, id);
  const p = await post(store, id, postId);
  if (!sameHash(token, p.owner) && !sameHash(token, m.admin)) throw new BoardError(403, "Only whoever posted it, or the board's creator, can delete this.");
  await store.hdel(`${key(id)}:posts`, postId);
  await store.del(`${key(id)}:r:${postId}`, `${key(id)}:p:${postId}`);
}

/** One rating per device per post; rating again replaces it. */
export async function ratePost(store: Store, id: string, postId: string, input: { voter?: unknown; score?: unknown; name?: unknown }) {
  const m = await meta(store, id);
  const p = await post(store, id, postId);
  const v = voterHash(input.voter);
  if (v === p.voter) throw new BoardError(403, "You can't rate your own post.");
  if (!validScore(input.score)) throw new BoardError(400, "Ratings go from 1 to 10 in half points.");
  const name = cleanName(input.name);
  if (!m.anon && !name) throw new BoardError(400, "This board shows who rated. Add your name first.");
  const r: StoredRating = { score: input.score, at: Date.now(), ...(m.anon ? {} : { name }) };
  await store.hset(`${key(id)}:r:${postId}`, v, JSON.stringify(r));
}

export async function unratePost(store: Store, id: string, postId: string, voter: unknown) {
  await meta(store, id);
  await post(store, id, postId);
  await store.hdel(`${key(id)}:r:${postId}`, voterHash(voter));
}

export async function getPhoto(store: Store, id: string, postId: string): Promise<{ type: string; bytes: Buffer }> {
  if (!ID_RE.test(id) || !ID_RE.test(postId)) throw new BoardError(404, "No photo.");
  const raw = await store.get(`${key(id)}:p:${postId}`);
  const m = raw?.match(/^data:(image\/[a-z]+);base64,(.*)$/);
  if (!m) throw new BoardError(404, "No photo.");
  return { type: m[1], bytes: Buffer.from(m[2], "base64") };
}
