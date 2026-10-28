import { deletePost } from "@/lib/server/board";
import { body, handle } from "@/lib/server/route";

export async function DELETE(req: Request, ctx: RouteContext<"/api/board/[id]/posts/[post]">) {
  const { id, post } = await ctx.params;
  return handle(async (store) => deletePost(store, id, post, (await body(req)).token));
}
