import { handle, ok } from "@/lib/http";
import { evaluateCandidate } from "@/lib/pipeline";

export const maxDuration = 300;

// Score the redacted CV for both roles, decide, and draft/send the email.
export const POST = handle(async (_req: Request, ctx: RouteContext<"/api/candidates/[id]/evaluate">) => {
  const { id } = await ctx.params;
  const candidate = await evaluateCandidate(id);
  return ok({ status: candidate.status, decision: candidate.decision, decision_role: candidate.decision_role });
});
