import { NextResponse } from "next/server";

export const ok = (data: unknown = { ok: true }, status = 200) => NextResponse.json(data, { status });
export const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

/** Wraps a route handler so thrown errors become a JSON error the UI can show. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A) => {
    try {
      return await fn(...args);
    } catch (e) {
      console.error(e);
      return fail(e instanceof Error ? e.message : "Something went wrong.", 500);
    }
  };
}
