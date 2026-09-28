"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, evaluate } from "./run";

export function CandidateActions({ id, canRescore, hasFile }: { id: string; canRescore: boolean; hasFile: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap gap-2">
        {hasFile && <a href={`/api/candidates/${id}/cv`} target="_blank" rel="noreferrer" className="btn-ghost">Original CV</a>}
        <button
          className="btn-ghost"
          disabled={!canRescore || !!busy}
          title={canRescore ? "" : "Locked once an email has been sent"}
          onClick={async () => {
            setBusy("score");
            setError(null);
            await evaluate(id).catch((e) => setError(e.message));
            setBusy(null);
            router.refresh();
          }}
        >
          {busy === "score" ? "Scoring…" : "Re-score"}
        </button>
        <button
          className="btn-ghost text-red-600"
          disabled={!!busy}
          onClick={async () => {
            if (!confirm("Delete this candidate and all their data, including the original CV? This can't be undone.")) return;
            setBusy("delete");
            await api(`/api/candidates/${id}`, { method: "DELETE" });
            router.push("/");
            router.refresh();
          }}
        >
          Delete
        </button>
      </div>
      {error && <p className="max-w-sm text-right text-sm text-red-600">{error}</p>}
    </div>
  );
}
