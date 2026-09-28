// Small client helpers shared by the upload queue and the retry banner.

export async function api<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok && res.status !== 409) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data as T;
}

/** Run tasks with at most `limit` in flight. */
export async function pool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  const queue = [...items];
  await Promise.all(
    Array.from({ length: Math.min(limit, queue.length) }, async () => {
      while (queue.length) await fn(queue.shift()!);
    }),
  );
}

export const evaluate = (id: string) =>
  api<{ decision: string | null; decision_role: string | null }>(`/api/candidates/${id}/evaluate`, { method: "POST" });
