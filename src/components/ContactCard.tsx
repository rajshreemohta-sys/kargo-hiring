"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { CandidatePii } from "@/lib/db";
import { api } from "./run";

// The private half of the candidate record. None of this is ever sent to the AI.
export function ContactCard({ id, contact }: { id: string; contact: CandidatePii }) {
  const router = useRouter();
  const [editing, setEditing] = useState(!contact.full_name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const other = Object.entries(contact.other ?? {});

  return (
    <section className="card p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Contact</h2>
        {!editing && <button className="text-sm text-muted hover:text-ink" onClick={() => setEditing(true)}>Edit</button>}
      </div>
      <p className="mt-1 flex items-center gap-1.5 text-xs text-muted">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
        Stored separately. Never sent to the AI.
      </p>

      {editing ? (
        <form
          className="mt-4 space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            const f = new FormData(e.currentTarget);
            try {
              await api(`/api/candidates/${id}`, {
                method: "PATCH",
                body: JSON.stringify({ action: "contact", full_name: f.get("full_name"), email: f.get("email"), phone: f.get("phone") }),
              });
              setEditing(false);
              router.refresh();
            } catch (err) {
              setError(err instanceof Error ? err.message : "Failed");
            }
            setBusy(false);
          }}
        >
          {[
            ["full_name", "Full name", contact.full_name],
            ["email", "Email", contact.email],
            ["phone", "Phone", contact.phone],
          ].map(([name, label, value]) => (
            <label key={name} className="block">
              <span className="label">{label}</span>
              <input name={name!} defaultValue={value ?? ""} className="input mt-1" required={name === "full_name"} />
            </label>
          ))}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button className="btn-primary" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
            {contact.full_name && <button type="button" className="btn-ghost" onClick={() => setEditing(false)}>Cancel</button>}
          </div>
          <p className="text-xs text-muted">Changing the name re-runs redaction on the CV. Re-score afterwards if needed.</p>
        </form>
      ) : (
        <dl className="mt-4 space-y-2 text-sm">
          <Field label="Name" value={contact.full_name} />
          <Field label="Email" value={contact.email} />
          <Field label="Phone" value={contact.phone} />
          {contact.links.map((l) => (
            <Field key={l} label="Link" value={<a href={l.startsWith("http") ? l : `https://${l}`} target="_blank" rel="noreferrer" className="underline">{l}</a>} />
          ))}
          {other.map(([k, v]) => <Field key={k} label={k.replace(/_/g, " ")} value={v.join("; ")} />)}
          {contact.cv_filename && <Field label="File" value={contact.cv_filename} />}
        </dl>
      )}
    </section>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[5.5rem_1fr] gap-2">
      <dt className="capitalize text-muted">{label}</dt>
      <dd className="break-words">{value || <span className="text-muted">—</span>}</dd>
    </div>
  );
}
