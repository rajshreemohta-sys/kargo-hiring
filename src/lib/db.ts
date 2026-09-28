import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Role } from "./rubric";
import type { Band, ScoredCriterion } from "./scoring";
import type { SenderSettings } from "./email/templates";

let client: SupabaseClient | null = null;

/** Server-only Supabase client with the secret key. Tables have RLS on and no public policies. */
export function db(): SupabaseClient {
  if (client) return client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SECRET_KEY.");
  client = createClient(url, key, { auth: { persistSession: false } });
  return client;
}

export const CV_BUCKET = "cvs";

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
  cv_path: string | null;
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

export const candidateRef = (n: number) => `KRG-${String(n).padStart(4, "0")}`;

export async function getSettings(): Promise<Settings> {
  const { data, error } = await db().from("settings").select("*").eq("id", 1).single();
  if (error) throw error;
  return data as Settings;
}

export function must<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  if (res.data === null) throw new Error("Not found");
  return res.data;
}
