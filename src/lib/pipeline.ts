import "server-only";
import { evaluateCv, MODEL } from "./ai/evaluate";
import { CV_BUCKET, db, getSettings, must, type Candidate, type CandidatePii, type Email } from "./db";
import { sendEmail } from "./email/send";
import { inviteDraft, rejectionDraft } from "./email/templates";
import { findLeaks, redact } from "./privacy/redact";
import { ROLES, type Role } from "./rubric";
import { decide, scoreRole, type Band } from "./scoring";

const now = () => new Date().toISOString();

function privacyProblem(pii: { fullName: string | null }, leaks: string[]): string | null {
  if (!pii.fullName) return "Couldn't find the candidate's name in the CV. Add it under Contact so it can be removed before the AI reads the CV.";
  if (leaks.length) return `Some personal details (${leaks.join(", ")}) couldn't be removed automatically. Check the contact details and try again.`;
  return null;
}

/** Stage 1: split the CV into personal details (private) and redacted text (for the AI). No AI involved. */
export async function createCandidate(input: {
  rawText: string;
  appliedRole: Role;
  file?: File;
}): Promise<{ id: string; duplicateOf?: string }> {
  const rawText = input.rawText.trim();
  if (rawText.length < 200) throw new Error("Couldn't read enough text from this CV. If it's a scan, paste the text instead.");

  const r = redact(rawText);

  if (r.pii.email) {
    const { data: existing } = await db().from("candidate_pii").select("candidate_id").ilike("email", r.pii.email).maybeSingle();
    if (existing) return { id: existing.candidate_id, duplicateOf: existing.candidate_id };
  }

  const problem = privacyProblem(r.pii, r.leaks);
  const candidate = must(
    await db()
      .from("candidates")
      .insert({
        applied_role: input.appliedRole,
        redacted_cv: r.redacted,
        redactions: r.counts,
        status: problem ? "error" : "pending",
        error: problem,
      })
      .select("id")
      .single(),
  ) as { id: string };

  let cvPath: string | null = null;
  if (input.file) {
    cvPath = `${candidate.id}/${input.file.name.replace(/[^\w.-]+/g, "_")}`;
    const { error } = await db().storage.from(CV_BUCKET).upload(cvPath, input.file, { contentType: input.file.type || undefined });
    if (error) cvPath = null; // keep going: the text is what matters, the file is a convenience
  }

  must(
    await db()
      .from("candidate_pii")
      .insert({
        candidate_id: candidate.id,
        full_name: r.pii.fullName,
        email: r.pii.email,
        phone: r.pii.phone,
        links: r.pii.links,
        other: r.pii.other,
        raw_text: rawText,
        cv_path: cvPath,
        cv_filename: input.file?.name ?? null,
      })
      .select("candidate_id")
      .single(),
  );
  return { id: candidate.id };
}

