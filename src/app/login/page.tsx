import { LoginForm } from "@/components/LoginForm";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const next = (await searchParams).next;
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-2 text-lg font-semibold">
          <span className="h-2.5 w-2.5 rounded-full bg-accent" /> Kargo Hiring
        </div>
        <LoginForm next={typeof next === "string" && next.startsWith("/") ? next : "/"} />
        <p className="mt-6 text-xs text-muted">Internal tool. Ask the founder&apos;s office for the team password.</p>
      </div>
    </main>
  );
}
