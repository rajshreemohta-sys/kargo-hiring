import type { Band } from "@/lib/scoring";
import { ROLE_SHORT, type Role } from "@/lib/rubric";

const DECISION_STYLE: Record<Band, string> = {
  shortlisted: "bg-ink text-white",
  review: "bg-accent-soft text-accent ring-1 ring-inset ring-accent/30",
  rejected: "bg-soft text-muted",
};
const DECISION_LABEL: Record<Band, string> = { shortlisted: "Shortlisted", review: "Needs review", rejected: "Rejected" };

export function DecisionBadge({ decision, role }: { decision: Band | null; role?: Role | null }) {
  if (!decision) return <span className="text-sm text-muted">—</span>;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${DECISION_STYLE[decision]}`}>
      {DECISION_LABEL[decision]}
      {role && decision !== "rejected" && <span className="opacity-70">· {ROLE_SHORT[role]}</span>}
    </span>
  );
}

export function ScoreBar({ value, emphasis = false }: { value: number | null; emphasis?: boolean }) {
  if (value === null) return <span className="text-sm text-muted">—</span>;
  return (
    <div className="flex items-center gap-2">
      <span className={`w-9 text-right text-sm tabular-nums ${emphasis ? "font-semibold" : "text-muted"}`}>{Math.round(value)}</span>
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-soft">
        <div className={`h-full rounded-full ${emphasis ? "bg-accent" : "bg-neutral-300"}`} style={{ width: `${Math.min(100, value)}%` }} />
      </div>
    </div>
  );
}

export function Dots({ score, max = 4 }: { score: number; max?: number }) {
  return (
    <span className="inline-flex gap-1" aria-label={`${score} of ${max}`}>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={`h-2 w-2 rounded-full ${i < score ? "bg-accent" : "bg-line"}`} />
      ))}
    </span>
  );
}

export function StatusText({ status, error }: { status: string; error?: string | null }) {
  if (status === "evaluating") return <span className="text-sm text-accent">Evaluating…</span>;
  if (status === "pending") return <span className="text-sm text-muted">Waiting to evaluate</span>;
  if (status === "error") return <span className="text-sm text-red-600" title={error ?? ""}>Needs attention</span>;
  return null;
}
