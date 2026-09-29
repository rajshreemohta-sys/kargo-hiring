"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, pool } from "./run";

/** Send one drafted email straight from the dashboard table. */
export function SendDraft({ id, kind, failed, large = false }: { id: string; kind: "invite" | "rejection"; failed: boolean; large?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="flex items-center gap-2">
      <button
        className={large ? "btn-accent" : "rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-white hover:brightness-95 disabled:opacity-40"}
        disabled={busy}
        onClick={async () => {
          if (!confirm(`Send the ${kind === "invite" ? "interview invitation" : "rejection email"} now?`)) return;
          setBusy(true);
          setError(null);
          try {
            await api(`/api/emails/${id}/send`, { method: "POST" });
            router.refresh();
          } catch (e) {
            setError(e instanceof Error ? e.message : "Failed");
            setBusy(false);
          }
        }}
      >
        {busy ? "Sending…" : failed ? "Retry" : kind === "invite" ? "Send invite" : "Send rejection"}
      </button>
      {error && <span className="max-w-40 truncate text-xs text-red-600" title={error}>{error}</span>}
    </span>
  );
}

/** Send every unsent draft at once (useful with auto-send turned off). */
export function SendAllDrafts({ ids, invites, rejections }: { ids: string[]; invites: number; rejections: number }) {
  const router = useRouter();
  const [left, setLeft] = useState<number | null>(null);
  const [failed, setFailed] = useState(0);
  const parts = [invites && `${invites} invitation${invites === 1 ? "" : "s"}`, rejections && `${rejections} rejection${rejections === 1 ? "" : "s"}`].filter(Boolean).join(" and ");
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-accent/30 bg-accent-soft px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
      <span>
        {left !== null ? `Sending… ${left} left` : `${parts} ready to send.`}
        {failed > 0 && left === null && <span className="ml-2 text-red-600">{failed} failed. Open those candidates to see why.</span>}
      </span>
      <button
        className="btn-primary"
        disabled={left !== null}
        onClick={async () => {
          if (!confirm(`Send ${parts} now?`)) return;
          let remaining = ids.length;
          let bad = 0;
          setLeft(remaining);
          await pool(ids, 3, async (id) => {
            await api(`/api/emails/${id}/send`, { method: "POST" }).catch(() => bad++);
            setLeft(--remaining);
          });
          setFailed(bad);
          setLeft(null);
          router.refresh();
        }}
      >
        Send all drafts
      </button>
    </div>
  );
}
