// Key-value store for group boards. On Vercel this is Upstash Redis (Vercel dashboard → Storage →
// Upstash for Redis → connect to the project), reached over its REST API with plain fetch. The
// integration sets KV_REST_API_URL / KV_REST_API_TOKEN (or UPSTASH_REDIS_REST_URL / _TOKEN).
// Without them, `next dev` and tests use an in-memory store; a production build refuses to run
// without a database so posts can't silently vanish.

export interface Store {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  del(...keys: string[]): Promise<void>;
  hget(key: string, field: string): Promise<string | null>;
  hset(key: string, field: string, value: string): Promise<void>;
  hdel(key: string, field: string): Promise<void>;
  hgetall(key: string): Promise<Record<string, string>>;
  /** HGETALL for several keys in one round trip. */
  hgetallMany(keys: string[]): Promise<Record<string, string>[]>;
}

type Cmd = (string | number)[];

class UpstashStore implements Store {
  constructor(
    private url: string,
    private token: string,
  ) {}

  private async pipeline(cmds: Cmd[]): Promise<unknown[]> {
    if (!cmds.length) return [];
    const res = await fetch(`${this.url.replace(/\/$/, "")}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(cmds),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Redis ${res.status}: ${await res.text()}`);
    const out = (await res.json()) as { result?: unknown; error?: string }[];
    return out.map((r) => {
      if (r.error) throw new Error(`Redis: ${r.error}`);
      return r.result;
    });
  }

  private async one(cmd: Cmd) {
    return (await this.pipeline([cmd]))[0];
  }

  /** Upstash returns HGETALL as a flat [field, value, ...] list. */
  private static pairs(flat: unknown): Record<string, string> {
    const out: Record<string, string> = {};
    const list = (flat as string[] | null) ?? [];
    for (let i = 0; i + 1 < list.length; i += 2) out[list[i]] = list[i + 1];
    return out;
  }

  async get(key: string) {
    return (await this.one(["GET", key])) as string | null;
  }
  async set(key: string, value: string) {
    await this.one(["SET", key, value]);
  }
  async del(...keys: string[]) {
    if (keys.length) await this.one(["DEL", ...keys]);
  }
  async hget(key: string, field: string) {
    return (await this.one(["HGET", key, field])) as string | null;
  }
  async hset(key: string, field: string, value: string) {
    await this.one(["HSET", key, field, value]);
  }
  async hdel(key: string, field: string) {
    await this.one(["HDEL", key, field]);
  }
  async hgetall(key: string) {
    return UpstashStore.pairs(await this.one(["HGETALL", key]));
  }
  async hgetallMany(keys: string[]) {
    return (await this.pipeline(keys.map((k) => ["HGETALL", k]))).map(UpstashStore.pairs);
  }
}

export class MemoryStore implements Store {
  private strings = new Map<string, string>();
  private hashes = new Map<string, Map<string, string>>();

  async get(key: string) {
    return this.strings.get(key) ?? null;
  }
  async set(key: string, value: string) {
    this.strings.set(key, value);
  }
  async del(...keys: string[]) {
    for (const k of keys) {
      this.strings.delete(k);
      this.hashes.delete(k);
    }
  }
  async hget(key: string, field: string) {
    return this.hashes.get(key)?.get(field) ?? null;
  }
  async hset(key: string, field: string, value: string) {
    if (!this.hashes.has(key)) this.hashes.set(key, new Map());
    this.hashes.get(key)!.set(field, value);
  }
  async hdel(key: string, field: string) {
    this.hashes.get(key)?.delete(field);
  }
  async hgetall(key: string) {
    return Object.fromEntries(this.hashes.get(key) ?? []);
  }
  async hgetallMany(keys: string[]) {
    return Promise.all(keys.map((k) => this.hgetall(k)));
  }
}

// On globalThis: in dev each route is bundled separately, and they must share one memory store.
const g = globalThis as { __boardStore?: Store };

/** The store, or null when no database is connected in production. */
export function getStore(): Store | null {
  if (g.__boardStore) return g.__boardStore;
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) g.__boardStore = new UpstashStore(url, token);
  else if (process.env.NODE_ENV !== "production" || process.env.BOARD_MEMORY_STORE === "1") g.__boardStore = new MemoryStore();
  return g.__boardStore ?? null;
}
