import { getPhoto } from "@/lib/server/board";
import { handle } from "@/lib/server/route";

export async function GET(_req: Request, ctx: RouteContext<"/api/board/[id]/posts/[post]/photo">) {
  const { id, post } = await ctx.params;
  return handle(async (store) => {
    const { type, bytes } = await getPhoto(store, id, post);
    // A post's photo never changes (a new photo is a new post), so it can be cached for good.
    return new Response(new Uint8Array(bytes), {
      headers: { "Content-Type": type, "Cache-Control": "private, max-age=31536000, immutable" },
    });
  });
}
