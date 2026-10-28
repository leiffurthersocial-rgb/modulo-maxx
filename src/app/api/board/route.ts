import { createBoard } from "@/lib/server/board";
import { body, handle } from "@/lib/server/route";

export async function POST(req: Request) {
  return handle(async (store) => createBoard(store, await body(req)));
}
