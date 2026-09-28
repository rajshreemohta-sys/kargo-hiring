import "server-only";
import { Resend } from "resend";
import { db, type Email } from "../db";
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

  const { data: claimed, error } = await db()
    .from("emails")
    .update({ status: "sending", error: null, updated_at: new Date().toISOString() })
    .eq("id", emailId)
    .in("status", ["draft", "failed"])
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!claimed) throw new Error("This email has already been sent or is being sent.");
  const email = claimed as Email;

  // The only place the candidate's contact details meet the email: fetched here, at send time.
  const { data: pii } = await db()
    .from("candidate_pii")
    .select("email")
    .eq("candidate_id", email.candidate_id)
    .single();

  const fail = async (message: string) => {
    await db().from("emails").update({ status: "failed", error: message, updated_at: new Date().toISOString() }).eq("id", emailId);
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

  const { data: sent } = await db()
    .from("emails")
    .update({ status: "sent", resend_id: data.id, sent_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", emailId)
    .select("*")
    .single();
  return sent as Email;
}
