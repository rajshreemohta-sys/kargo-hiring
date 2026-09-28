// A single shared team password, exchanged for a signed session cookie.
// Uses Web Crypto so the same code runs in the proxy and in route handlers.

export const SESSION_COOKIE = "kargo_session";
const SESSION_DAYS = 14;

const enc = new TextEncoder();

async function hmac(value: string): Promise<string> {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET must be set (32+ characters).");
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(value));
  return Buffer.from(sig).toString("base64url");
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function createSession(): Promise<{ value: string; maxAge: number }> {
  const maxAge = SESSION_DAYS * 24 * 60 * 60;
  const exp = String(Math.floor(Date.now() / 1000) + maxAge);
  return { value: `${exp}.${await hmac(exp)}`, maxAge };
}

export async function verifySession(value: string | undefined): Promise<boolean> {
  if (!value) return false;
  const [exp, sig] = value.split(".");
  if (!exp || !sig || Number(exp) < Date.now() / 1000) return false;
  return safeEqual(sig, await hmac(exp));
}

export async function checkPassword(input: string): Promise<boolean> {
  const expected = process.env.TEAM_PASSWORD;
  if (!expected) throw new Error("TEAM_PASSWORD is not set.");
  // Compare digests so timing doesn't depend on where the strings differ.
  return safeEqual(await hmac(`pw:${input}`), await hmac(`pw:${expected}`));
}
