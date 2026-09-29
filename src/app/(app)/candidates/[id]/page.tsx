import Link from "next/link";
import { notFound } from "next/navigation";
import { CandidateActions } from "@/components/CandidateActions";
import { ContactCard } from "@/components/ContactCard";
import { DecisionPanel } from "@/components/DecisionPanel";
import { EmailCard } from "@/components/EmailCard";
import { SendDraft } from "@/components/SendButtons";
import { DecisionBadge, Dots, StatusText } from "@/components/ui";
import { candidateRef, getSettings, isId, maybeOne, query, type Candidate, type CandidatePii, type Email, type Evaluation } from "@/lib/db";
import { ROLE_LABEL, ROLES, SCORE_SCALE, type Role } from "@/lib/rubric";
import { band } from "@/lib/scoring";
import { testRecipient } from "@/lib/email/send";

const REDACTION_LABEL: Record<string, string> = {
  name: "name", email: "email", phone: "phone", link: "link", address: "address", handle: "handle",
  date_of_birth: "date of birth", age: "age", gender: "gender", marital_status: "marital status",
  nationality: "nationality", religion: "religion/category", family: "family name", id_number: "ID number",
};

export default async function CandidatePage({ params }: PageProps<"/candidates/[id]">) {
  const { id } = await params;
  if (!isId(id)) notFound();
  const [candidate, contact, evaluations, emails, settings] = await Promise.all([
    maybeOne<Candidate>("select * from candidates where id = $1", [id]),
    maybeOne<CandidatePii>("select * from candidate_pii where candidate_id = $1", [id]),
    query<Evaluation>("select * from evaluations where candidate_id = $1", [id]),
    query<Email>("select * from emails where candidate_id = $1 order by created_at desc", [id]),
    getSettings(),
  ]);
  if (!candidate) notFound();
  const thresholds = { shortlist: settings.shortlist_threshold, reject: settings.reject_threshold };
  const order: Role[] = candidate.applied_role === "pm" ? ["pm", "spm"] : ["spm", "pm"];
  const locked = emails.some((e) => e.status === "sent" || e.status === "sending");
  const redactions = Object.entries(candidate.redactions ?? {}).filter(([, n]) => n > 0);

  return (
    <div className="space-y-6">
      <Link href="/" className="text-sm text-muted hover:text-ink">← All candidates</Link>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{contact?.full_name ?? "Name not found"}</h1>
            {candidate.status === "evaluated" ? (
              <DecisionBadge decision={candidate.decision} role={candidate.decision_role} />
            ) : (
              <StatusText status={candidate.status} />
            )}
          </div>
          <p className="mt-1 text-sm text-muted">
            <span className="font-mono">{candidateRef(candidate.ref_num)}</span> · Applied for {ROLE_LABEL[candidate.applied_role]}
            {candidate.decision_source === "manual" && " · Decision set by the team"}
          </p>
          {candidate.decision === "shortlisted" && candidate.decision_role && candidate.decision_role !== candidate.applied_role && (
            <p className="mt-2 inline-block rounded-md bg-accent-soft px-2.5 py-1 text-sm text-accent">
              Stronger fit for {ROLE_LABEL[candidate.decision_role]} than the role they applied for
            </p>
          )}
        </div>
        <CandidateActions id={id} canRescore={candidate.status !== "evaluating" && !locked} hasFile={!!contact?.cv_filename} />
      </div>

      <EmailStatus
        email={emails[0] ?? null}
        decision={candidate.status === "evaluated" ? candidate.decision : null}
        to={contact?.email ?? null}
        testTo={testRecipient()}
      />

      {candidate.status === "error" && candidate.error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{candidate.error}</div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {evaluations.length === 0 && (
            <div className="card p-8 text-center text-sm text-muted">Not scored yet.</div>
          )}
          {order.map((role) => {
            const e = evaluations.find((x) => x.role === role);
            if (!e) return null;
            const b = band(Number(e.total), thresholds);
            return (
              <section key={role} className="card">
                <div className="flex items-start justify-between gap-4 border-b border-line p-5">
                  <div>
                    <div className="label">{role === candidate.applied_role ? "Applied role" : "Also checked"}</div>
                    <h2 className="mt-0.5 text-lg font-semibold">{ROLE_LABEL[role]}</h2>
                    <p className="mt-1 text-sm text-muted">{e.summary}</p>
                  </div>
                  <div className="text-right">
                    <div className="text-3xl font-semibold tabular-nums">{Math.round(Number(e.total))}<span className="text-base text-muted">/100</span></div>
                    <div className="mt-1"><DecisionBadge decision={b} /></div>
                  </div>
                </div>
                <ul className="divide-y divide-line">
                  {e.criteria.map((cr) => (
                    <li key={cr.key} className="p-5">
                      <div className="flex items-start justify-between gap-4">
                        <div className="font-medium">{cr.title}</div>
                        <div className="flex shrink-0 items-center gap-3 text-sm">
                          <Dots score={cr.score} />
                          <span className="w-20 text-right tabular-nums text-muted">{cr.points} / {cr.weight}</span>
                        </div>
                      </div>
                      <p className="mt-1.5 text-sm text-neutral-700">{cr.reasoning}</p>
                      {cr.evidence.length > 0 && (
                        <ul className="mt-2 space-y-1">
                          {cr.evidence.map((q, i) => (
                            <li key={i} className="border-l-2 border-accent pl-3 text-sm text-muted">“{q}”</li>
                          ))}
                        </ul>
                      )}
                      {cr.capped && (
                        <p className="mt-2 text-xs text-accent">Score lowered to 1: the quotes given couldn&apos;t be found in the CV.</p>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}

          <details className="card group">
            <summary className="flex cursor-pointer list-none items-center justify-between p-5">
              <div>
                <h2 className="font-semibold">What the AI saw</h2>
                <p className="text-sm text-muted">
                  {redactions.length
                    ? `Removed before scoring: ${redactions.map(([k, n]) => `${n} ${REDACTION_LABEL[k] ?? k}`).join(", ")}.`
                    : "No personal details were found to remove."}
                </p>
              </div>
              <span className="text-sm text-muted group-open:hidden">Show</span>
              <span className="hidden text-sm text-muted group-open:inline">Hide</span>
            </summary>
            <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap border-t border-line bg-soft p-5 font-mono text-xs leading-relaxed">
              {candidate.redacted_cv}
            </pre>
          </details>

          <details className="card">
            <summary className="cursor-pointer list-none p-5 font-semibold">How scores work</summary>
            <div className="space-y-2 border-t border-line p-5 text-sm text-muted">
              <p>Each criterion gets 0–4, then is weighted by the rubric. Totals are out of 100.</p>
              <ul className="space-y-1">
                {SCORE_SCALE.map((s) => (
                  <li key={s.score}><span className="font-medium text-ink">{s.score} {s.label}</span> — {s.meaning}</li>
                ))}
              </ul>
              <p>
                Shortlisted at {settings.shortlist_threshold}+, rejected below {settings.reject_threshold}, anything between goes to review.
                If they only clear the bar for the other role, they&apos;re shortlisted for that one.
              </p>
            </div>
          </details>
        </div>

        <aside className="space-y-6">
          {candidate.status === "evaluated" && (
            <DecisionPanel
              id={id}
              decision={candidate.decision}
              role={candidate.decision_role ?? candidate.applied_role}
              locked={locked}
              scores={Object.fromEntries(ROLES.map((r) => [r, Number(evaluations.find((e) => e.role === r)?.total ?? 0)])) as Record<Role, number>}
            />
          )}
          {emails.map((e) => (
            <EmailCard key={e.id} email={e} to={contact?.email ?? null} testTo={testRecipient()} />
          ))}
          {contact && <ContactCard id={id} contact={contact} />}
        </aside>
      </div>
    </div>
  );
}

/** Where this candidate's email stands, with the Send button up front. */
function EmailStatus({ email, decision, to, testTo }: { email: Email | null; decision: Candidate["decision"]; to: string | null; testTo: string | null }) {
  if (!decision) return null;
  const what = email?.kind === "invite" ? "Interview invitation" : "Rejection email";
  const recipient = testTo ? `${testTo} (test mode)` : to;

  if (email?.status === "sent") {
    const when = new Date(email.sent_at!).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
    return (
      <div className="flex items-center gap-2 rounded-xl border border-line px-4 py-3 text-sm">
        <span className="h-2 w-2 rounded-full bg-ink" />
        {what} sent to {recipient} on {when}.
      </div>
    );
  }
  if (email && (email.status === "draft" || email.status === "failed")) {
    return (
      <div className="flex flex-col gap-3 rounded-xl border border-accent/30 bg-accent-soft px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
        <span>
          {email.status === "failed" ? (
            <span className="text-red-700">{what} didn&apos;t send: {email.error}</span>
          ) : (
            <>
              {what} is ready to send to {recipient ?? "this candidate (no email address on file)"}.{" "}
              <a href="#email" className="underline">Preview or edit it</a>
            </>
          )}
        </span>
        <SendDraft id={email.id} kind={email.kind} failed={email.status === "failed"} large />
      </div>
    );
  }
  if (decision === "review") {
    return (
      <div className="rounded-xl border border-line px-4 py-3 text-sm text-muted">
        No email yet. Choose Shortlist or Reject under Decision to prepare one.
      </div>
    );
  }
  return null;
}
