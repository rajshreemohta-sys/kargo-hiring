"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Email } from "@/lib/db";
import { api } from "./run";

export function EmailCard({ email, to }: { email: Email; to: string | null }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [subject, setSubject] = useState(email.subject);
  const [body, setBody] = useState(email.body);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(email.status === "failed" ? email.error : null);
  const editable = email.status === "draft" || email.status === "failed";

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setEditing(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    }
    setBusy(false);
  }

  return (
    <section className="card">
      <div className="flex items-center justify-between border-b border-line px-5 py-3">
        <h2 className="font-semibold">{email.kind === "invite" ? "Interview invitation" : "Rejection email"}</h2>
        <span className={`text-xs font-medium ${email.status === "sent" ? "text-ink" : email.status === "failed" ? "text-red-600" : "text-accent"}`}>
          {email.status === "sent" ? `Sent ${new Date(email.sent_at!).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}` : email.status === "failed" ? "Not sent" : email.status === "sending" ? "Sending…" : "Draft"}
        </span>
      </div>
      <div className="space-y-3 p-5 text-sm">
        <div className="text-muted">To: <span className="text-ink">{to ?? "no email on file"}</span></div>
        {editing ? (
          <>
            <input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} />
            <textarea className="input min-h-80 leading-relaxed" value={body} onChange={(e) => setBody(e.target.value)} />
          </>
        ) : (
          <>
            <div className="font-medium">{email.subject}</div>
            <div className="max-h-96 overflow-auto whitespace-pre-wrap leading-relaxed text-neutral-700">{email.body}</div>
          </>
        )}
        {error && <p className="text-red-600">{error}</p>}
        {editable && (
          <div className="flex flex-wrap gap-2 pt-1">
            {editing ? (
              <>
                <button className="btn-primary" disabled={busy} onClick={() => run(() => api(`/api/emails/${email.id}`, { method: "PATCH", body: JSON.stringify({ subject, body }) }))}>
                  Save
                </button>
                <button className="btn-ghost" disabled={busy} onClick={() => (setEditing(false), setSubject(email.subject), setBody(email.body))}>Cancel</button>
              </>
            ) : (
              <>
                <button
                  className="btn-accent"
                  disabled={busy || !to}
                  onClick={() => confirm(`Send this email to ${to}?`) && run(() => api(`/api/emails/${email.id}/send`, { method: "POST" }))}
                >
                  {busy ? "Sending…" : email.status === "failed" ? "Try again" : "Send"}
                </button>
                <button className="btn-ghost" disabled={busy} onClick={() => setEditing(true)}>Edit</button>
              </>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
