import { connection } from "next/server";
import { SettingsForm } from "@/components/SettingsForm";
import { getSettings } from "@/lib/db";
import { testRecipient } from "@/lib/email/send";
import { RUBRIC, ROLE_LABEL, ROLES } from "@/lib/rubric";

export default async function SettingsPage() {
  await connection(); // always read live settings, never a build-time snapshot
  const settings = await getSettings();
  const emailReady = Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
  const testTo = testRecipient();
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted">How candidates are sorted, and what goes into the emails.</p>
      </div>
      {!emailReady && (
        <div className="rounded-xl bg-accent-soft px-4 py-3 text-sm text-accent">
          Email sending isn&apos;t set up yet. Add RESEND_API_KEY and EMAIL_FROM to the environment. Drafts are still prepared.
        </div>
      )}
      {testTo && (
        <div className="rounded-xl bg-accent-soft px-4 py-3 text-sm text-accent">
          Test mode: every email goes to {testTo} instead of the candidate. Remove EMAIL_TEST_RECIPIENT to send for real.
        </div>
      )}
      <SettingsForm settings={settings} />

      <section className="card">
        <div className="border-b border-line p-5">
          <h2 className="font-semibold">Rubric</h2>
          <p className="mt-1 text-sm text-muted">Every CV is scored against both. Built from the profiles of Kargo&apos;s hires.</p>
        </div>
        <div className="grid gap-px bg-line md:grid-cols-2">
          {ROLES.map((role) => (
            <div key={role} className="bg-white p-5">
              <h3 className="font-semibold">{ROLE_LABEL[role]}</h3>
              <ul className="mt-3 space-y-3">
                {RUBRIC[role].map((c) => (
                  <li key={c.key}>
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="font-medium">{c.title}</span>
                      <span className="shrink-0 tabular-nums text-accent">{c.weight}%</span>
                    </div>
                    <p className="mt-1 whitespace-pre-line text-xs leading-relaxed text-muted">{c.bar}</p>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
