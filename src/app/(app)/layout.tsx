import Link from "next/link";
import { SignOut } from "@/components/SignOut";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-line">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <span className="h-2.5 w-2.5 rounded-full bg-accent" /> Kargo Hiring
          </Link>
          <nav className="flex items-center gap-1 text-sm">
            <Link href="/" className="rounded-md px-3 py-1.5 hover:bg-soft">Candidates</Link>
            <Link href="/settings" className="rounded-md px-3 py-1.5 hover:bg-soft">Settings</Link>
            <SignOut />
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
