import { NextResponse } from "next/server";
import { CV_BUCKET, db } from "@/lib/db";
import { fail, handle } from "@/lib/http";

// Short-lived link to the original CV file in private storage.
export const GET = handle(async (_req: Request, ctx: RouteContext<"/api/candidates/[id]/cv">) => {
  const { id } = await ctx.params;
  const { data: pii } = await db().from("candidate_pii").select("cv_path").eq("candidate_id", id).maybeSingle();
  if (!pii?.cv_path) return fail("No original file for this candidate.", 404);
  const { data, error } = await db().storage.from(CV_BUCKET).createSignedUrl(pii.cv_path, 60);
  if (error || !data) return fail("Couldn't open the file.", 500);
  return NextResponse.redirect(data.signedUrl);
});
