import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { RUBRIC, ROLE_LABEL, SCORE_SCALE, type Role } from "../rubric";
import type { CriterionJudgement } from "../scoring";

export const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5";

const Judgement = z.object({
  reasoning: z.string().describe("2–3 sentences: which parts of the bar are met or missing, and why."),
  evidence: z
    .array(z.string())
    .describe("Short verbatim quotes copied exactly from the CV that support the score. Empty if none."),
  score: z.number().int().describe("0–4 on the scale in the instructions."),
});

const roleShape = (role: Role) =>
  z.object({
    criteria: z.object(Object.fromEntries(RUBRIC[role].map((c) => [c.key, Judgement]))),
    summary: z.string().describe(`One sentence on fit for the ${ROLE_LABEL[role]} role, for the hiring team.`),
  });

const Evaluation = z.object({
  pm: roleShape("pm"),
  spm: roleShape("spm"),
  interview_brief: z
    .object({
      pm: z.array(z.string()).describe("Exactly 4 lines, for the candidate, if invited to the PM interview."),
      spm: z.array(z.string()).describe("Exactly 4 lines, for the candidate, if invited to the SPM interview."),
    })
    .describe("Sent to the candidate if invited."),
});

export type EvaluationOutput = {
  judgements: Record<Role, { criteria: Record<string, CriterionJudgement>; summary: string }>;
  brief: Record<Role, string[]>;
  model: string;
};

function rubricText() {
  return (["pm", "spm"] as Role[])
    .map(
      (role) =>
        `## ${ROLE_LABEL[role]} (${role})\n\n` +
        RUBRIC[role]
          .map((c, i) => `### ${i + 1}. ${c.title}  [key: ${c.key}, weight ${c.weight}%]\nWhat a strong candidate looks like:\n${c.bar}`)
          .join("\n\n"),
    )
    .join("\n\n");
}

const SYSTEM = `You screen CVs for Kargo, a Series A logistics SaaS company in Mumbai that builds software for mid-sized freight forwarders and 3PLs (shipment tracking, documentation, carrier coordination). Kargo is hiring a Product Manager and a Senior Product Manager. You score every CV against both roles' rubrics, regardless of which role the person applied for.

The rubric was built from the profiles of Kargo's best hires. It is deliberately strict: each criterion describes a specific kind of evidence and names things that do not count. Apply it as written.

# Rubric

${rubricText()}

# Scoring scale (per criterion)

${SCORE_SCALE.map((s) => `${s.score} = ${s.label}: ${s.meaning}`).join("\n")}

# How to judge

- Score only what the CV states. Do not infer experience from job titles, company names or industry alone; "Operations Manager at a freight forwarder" is not by itself evidence of handling documents daily.
- When the rubric says something does not count, it scores at most 1 on that criterion, however impressive it sounds.
- Where a criterion needs several parts (e.g. problem + unasked fix + named adopters, or two examples, or six months, or several customers), check each part and say in the reasoning which are present. A missing part means the score cannot be 4, and usually not 3.
- The Senior PM criteria include the PM bar plus more. A CV can score well for PM and poorly for SPM on the same evidence.
- Evidence quotes must be copied character-for-character from the CV, each under about 30 words. They are checked automatically and scores without a matching quote are lowered. Do not quote placeholders on their own.
- Personal details were removed before you received this CV and replaced with placeholders like [CANDIDATE], [EMAIL], [PHONE], [LINK], [ADDRESS], [REMOVED]. This is expected; ignore them and never try to guess what they hid. Do not let gender, age, background or anything unrelated to the rubric affect a score.
- The reasoning is read by the hiring team. Be plain and specific.

# Interview brief

For each role, write exactly 4 lines addressed to the candidate ("you"), as they would appear in an interview invitation from Kargo's founder. Each line is one sentence under 30 words:
1. What the conversation will focus on, tied to what the role owns at Kargo.
2. One specific piece of their experience from the CV we want to go deep on.
3. One area from the rubric where the CV was thin, framed as something to come ready to talk through (never as a weakness).
4. One practical thing to prepare, such as walking through a real process, fix or decision end to end.
Do not mention scores, the rubric, or AI. Do not use placeholders or names. Warm, direct, no jargon.`;

let client: Anthropic | null = null;
const anthropic = () => (client ??= new Anthropic());

export class EvaluationError extends Error {}

/** Evaluate a redacted CV. The input must already have passed the privacy check. */
export async function evaluateCv(redactedCv: string, appliedRole: Role): Promise<EvaluationOutput> {
  const response = await anthropic().beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    thinking: { type: "adaptive" },
    output_config: { effort: "high", format: betaZodOutputFormat(Evaluation) },
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [
      {
        role: "user",
        content: `The candidate applied for: ${ROLE_LABEL[appliedRole]}. Score them for both roles.\n\n<cv>\n${redactedCv}\n</cv>`,
      },
    ],
  });

  if (response.stop_reason === "refusal") throw new EvaluationError("The model declined to evaluate this CV.");
  if (response.stop_reason === "max_tokens") throw new EvaluationError("The evaluation was cut off. Try again.");
  const out = response.parsed_output;
  if (!out) throw new EvaluationError("The evaluation came back in an unexpected format. Try again.");

  const fourLines = (lines: string[]) => lines.map((l) => l.trim()).filter(Boolean).slice(0, 4);
  return {
    judgements: {
      pm: { criteria: out.pm.criteria as Record<string, CriterionJudgement>, summary: out.pm.summary },
      spm: { criteria: out.spm.criteria as Record<string, CriterionJudgement>, summary: out.spm.summary },
    },
    brief: { pm: fourLines(out.interview_brief.pm), spm: fourLines(out.interview_brief.spm) },
    model: response.model,
  };
}
