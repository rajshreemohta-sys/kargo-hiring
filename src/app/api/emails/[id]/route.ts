import { maybeOne } from "@/lib/db";
import { fail, handle, ok } from "@/lib/http";

// Edit a draft before it goes out. Sent emails can't be changed.
export const PATCH = handle(async (request: Request, ctx: RouteContext<"/api/emails/[id]">) => {
  const { id } = await ctx.params;
  const { subject, body } = (await request.json()) as { subject?: string; body?: string };
  if (!subject?.trim() || !body?.trim()) return fail("Subject and message can't be empty.");
  const data = await maybeOne(
    `update emails set subject = $2, body = $3, updated_at = now()
     where id = $1 and status in ('draft', 'failed') returning id`,
    [id, subject.trim(), body.trim()],
  );
  if (!data) return fail("This email has already been sent.", 409);
  return ok();
});
