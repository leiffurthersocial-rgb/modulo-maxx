import { deleteBoard, getBoard, updateBoard } from "@/lib/server/board";
import { body, handle } from "@/lib/server/route";

export async function GET(req: Request, ctx: RouteContext<"/api/board/[id]">) {
  const { id } = await ctx.params;
  return handle((store) => getBoard(store, id, new URL(req.url).searchParams.get("voter")));
}

export async function PATCH(req: Request, ctx: RouteContext<"/api/board/[id]">) {
  const { id } = await ctx.params;
  return handle(async (store) => updateBoard(store, id, await body(req)));
}

export async function DELETE(req: Request, ctx: RouteContext<"/api/board/[id]">) {
  const { id } = await ctx.params;
  return handle(async (store) => deleteBoard(store, id, (await body(req)).adminToken));
}
