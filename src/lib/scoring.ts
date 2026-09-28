// Turns the evaluator's per-criterion judgements into scores and a decision.
// The arithmetic and the decision live here, in code, not in the model.

import { MAX_SCORE, RUBRIC, ROLES, type Role } from "./rubric";

export type CriterionJudgement = {
  score: number;
  evidence: string[];
  reasoning: string;
};

export type ScoredCriterion = CriterionJudgement & {
  key: string;
  title: string;
  weight: number;
  points: number; // weighted contribution to the 0–100 total
  unverified: string[]; // quotes the model gave that aren't in the CV
  capped: boolean; // score lowered because no quote could be found in the CV
};

export type RoleScore = { role: Role; total: number; criteria: ScoredCriterion[]; summary: string };

export type Band = "shortlisted" | "review" | "rejected";
export type Decision = { decision: Band; role: Role; crossRole: boolean };

export type Thresholds = { shortlist: number; reject: number };

const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/[‘’`´]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/[^\p{L}\p{N}%'"-]+/gu, " ")
    .trim();

/** A quote counts as found if it (or, for long quotes, most of it) appears in the CV text. */
export function quoteInText(quote: string, cvText: string): boolean {
  const normalizedCv = normalize(cvText);
  const q = normalize(quote.replace(/\.\.\.|…/g, " "));
  if (q.length < 8) return false;
  if (normalizedCv.includes(q)) return true;
  // Tolerate the model stitching two nearby fragments with an ellipsis.
  const pieces = quote.split(/\.\.\.|…/).map(normalize).filter((p) => p.length >= 12);
  return pieces.length > 1 && pieces.every((p) => normalizedCv.includes(p));
}

export function scoreRole(
  role: Role,
  judgements: Record<string, CriterionJudgement>,
  summary: string,
  cvText: string,
): RoleScore {
  const criteria = RUBRIC[role].map((c): ScoredCriterion => {
    const j = judgements[c.key] ?? { score: 0, evidence: [], reasoning: "Not assessed." };
    let score = Math.max(0, Math.min(MAX_SCORE, Math.round(Number(j.score) || 0)));
    const verified = j.evidence.filter((q) => quoteInText(q, cvText));
    const unverified = j.evidence.filter((q) => !verified.includes(q));
    // No evidence we can point to in the CV → it can't score above "weak".
    const capped = score > 1 && verified.length === 0;
    if (capped) score = 1;
    return {
      key: c.key,
      title: c.title,
      weight: c.weight,
      score,
      evidence: verified,
      unverified,
      reasoning: j.reasoning,
      capped,
      points: Math.round(((c.weight * score) / MAX_SCORE) * 10) / 10,
    };
  });
  const total = Math.round(criteria.reduce((s, c) => s + (c.weight * c.score) / MAX_SCORE, 0) * 10) / 10;
  return { role, total, criteria, summary };
}

export function band(total: number, t: Thresholds): Band {
  if (total >= t.shortlist) return "shortlisted";
  if (total < t.reject) return "rejected";
  return "review";
}

/**
 * Every CV is scored for both roles. Prefer the role they applied for; if they only clear
 * the bar for the other role, shortlist them for that one instead.
 */
export function decide(applied: Role, scores: Record<Role, number>, t: Thresholds): Decision {
  const other: Role = applied === "pm" ? "spm" : "pm";
  const bands = Object.fromEntries(ROLES.map((r) => [r, band(scores[r], t)])) as Record<Role, Band>;
  if (bands[applied] === "shortlisted") return { decision: "shortlisted", role: applied, crossRole: false };
  if (bands[other] === "shortlisted") return { decision: "shortlisted", role: other, crossRole: true };
  if (bands[applied] === "review") return { decision: "review", role: applied, crossRole: false };
  if (bands[other] === "review") return { decision: "review", role: other, crossRole: true };
  return { decision: "rejected", role: applied, crossRole: false };
}
