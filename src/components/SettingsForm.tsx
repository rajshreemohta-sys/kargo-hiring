"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Settings } from "@/lib/db";
import { api } from "./run";

export function SettingsForm({ settings }: { settings: Settings }) {
  const router = useRouter();
  const [s, setS] = useState(settings);
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [resorted, setResorted] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => (setS({ ...s, [k]: v }), setState("idle"));

  return (
    <form
      className="grid gap-6 md:grid-cols-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setState("saving");
        setError(null);
        try {
          const res = await api<{ resorted: number }>("/api/settings", { method: "PUT", body: JSON.stringify(s) });
          setResorted(res.resorted ?? 0);
          setState("saved");
          router.refresh();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Failed");
          setState("idle");
        }
      }}
    >
      <section className="card space-y-4 p-5">
        <h2 className="font-semibold">Screening</h2>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="label">Shortlist at</span>
            <input type="number" min={1} max={100} className="input mt-1" value={s.shortlist_threshold} onChange={(e) => set("shortlist_threshold", Number(e.target.value))} />
          </label>
          <label className="block">
            <span className="label">Reject below</span>
            <input type="number" min={0} max={100} className="input mt-1" value={s.reject_threshold} onChange={(e) => set("reject_threshold", Number(e.target.value))} />
          </label>
        </div>
        <p className="text-xs text-muted">
          Scores are out of 100. {s.reject_threshold}–{s.shortlist_threshold - 1} goes to review for the team to decide.
        </p>
        <label className="flex items-start gap-3 rounded-lg border border-line p-3">
          <input type="checkbox" className="mt-0.5 accent-[#f26b1d]" checked={s.auto_send} onChange={(e) => set("auto_send", e.target.checked)} />
          <span className="text-sm">
            <span className="font-medium">Send emails automatically</span>
            <span className="block text-muted">
              Shortlisted candidates get the invitation and brief, rejected candidates get the rejection, as soon as they&apos;re scored. Turn off to review every draft first.
            </span>
          </span>
        </label>
      </section>

      <section className="card space-y-4 p-5">
        <h2 className="font-semibold">Emails</h2>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="label">Signed by</span>
            <input className="input mt-1" value={s.sender_name} onChange={(e) => set("sender_name", e.target.value)} />
          </label>
          <label className="block">
            <span className="label">Title</span>
            <input className="input mt-1" value={s.sender_title} onChange={(e) => set("sender_title", e.target.value)} />
          </label>
        </div>
        <label className="block">
          <span className="label">Interview format</span>
          <input className="input mt-1" value={s.interview_format} onChange={(e) => set("interview_format", e.target.value)} />
        </label>
        <label className="block">
          <span className="label">Where</span>
          <input className="input mt-1" value={s.interview_location} onChange={(e) => set("interview_location", e.target.value)} />
        </label>
        <label className="block">
          <span className="label">Scheduling link (optional)</span>
          <input className="input mt-1" placeholder="https://cal.com/…" value={s.scheduling_link} onChange={(e) => set("scheduling_link", e.target.value)} />
          <span className="mt-1 block text-xs text-muted">Without one, candidates are asked to reply with times that suit them.</span>
        </label>
      </section>

      <div className="flex items-center gap-3 md:col-span-2">
        <button className="btn-primary" disabled={state === "saving"}>{state === "saving" ? "Saving…" : "Save settings"}</button>
        {state === "saved" && (
          <span className="text-sm text-muted">
            Saved.{resorted > 0 && ` ${resorted} candidate${resorted === 1 ? "" : "s"} not yet emailed ${resorted === 1 ? "was" : "were"} re-sorted.`}
          </span>
        )}
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>
    </form>
  );
}
