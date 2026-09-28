import "server-only";
import { Resend } from "resend";
import { maybeOne, one, query, type Email } from "../db";
import { toHtml } from "./templates";

let resend: Resend | null = null;

/**
 * Sends one drafted email. The row is claimed (draft/failed → sending) before calling Resend,
 * so double-clicks and concurrent auto-sends can't send the same email twice.
 */
export async function sendEmail(emailId: string): Promise<Email> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from) throw new Error("Email isn't set up yet: add RESEND_API_KEY and EMAIL_FROM.");

  const email = await maybeOne<Email>(
    `update emails set status = 'sending', error = null, updated_at = now()
     where id = $1 and status in ('draft', 'failed') returning *`,
    [emailId],
  );
  if (!email) throw new Error("This email has already been sent or is being sent.");

  // The only place the candidate's contact details meet the email: fetched here, at send time.
  const pii = await maybeOne<{ email: string | null }>("select email from candidate_pii where candidate_id = $1", [email.candidate_id]);

  const fail = async (message: string): Promise<never> => {
    await query("update emails set status = 'failed', error = $2, updated_at = now() where id = $1", [emailId, message]);
    throw new Error(message);
  };
  if (!pii?.email) return fail("No email address on file for this candidate. Add one on their page.");

  resend ??= new Resend(key);
  const { data, error: sendError } = await resend.emails.send(
    {
      from,
      to: pii.email,
      replyTo: process.env.EMAIL_REPLY_TO || undefined,
      subject: email.subject,
      text: email.body,
      html: toHtml(email.body),
    },
    { idempotencyKey: `${email.id}-${email.updated_at}` },
  );
  if (sendError || !data) return fail(sendError?.message ?? "Resend didn't accept the email.");

  return one<Email>(
    `update emails set status = 'sent', resend_id = $2, sent_at = now(), updated_at = now()
     where id = $1 returning *`,
    [emailId, data.id],
  );
}
