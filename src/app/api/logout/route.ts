import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/auth";
import { ok } from "@/lib/http";

export async function POST() {
  (await cookies()).delete(SESSION_COOKIE);
  return ok();
}
