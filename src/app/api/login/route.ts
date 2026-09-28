import { cookies } from "next/headers";
import { checkPassword, createSession, SESSION_COOKIE } from "@/lib/auth";
import { fail, handle, ok } from "@/lib/http";

export const POST = handle(async (request: Request) => {
  const { password } = (await request.json().catch(() => ({}))) as { password?: string };
  if (!password || !(await checkPassword(password))) return fail("That password isn't right.", 401);
  const session = await createSession();
  (await cookies()).set(SESSION_COOKIE, session.value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: session.maxAge,
  });
  return ok();
});