/** Stage 2: score the redacted CV for both roles, decide, draft emails and (optionally) send them. */
export async function evaluateCandidate(id: string): Promise<Candidate> {
  const current = must(await db().from("candidates").select("status, updated_at").eq("id", id).single()) as Candidate;
  // A run that's been "evaluating" for over 6 minutes died with its function; let it be retried.
  if (current.status === "evaluating" && Date.now() - Date.parse(current.updated_at) < 6 * 60_000) {
    throw new Error("This candidate is already being evaluated.");
  }
  const { data: claimed } = await db()
    .from("candidates")
    .update({ status: "evaluating", error: null, updated_at: now() })
    .eq("id", id)
    .eq("updated_at", current.updated_at)
    .select("*")
    .maybeSingle();
  if (!claimed) throw new Error("This candidate is already being evaluated.");
  const c = claimed as Candidate;

  try {
    // Last check before anything leaves the server: the redacted text must not contain the
    // name, email or phone we hold for this person.
    const { data: pii } = await db().from("candidate_pii").select("full_name").eq("candidate_id", id).single();
    const nameParts = (pii?.full_name ?? "").toLowerCase().split(/\s+/).filter((t: string) => t.length >= 2);
    const problem = privacyProblem({ fullName: pii?.full_name ?? null }, findLeaks(c.redacted_cv, nameParts));
    if (problem) throw new Error(problem);

    const out = await evaluateCv(c.redacted_cv, c.applied_role);
    const scores = ROLES.map((role) => scoreRole(role, out.judgements[role].criteria, out.judgements[role].summary, c.redacted_cv));

    must(
      await db()
        .from("evaluations")
        .upsert(
          scores.map((s) => ({
            candidate_id: id,
            role: s.role,
            total: s.total,
            criteria: s.criteria,
            summary: s.summary,
            model: out.model || MODEL,
            created_at: now(),
          })),
          { onConflict: "candidate_id,role" },
        )
        .select("id"),
    );
    await db().from("candidates").update({ interview_brief: out.brief, status: "evaluated", updated_at: now() }).eq("id", id);

    // A decision the team already made by hand, or one that's been emailed, stands.
    const { data: sent } = await db().from("emails").select("id").eq("candidate_id", id).eq("status", "sent");
    if (c.decision_source !== "manual" && !sent?.length) {
      const settings = await getSettings();
      const d = decide(
        c.applied_role,
        { pm: scores[0].total, spm: scores[1].total },
        { shortlist: settings.shortlist_threshold, reject: settings.reject_threshold },
      );
      await applyDecision(id, d.decision, d.role, "auto");
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Evaluation failed.";
    await db().from("candidates").update({ status: "error", error: message, updated_at: now() }).eq("id", id);
    throw e;
  }
  return must(await db().from("candidates").select("*").eq("id", id).single()) as Candidate;
}

/**
 * Records a decision and prepares the matching email. Auto decisions are sent straight away
 * when auto-send is on; manual decisions leave a draft for the team to review and send.
 */
export async function applyDecision(id: string, decision: Band, role: Role, source: "auto" | "manual") {
  const { data: sent } = await db().from("emails").select("kind").eq("candidate_id", id).in("status", ["sent", "sending"]);
  if (sent?.length) throw new Error("An email has already gone to this candidate, so the decision is locked.");

  must(
    await db()
      .from("candidates")
      .update({ decision, decision_role: role, decision_source: source, updated_at: now() })
      .eq("id", id)
      .select("id")
      .single(),
  );
  const email = await redraft(id);
  if (email && source === "auto") {
    const settings = await getSettings();
    if (settings.auto_send) await sendEmail(email.id).catch(() => {}); // failure is recorded on the email row
  }
}

/** (Re)writes the unsent draft for the candidate's current decision. Returns it, or null for "review". */
export async function redraft(id: string): Promise<Email | null> {
  const c = must(await db().from("candidates").select("*").eq("id", id).single()) as Candidate;
  const pii = must(await db().from("candidate_pii").select("full_name").eq("candidate_id", id).single()) as Pick<CandidatePii, "full_name">;
  const settings = await getSettings();

  await db().from("emails").delete().eq("candidate_id", id).in("status", ["draft", "failed"]);
  if (c.decision !== "shortlisted" && c.decision !== "rejected") return null;

  const draft =
    c.decision === "rejected"
      ? rejectionDraft({ name: pii.full_name, appliedRole: c.applied_role, settings })
      : inviteDraft({
          name: pii.full_name,
          appliedRole: c.applied_role,
          inviteRole: c.decision_role ?? c.applied_role,
          brief: c.interview_brief?.[c.decision_role ?? c.applied_role] ?? [],
          settings,
        });

  return must(
    await db()
      .from("emails")
      .insert({ candidate_id: id, kind: c.decision === "rejected" ? "rejection" : "invite", ...draft })
      .select("*")
      .single(),
  ) as Email;
}

/** Updates the private contact details. A corrected name re-runs redaction on the original text. */
export async function updateContact(id: string, patch: { full_name?: string; email?: string; phone?: string }) {
  const pii = must(await db().from("candidate_pii").select("*").eq("candidate_id", id).single()) as CandidatePii;
  const next = {
    full_name: patch.full_name?.trim() || pii.full_name,
    email: patch.email?.trim() || pii.email,
    phone: patch.phone?.trim() || pii.phone,
  };
  await db().from("candidate_pii").update(next).eq("candidate_id", id);

  if (next.full_name !== pii.full_name) {
    const r = redact(pii.raw_text, { fullName: next.full_name });
    const problem = privacyProblem(r.pii, r.leaks);
    const c = must(await db().from("candidates").select("status").eq("id", id).single()) as Pick<Candidate, "status">;
    await db()
      .from("candidates")
      .update({
        redacted_cv: r.redacted,
        redactions: r.counts,
        error: problem,
        status: problem ? "error" : c.status === "error" ? "pending" : c.status,
        updated_at: now(),
      })
      .eq("id", id);
  }
  const { data: draft } = await db().from("emails").select("id").eq("candidate_id", id).in("status", ["draft", "failed"]);
  if (draft?.length) await redraft(id);
}
