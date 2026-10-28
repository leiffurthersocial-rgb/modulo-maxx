import { ratePost, unratePost } from "@/lib/server/board";
import { body, handle } from "@/lib/server/route";

export async function PUT(req: Request, ctx: RouteContext<"/api/board/[id]/posts/[post]/rating">) {
  const { id, post } = await ctx.params;
  return handle(async (store) => ratePost(store, id, post, await body(req)));
}

export async function DELETE(req: Request, ctx: RouteContext<"/api/board/[id]/posts/[post]/rating">) {
  const { id, post } = await ctx.params;
  return handle(async (store) => unratePost(store, id, post, (await body(req)).voter));
}
