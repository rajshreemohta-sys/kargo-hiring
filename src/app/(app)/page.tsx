import Link from "next/link";
import { EvaluatePending } from "@/components/EvaluatePending";
import { Uploader } from "@/components/Uploader";
import { DecisionBadge, ScoreBar, StatusText } from "@/components/ui";
import { candidateRef, db, type Candidate } from "@/lib/db";
import { ROLE_SHORT, type Role } from "@/lib/rubric";

type Row = Candidate & {
  candidate_pii: { full_name: string | null } | null;
  evaluations: { role: Role; total: number }[];
  emails: { kind: string; status: string }[];
};

const VIEWS = [
  { key: "all", label: "All" },
  { key: "shortlisted", label: "Shortlisted" },
  { key: "review", label: "Needs review" },
  { key: "rejected", label: "Rejected" },
  { key: "attention", label: "Needs attention" },
] as const;

export default async function Dashboard({ searchParams }: PageProps<"/">) {
  const { view = "all", q = "" } = (await searchParams) as { view?: string; q?: string };
  const { data, error } = await db()
    .from("candidates")
    .select("*, candidate_pii(full_name), evaluations(role, total), emails(kind, status)")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(error.message);
  const all = (data ?? []) as Row[];

  const count = (f: (r: Row) => boolean) => all.filter(f).length;
  const needsAttention = (r: Row) => r.status === "error";
  const filtered = all.filter((r) => {
    if (view === "attention" && !needsAttention(r)) return false;
    if (view !== "all" && view !== "attention" && r.decision !== view) return false;
    if (q) {
      const hay = `${r.candidate_pii?.full_name ?? ""} ${candidateRef(r.ref_num)}`.toLowerCase();
      if (!hay.includes(q.toLowerCase())) return false;
    }
    return true;
  });
  const pendingIds = all.filter((r) => r.status === "pending").map((r) => r.id);

  const stats = [
    { label: "CVs screened", value: count((r) => r.status === "evaluated") },
    { label: "Shortlisted", value: count((r) => r.decision === "shortlisted") },
    { label: "Needs review", value: count((r) => r.decision === "review"), accent: true },
    { label: "Emails sent", value: all.reduce((n, r) => n + r.emails.filter((e) => e.status === "sent").length, 0) },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Candidates</h1>
        <p className="mt-1 text-sm text-muted">
          Every CV is scored for both Product Manager and Senior Product Manager. Personal details are removed before the AI reads it.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="card p-4">
            <div className="label">{s.label}</div>
            <div className={`mt-1 text-2xl font-semibold tabular-nums ${s.accent && s.value ? "text-accent" : ""}`}>{s.value}</div>
          </div>
        ))}
      </div>

      <Uploader />
      {pendingIds.length > 0 && <EvaluatePending ids={pendingIds} />}

      <section className="card overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-line p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-1">
            {VIEWS.map((v) => {
              const n = v.key === "all" ? all.length : v.key === "attention" ? count(needsAttention) : count((r) => r.decision === v.key);
              const active = view === v.key;
              return (
                <Link
                  key={v.key}
                  href={{ pathname: "/", query: { ...(v.key !== "all" && { view: v.key }), ...(q && { q }) } }}
                  className={`rounded-md px-3 py-1.5 text-sm ${active ? "bg-ink text-white" : "text-muted hover:bg-soft hover:text-ink"}`}
                >
                  {v.label} <span className="tabular-nums opacity-60">{n}</span>
                </Link>
              );
            })}
          </div>
          <form className="sm:w-64">
            {view !== "all" && <input type="hidden" name="view" value={view} />}
            <input name="q" defaultValue={q} placeholder="Search name or KRG-…" className="input" />
          </form>
        </div>

        {filtered.length === 0 ? (
          <p className="p-10 text-center text-sm text-muted">{all.length ? "No candidates match." : "Upload a CV to get started."}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-muted">
                <tr className="border-b border-line">
                  <th className="px-4 py-2.5 font-medium">Candidate</th>
                  <th className="px-4 py-2.5 font-medium">Applied</th>
                  <th className="px-4 py-2.5 font-medium">PM score</th>
                  <th className="px-4 py-2.5 font-medium">SPM score</th>
                  <th className="px-4 py-2.5 font-medium">Decision</th>
                  <th className="px-4 py-2.5 font-medium">Email</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const score = (role: Role) => r.evaluations.find((e) => e.role === role)?.total ?? null;
                  const email = r.emails[0];
                  return (
                    <tr key={r.id} className="border-b border-line last:border-0 hover:bg-soft/60">
                      <td className="px-4 py-3">
                        <Link href={`/candidates/${r.id}`} className="font-medium hover:underline">
                          {r.candidate_pii?.full_name ?? "Name not found"}
                        </Link>
                        <div className="font-mono text-xs text-muted">{candidateRef(r.ref_num)}</div>
                      </td>
                      <td className="px-4 py-3">{ROLE_SHORT[r.applied_role]}</td>
                      <td className="px-4 py-3"><ScoreBar value={score("pm")} emphasis={r.decision_role === "pm"} /></td>
                      <td className="px-4 py-3"><ScoreBar value={score("spm")} emphasis={r.decision_role === "spm"} /></td>
                      <td className="px-4 py-3">
                        {r.status === "evaluated" ? <DecisionBadge decision={r.decision} role={r.decision_role} /> : <StatusText status={r.status} error={r.error} />}
                      </td>
                      <td className="px-4 py-3 text-muted">
                        {!email ? "—" : email.status === "sent" ? (
                          <span className="text-ink">{email.kind === "invite" ? "Invite sent" : "Rejection sent"}</span>
                        ) : email.status === "failed" ? (
                          <span className="text-red-600">Failed</span>
                        ) : (
                          "Draft ready"
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
