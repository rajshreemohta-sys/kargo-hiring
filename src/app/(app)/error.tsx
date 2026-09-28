"use client";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="card mx-auto max-w-lg p-8 text-center">
      <h1 className="text-lg font-semibold">This page couldn&apos;t load</h1>
      <p className="mt-2 text-sm text-muted">
        {process.env.NODE_ENV === "development" ? error.message : "Something went wrong on our side. Try again in a moment."}
      </p>
      <button className="btn-primary mt-5" onClick={reset}>Try again</button>
    </div>
  );
}
