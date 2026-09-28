import { maybeOne } from "@/lib/db";
import { fail, handle } from "@/lib/http";
import { getCv } from "@/lib/storage";

// Streams the original CV from the private Blobs store, only to signed-in team members.
export const GET = handle(async (_req: Request, ctx: RouteContext<"/api/candidates/[id]/cv">) => {
  const { id } = await ctx.params;
  const pii = await maybeOne<{ cv_key: string | null }>("select cv_key from candidate_pii where candidate_id = $1", [id]);
  const file = pii?.cv_key ? await getCv(pii.cv_key) : null;
  if (!file) return fail("No original file for this candidate.", 404);
  return new Response(file.data, {
    headers: {
      "Content-Type": file.contentType,
      "Content-Disposition": `inline; filename="${file.filename.replace(/[^\w.-]+/g, "_")}"`,
      "Cache-Control": "private, no-store",
    },
  });
});
