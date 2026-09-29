import { fail, handle } from "@/lib/http";
import { getCv } from "@/lib/storage";

// Sends the original CV, only to signed-in team members.
export const GET = handle(async (_req: Request, ctx: RouteContext<"/api/candidates/[id]/cv">) => {
  const { id } = await ctx.params;
  const file = await getCv(id);
  if (!file) return fail("No original file for this candidate.", 404);
  return new Response(new Uint8Array(file.data), {
    headers: {
      "Content-Type": file.contentType,
      "Content-Disposition": `inline; filename="${file.filename.replace(/[^\w.-]+/g, "_")}"`,
      "Cache-Control": "private, no-store",
    },
  });
});
