"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ROLE_SHORT, type Role } from "@/lib/rubric";
import type { Band } from "@/lib/scoring";
import { api } from "./run";

export function DecisionPanel(props: { id: string; decision: Band | null; role: Role; locked: boolean; scores: Record<Role, number> }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function set(decision: Band, role: Role) {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/candidates/${props.id}`, { method: "PATCH", body: JSON.stringify({ action: "decision", decision, role }) });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    }
    setBusy(false);
  }

  const is = (d: Band, r?: Role) => props.decision === d && (!r || props.role === r);
  const option = (active: boolean) =>
    `flex w-full items-center justify-between rounded-lg border px-3 py-2 text-sm ${active ? "border-ink bg-ink text-white" : "border-line hover:bg-soft"}`;

  return (
    <section className="card p-5">
      <h2 className="font-semibold">Decision</h2>
      <p className="mt-1 text-sm text-muted">
        {props.locked ? "Locked: an email has already gone out." : "Change it if you disagree. A new draft will be prepared for you to send."}
      </p>
      <div className="mt-4 space-y-2">
        {(["pm", "spm"] as Role[]).map((r) => (
          <button key={r} className={option(is("shortlisted", r))} disabled={busy || props.locked} onClick={() => set("shortlisted", r)}>
            <span>Shortlist for {ROLE_SHORT[r]}</span>
            <span className="tabular-nums opacity-60">{Math.round(props.scores[r])}</span>
          </button>
        ))}
        <button className={option(is("review"))} disabled={busy || props.locked} onClick={() => set("review", props.role)}>
          Hold for review
        </button>
        <button className={option(is("rejected"))} disabled={busy || props.locked} onClick={() => set("rejected", props.role)}>
          Reject
        </button>
      </div>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </section>
  );
}
