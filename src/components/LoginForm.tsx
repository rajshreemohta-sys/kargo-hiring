"use client";
import { useState } from "react";

export function LoginForm({ next }: { next: string }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        const password = new FormData(e.currentTarget).get("password");
        const res = await fetch("/api/login", { method: "POST", body: JSON.stringify({ password }) });
        if (res.ok) window.location.href = next;
        else {
          setError((await res.json()).error ?? "Couldn't sign in.");
          setBusy(false);
        }
      }}
    >
      <label className="label" htmlFor="password">Team password</label>
      <input id="password" name="password" type="password" autoFocus required className="input" />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button className="btn-primary w-full" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
    </form>
  );
}
