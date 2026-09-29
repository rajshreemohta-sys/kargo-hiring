import "server-only";
import { attachDatabasePool } from "@vercel/functions";
import pg from "pg";
import type { Role } from "./rubric";
import type { Band, ScoredCriterion } from "./scoring";
import type { SenderSettings } from "./email/templates";

// Neon Postgres. Use the pooled connection string (host contains "-pooler") for the app.
// Return numeric and bigint columns as JS numbers (scores and ref numbers are small).
pg.types.setTypeParser(pg.types.builtins.NUMERIC, parseFloat);
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => parseInt(v, 10));
// Timestamps as ISO strings, so rows pass straight to client components and JSON.
// Keep pg's original parser once, so reloading this module doesn't wrap our own wrapper.
const g = globalThis as unknown as { kargoPool?: pg.Pool; pgParseTimestamp?: (v: string) => Date };
g.pgParseTimestamp ??= pg.types.getTypeParser(pg.types.builtins.TIMESTAMPTZ) as (v: string) => Date;
pg.types.setTypeParser(pg.types.builtins.TIMESTAMPTZ, (v) => g.pgParseTimestamp!(v).toISOString());

function pool(): pg.Pool {
  if (g.kargoPool) return g.kargoPool;
  // "require" already verifies the certificate in pg; say so explicitly to skip its warning.
  const connectionString = process.env.DATABASE_URL?.replace("sslmode=require", "sslmode=verify-full");
  if (!connectionString) throw new Error("Missing DATABASE_URL.");
  // Small pool: each serverless instance handles few requests at a time.
  const created = new pg.Pool({ connectionString, max: 3, idleTimeoutMillis: 10_000 });
  attachDatabasePool(created); // lets Vercel close idle connections before a function is suspended
  g.kargoPool = created;
  return created;
}

/** Run a parameterised query ($1, $2…) and return the rows. */
export async function query<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  const { rows } = await pool().query(text, params);
  return rows as T[];
}

/** The first row, or null. */
export async function maybeOne<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T | null> {
  return (await query<T>(text, params))[0] ?? null;
}

/** The first row; throws if there isn't one. */
export async function one<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T> {
  const row = await maybeOne<T>(text, params);
  if (!row) throw new Error("Not found");
  return row;
}

export type Candidate = {
  id: string;
  ref_num: number;
  applied_role: Role;
  status: "pending" | "evaluating" | "evaluated" | "error";
  decision: Band | null;
  decision_role: Role | null;
  decision_source: "auto" | "manual" | null;
  redacted_cv: string;
  redactions: Record<string, number>;
  interview_brief: Record<Role, string[]> | null;
  error: string | null;
  created_at: string;
  updated_at: string;
};

export type CandidatePii = {
  candidate_id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  links: string[];
  other: Record<string, string[]>;
  raw_text: string;
  cv_filename: string | null;
};

export type Evaluation = {
  id: string;
  candidate_id: string;
  role: Role;
  total: number;
  criteria: ScoredCriterion[];
  summary: string;
  model: string;
  created_at: string;
};

export type Email = {
  id: string;
  candidate_id: string;
  kind: "rejection" | "invite";
  subject: string;
  body: string;
  status: "draft" | "sending" | "sent" | "failed";
  resend_id: string | null;
  error: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Settings = SenderSettings & {
  shortlist_threshold: number;
  reject_threshold: number;
  auto_send: boolean;
};

export const isId = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

export const candidateRef = (n: number) => `KRG-${String(n).padStart(4, "0")}`;

export async function getSettings(): Promise<Settings> {
  return one<Settings>("select * from settings where id = 1");
}
