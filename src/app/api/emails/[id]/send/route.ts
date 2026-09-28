import { sendEmail } from "@/lib/email/send";
import { handle, ok } from "@/lib/http";

export const POST = handle(async (_req: Request, ctx: RouteContext<"/api/emails/[id]/send">) => {
  const { id } = await ctx.params;
  return ok(await sendEmail(id));
});
