import { addPost } from "@/lib/server/board";
import { body, handle } from "@/lib/server/route";

export async function POST(req: Request, ctx: RouteContext<"/api/board/[id]/posts">) {
  const { id } = await ctx.params;
  return handle(async (store) => addPost(store, id, await body(req)));
}
