"use client";
import { useRouter } from "next/navigation";

export function SignOut() {
  const router = useRouter();
  return (
    <button
      className="rounded-md px-3 py-1.5 text-muted hover:bg-soft hover:text-ink"
      onClick={async () => {
        await fetch("/api/logout", { method: "POST" });
        router.replace("/login");
        router.refresh();
      }}
    >
      Sign out
    </button>
  );
}
