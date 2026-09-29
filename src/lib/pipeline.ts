import "server-only";
import { evaluateCv, MODEL } from "./ai/evaluate";
import { getSettings, maybeOne, one, query, type Candidate, type CandidatePii, type Email } from "./db";
import { sendEmail } from "./email/send";
import { inviteDraft, rejectionDraft } from "./email/templates";
import { findLeaks, identityTokens, redact } from "./privacy/redact";
import { putCv } from "./storage";
import { ROLES, type Role } from "./rubric";
import { decide, scoreRole, type Band } from "./scoring";

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

  const r = redact(rawText, { filename: input.file?.name });

  // The same person uploaded twice: same email and same name. (Shared or placeholder
  // addresses on different people's CVs are not duplicates.)
  if (r.pii.email && r.pii.fullName) {
    const existing = await maybeOne<{ candidate_id: string }>(
      "select candidate_id from candidate_pii where lower(email) = lower($1) and lower(full_name) = lower($2) limit 1",
      [r.pii.email, r.pii.fullName],
    );
    if (existing) return { id: existing.candidate_id, duplicateOf: existing.candidate_id };
  }

  const problem = privacyProblem(r.pii, r.leaks);
  const { id } = await one<{ id: string }>(
    `insert into candidates (applied_role, redacted_cv, redactions, status, error)
     values ($1, $2, $3, $4, $5) returning id`,
    [input.appliedRole, r.redacted, JSON.stringify(r.counts), problem ? "error" : "pending", problem],
  );

  let storedFilename: string | null = null;
  if (input.file) {
    try {
      await putCv(id, input.file);
      storedFilename = input.file.name;
    } catch (e) {
      console.error("Storing the CV file failed", e); // keep going: the text is what matters
    }
  }

  await query(
    `insert into candidate_pii (candidate_id, full_name, email, phone, links, other, raw_text, cv_filename)
     values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [id, r.pii.fullName, r.pii.email, r.pii.phone, r.pii.links, JSON.stringify(r.pii.other), rawText, storedFilename],
  );
  return { id };
}

/** Stage 2: score the redacted CV for both roles, decide, draft emails and (optionally) send them. */
export async function evaluateCandidate(id: string): Promise<Candidate> {
  // Claim the candidate atomically. A run stuck in "evaluating" for over 6 minutes died with
  // its function, so it may be retried.
  const c = await maybeOne<Candidate>(
    `update candidates set status = 'evaluating', error = null, updated_at = now()
     where id = $1 and (status <> 'evaluating' or updated_at < now() - interval '6 minutes')
     returning *`,
    [id],
  );
  if (!c) throw new Error("This candidate is already being evaluated.");

  try {
    // Last check before anything leaves the server: the redacted text must not contain the
    // name, email or phone we hold for this person.
    // Name detection is re-run on the original text, so a wrong guess stored earlier can't slip through.
    const pii = await maybeOne<Pick<CandidatePii, "full_name" | "raw_text" | "cv_filename">>(
      "select full_name, raw_text, cv_filename from candidate_pii where candidate_id = $1",
      [id],
    );
    const nameParts = pii ? identityTokens(pii.raw_text, pii.full_name, pii.cv_filename) : [];
    const problem = privacyProblem({ fullName: pii?.full_name ?? null }, findLeaks(c.redacted_cv, nameParts));
    if (problem) throw new Error(problem);

    const out = await evaluateCv(c.redacted_cv, c.applied_role);
    const scores = ROLES.map((role) => scoreRole(role, out.judgements[role].criteria, out.judgements[role].summary, c.redacted_cv));

    for (const s of scores) {
      await query(
        `insert into evaluations (candidate_id, role, total, criteria, summary, model)
         values ($1, $2, $3, $4, $5, $6)
         on conflict (candidate_id, role) do update
           set total = excluded.total, criteria = excluded.criteria, summary = excluded.summary,
               model = excluded.model, created_at = now()`,
        [id, s.role, s.total, JSON.stringify(s.criteria), s.summary, out.model || MODEL],
      );
    }
    await query("update candidates set interview_brief = $2, status = 'evaluated', updated_at = now() where id = $1", [
      id,
      JSON.stringify(out.brief),
    ]);

    // A decision the team already made by hand, or one that's been emailed, stands.
    const sent = await query("select id from emails where candidate_id = $1 and status = 'sent'", [id]);
    if (c.decision_source !== "manual" && !sent.length) {
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
    await query("update candidates set status = 'error', error = $2, updated_at = now() where id = $1", [id, message]);
    throw e;
  }
  return one<Candidate>("select * from candidates where id = $1", [id]);
}

/**
 * Records a decision and prepares the matching email. Auto decisions are sent straight away
 * when auto-send is on; manual decisions leave a draft for the team to review and send.
 */
export async function applyDecision(id: string, decision: Band, role: Role, source: "auto" | "manual") {
  const sent = await query("select id from emails where candidate_id = $1 and status in ('sent', 'sending')", [id]);
  if (sent.length) throw new Error("An email has already gone to this candidate, so the decision is locked.");

  await one(
    `update candidates set decision = $2, decision_role = $3, decision_source = $4, updated_at = now()
     where id = $1 returning id`,
    [id, decision, role, source],
  );
  const email = await redraft(id);
  if (email && source === "auto") {
    const settings = await getSettings();
    if (settings.auto_send) await sendEmail(email.id).catch(() => {}); // failure is recorded on the email row
  }
}

/** (Re)writes the unsent draft for the candidate's current decision. Returns it, or null for "review". */
export async function redraft(id: string): Promise<Email | null> {
  const c = await one<Candidate>("select * from candidates where id = $1", [id]);
  const pii = await one<Pick<CandidatePii, "full_name">>("select full_name from candidate_pii where candidate_id = $1", [id]);
  const settings = await getSettings();

  await query("delete from emails where candidate_id = $1 and status in ('draft', 'failed')", [id]);
  if (c.decision !== "shortlisted" && c.decision !== "rejected") return null;

  const role = c.decision_role ?? c.applied_role;
  const draft =
    c.decision === "rejected"
      ? rejectionDraft({ name: pii.full_name, appliedRole: c.applied_role, settings })
      : inviteDraft({
          name: pii.full_name,
          appliedRole: c.applied_role,
          inviteRole: role,
          brief: c.interview_brief?.[role] ?? [],
          settings,
        });

  return one<Email>(
    "insert into emails (candidate_id, kind, subject, body) values ($1, $2, $3, $4) returning *",
    [id, c.decision === "rejected" ? "rejection" : "invite", draft.subject, draft.body],
  );
}

/** Updates the private contact details. A corrected name re-runs redaction on the original text. */
export async function updateContact(id: string, patch: { full_name?: string; email?: string; phone?: string }) {
  const pii = await one<CandidatePii>("select * from candidate_pii where candidate_id = $1", [id]);
  const next = {
    full_name: patch.full_name?.trim() || pii.full_name,
    email: patch.email?.trim() || pii.email,
    phone: patch.phone?.trim() || pii.phone,
  };
  await query("update candidate_pii set full_name = $2, email = $3, phone = $4 where candidate_id = $1", [
    id,
    next.full_name,
    next.email,
    next.phone,
  ]);

  if (next.full_name !== pii.full_name) {
    const r = redact(pii.raw_text, { fullName: next.full_name, filename: pii.cv_filename });
    const problem = privacyProblem(r.pii, r.leaks);
    await query(
      `update candidates
       set redacted_cv = $2, redactions = $3, error = $4,
           status = case when $4::text is not null then 'error' when status = 'error' then 'pending' else status end,
           updated_at = now()
       where id = $1`,
      [id, r.redacted, JSON.stringify(r.counts), problem],
    );
  }
  const drafts = await query("select id from emails where candidate_id = $1 and status in ('draft', 'failed')", [id]);
  if (drafts.length) await redraft(id);
}

/**
 * After the cut-offs change, re-sort candidates the app decided on its own who haven't been
 * emailed yet. Team decisions and anyone already emailed are left alone.
 */
export async function reapplyThresholds(): Promise<number> {
  const settings = await getSettings();
  const rows = await query<{ id: string; applied_role: Role; decision: Band; decision_role: Role; pm: number; spm: number }>(
    `select c.id, c.applied_role, c.decision, c.decision_role,
       (select total from evaluations e where e.candidate_id = c.id and e.role = 'pm') as pm,
       (select total from evaluations e where e.candidate_id = c.id and e.role = 'spm') as spm
     from candidates c
     where c.status = 'evaluated' and c.decision_source = 'auto'
       and not exists (select 1 from emails m where m.candidate_id = c.id and m.status in ('sent', 'sending'))`,
  );
  let changed = 0;
  for (const r of rows) {
    const d = decide(r.applied_role, { pm: r.pm, spm: r.spm }, { shortlist: settings.shortlist_threshold, reject: settings.reject_threshold });
    if (d.decision === r.decision && d.role === r.decision_role) continue;
    await applyDecision(r.id, d.decision, d.role, "auto");
    changed++;
  }
  return changed;
}
