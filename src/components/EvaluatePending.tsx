"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { evaluate, pool } from "./run";

// Shown when CVs were uploaded but never scored (e.g. the tab was closed mid-batch).
export function EvaluatePending({ ids }: { ids: string[] }) {
  const router = useRouter();
  const [left, setLeft] = useState<number | null>(null);
  return (
    <div className="flex items-center justify-between rounded-xl bg-accent-soft px-4 py-3 text-sm">
      <span>
        {left === null ? `${ids.length} CV${ids.length === 1 ? " is" : "s are"} waiting to be scored.` : `Scoring… ${left} left`}
      </span>
      <button
        className="btn-primary"
        disabled={left !== null}
        onClick={async () => {
          let remaining = ids.length;
          setLeft(remaining);
          await pool(ids, 3, async (id) => {
            await evaluate(id).catch(() => {});
            setLeft(--remaining);
            router.refresh();
          });
          setLeft(null);
        }}
      >
        Score now
      </button>
    </div>
  );
}
