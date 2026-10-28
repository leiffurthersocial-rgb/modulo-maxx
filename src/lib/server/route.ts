import { NextResponse } from "next/server";
import { BoardError } from "./board";
import { getStore, type Store } from "./store";

/** Runs a board handler: JSON in, JSON out, BoardError → its status, no database → 503. */
export async function handle(fn: (store: Store) => Promise<unknown>): Promise<Response> {
  const store = getStore();
  if (!store) return NextResponse.json({ error: "The database isn't connected yet.", setup: true }, { status: 503 });
  try {
    const out = await fn(store);
    return out instanceof Response ? out : NextResponse.json(out ?? { ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof BoardError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error(e);
    return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }
}

/** Request body as an object, or {} if it isn't JSON. */
export async function body(req: Request): Promise<Record<string, unknown>> {
  try {
    const b = await req.json();
    return b && typeof b === "object" ? b : {};
  } catch {
    return {};
  }
}
