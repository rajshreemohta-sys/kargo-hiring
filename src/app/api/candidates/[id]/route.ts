import { query } from "@/lib/db";
import { fail, handle, ok } from "@/lib/http";
import { applyDecision, updateContact } from "@/lib/pipeline";

type Body =
  | { action: "decision"; decision: "shortlisted" | "review" | "rejected"; role: "pm" | "spm" }
  | { action: "contact"; full_name?: string; email?: string; phone?: string };

export const PATCH = handle(async (request: Request, ctx: RouteContext<"/api/candidates/[id]">) => {
  const { id } = await ctx.params;
  const body = (await request.json()) as Body;
  if (body.action === "decision") {
    if (!["shortlisted", "review", "rejected"].includes(body.decision) || !["pm", "spm"].includes(body.role)) {
      return fail("Invalid decision.");
    }
    await applyDecision(id, body.decision, body.role, "manual");
    return ok();
  }
  if (body.action === "contact") {
    if (body.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) return fail("That email address doesn't look right.");
    await updateContact(id, body);
    return ok();
  }
  return fail("Unknown action.");
});

// Remove a candidate and every copy of their data, including the original file.
export const DELETE = handle(async (_req: Request, ctx: RouteContext<"/api/candidates/[id]">) => {
  const { id } = await ctx.params;
  await query("delete from candidates where id = $1", [id]); // cascades to contact details, CV file, scores, emails
  return ok();
});
