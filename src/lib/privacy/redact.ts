// Separates a candidate's personal details from their CV text, without any AI.
// Everything here is deterministic regex + heuristics so personal data never leaves
// the server on its way to being redacted. The redacted text is the only thing the
// evaluator ever sees; the extracted details go to the private candidate_pii table.

export type ExtractedPii = {
  fullName: string | null;
  email: string | null;
  phone: string | null;
  links: string[];
  other: Record<string, string[]>; // address, date of birth, gender, ids…
};

export type RedactionResult = {
  redacted: string;
  pii: ExtractedPii;
  counts: Record<string, number>;
  leaks: string[]; // anything that still looks personal after redaction
};

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const URL = /\b(?:https?:\/\/|www\.)[^\s<>()]+|\b(?:linkedin\.com|github\.com|gitlab\.com|behance\.net|dribbble\.com|medium\.com|twitter\.com|x\.com|instagram\.com|facebook\.com|wa\.me|t\.me)\/[^\s<>()]*/gi;
const PHONE_CANDIDATE = /(?:\+[ \t]?\d{1,3}[ \t.-]*)?(?:\([ \t]?\d{1,5}[ \t]?\)[ \t.-]*)?\d[\d \t.-]{7,}\d/g;
const YEAR_RANGE = /(?:19|20)\d{2}\s*[-–—]\s*(?:(?:19|20)\d{2}|present|current|now)/i;
const HANDLE = /(?<![\w.])@[A-Za-z0-9_]{3,30}\b/g;
const AADHAAR = /\b\d{4}\s\d{4}\s\d{4}\b/g;
const PAN = /\b[A-Z]{5}\d{4}[A-Z]\b/g;
const PASSPORT = /\b[A-PR-WY][1-9]\d\s?\d{4}[1-9]\b/g;
const PINCODE = /\b[1-9]\d{2}\s?\d{3}\b/;

// "Label: value" lines that carry protected or identifying attributes.
const SENSITIVE_LABELS: [string, RegExp][] = [
  ["date_of_birth", /^(date of birth|d\.?o\.?b\.?|birth ?date|born( on)?)\b/i],
  ["age", /^age\b/i],
  ["gender", /^(gender|sex)\b/i],
  ["marital_status", /^marital( status)?\b/i],
  ["nationality", /^(nationality|citizenship)\b/i],
  ["religion", /^(religion|caste|category)\b/i],
  ["family", /^(father'?s|mother'?s|husband'?s|spouse'?s|wife'?s) name\b/i],
  ["id_number", /^(passport|aadha?ar|pan( card| no| number)?|voter id|driving licen[cs]e)\b/i],
  ["address", /^(permanent |current |residential |postal )?address\b/i],
  ["phone", /^(phone|mobile|mob|cell|contact( no| number)?|tel|whatsapp)\b/i],
  ["email", /^e-?mail\b/i],
];

// Lines that look like "Name Surname" but are headings or titles.
const NOT_A_NAME = new Set(
  [
    "curriculum vitae", "resume", "résumé", "cv", "profile", "summary", "professional summary",
    "objective", "experience", "work experience", "professional experience", "education",
    "skills", "key skills", "core skills", "projects", "contact", "contact details",
    "personal details", "personal information", "certifications", "achievements", "awards",
    "languages", "interests", "hobbies", "references", "product manager", "senior product manager",
    "operations manager", "about me", "career objective", "technical skills", "employment history",
  ].map((s) => s.toLowerCase()),
);
const ROLE_WORDS = /\b(manager|engineer|analyst|executive|lead|head|director|associate|consultant|officer|intern|specialist|coordinator|developer|designer|founder|product|operations|logistics|freight|limited|ltd|pvt|inc|llp|university|college|institute|school)\b/i;

const PLACEHOLDER = {
  name: "[CANDIDATE]",
  email: "[EMAIL]",
  phone: "[PHONE]",
  link: "[LINK]",
  handle: "[HANDLE]",
  address: "[ADDRESS]",
  id: "[ID]",
  removed: "[REMOVED]",
};

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function titleCase(s: string) {
  return s.toLowerCase().replace(/(^|[\s'-])\p{L}/gu, (m) => m.toUpperCase());
}

/** Best guess at the candidate's name: the first short, name-shaped line at the top of the CV. */
export function guessName(text: string): string | null {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 12);
  for (const raw of lines) {
    const line = raw.replace(/^name\s*[:\-–]\s*/i, "").replace(/[|•·,].*$/, "").trim();
    if (line.length < 3 || line.length > 40) continue;
    if (/[\d@/\\:]/.test(line)) continue;
    if (NOT_A_NAME.has(line.toLowerCase())) continue;
    if (ROLE_WORDS.test(line)) continue;
    const words = line.split(/\s+/);
    if (words.length < 2 || words.length > 4) continue;
    const nameish = words.every((w) => /^\p{Lu}[\p{L}'.-]*$/u.test(w) || /^\p{Lu}\.?$/u.test(w));
    if (nameish) return /^[\p{Lu}\s'.-]+$/u.test(line) ? titleCase(line) : line;
  }
  return null;
}

/** The words of the name, longest first, so "Priya" and "Sharma" are caught on their own too. */
function nameTokens(fullName: string | null): string[] {
  const parts = (fullName ?? "")
    .split(/\s+/)
    .map((t) => t.replace(/[^\p{L}'-]/gu, ""))
    .filter((t) => t.length >= 2);
  return [...new Set(parts.map((t) => t.toLowerCase()))].sort((a, b) => b.length - a.length);
}

function isPhone(match: string): boolean {
  if (YEAR_RANGE.test(match)) return false;
  const digits = match.replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 13;
}

export function redact(text: string, opts: { fullName?: string | null } = {}): RedactionResult {
  const counts: Record<string, number> = {};
  const bump = (k: string, n = 1) => (counts[k] = (counts[k] ?? 0) + n);
  const other: Record<string, string[]> = {};
  const keep = (k: string, v: string) => (other[k] ??= []).push(v.trim());

  let out = text.replace(/ /g, " ");

  const emails = [...new Set(out.match(EMAIL) ?? [])];
  const fullName = opts.fullName?.trim() || guessName(out);
  const primaryEmail = emails[0] ?? null;

  // 1. Labelled lines: "Date of Birth: 12/03/1994", "Address: ...", "Gender: Female".
  out = out
    .split(/\r?\n/)
    .map((line) => {
      const m = line.match(/^(\s*[•\-*]?\s*)([^:\-–]{2,30}?)\s*[:\-–]\s*(.+)$/);
      if (!m) return line;
      const [, lead, label, value] = m;
      const hit = SENSITIVE_LABELS.find(([, re]) => re.test(label.trim()));
      if (!hit || hit[0] === "email" || hit[0] === "phone") return line; // handled by patterns below
      keep(hit[0], value);
      bump(hit[0]);
      return `${lead}${label.trim()}: ${hit[0] === "address" ? PLACEHOLDER.address : PLACEHOLDER.removed}`;
    })
    .join("\n");

  // 2. Unlabelled street addresses near the top: a line with a PIN code and a comma.
  out = out
    .split(/\r?\n/)
    .map((line, i) => {
      if (i > 15 || !PINCODE.test(line) || !line.includes(",")) return line;
      if (/\d+\s*%|\b(shipments?|containers?|teu|orders?|tickets?)\b/i.test(line)) return line;
      keep("address", line);
      bump("address");
      return PLACEHOLDER.address;
    })
    .join("\n");

  // 3. Contact patterns.
  out = out.replace(EMAIL, () => (bump("email"), PLACEHOLDER.email));
  const links: string[] = [];
  out = out.replace(URL, (m) => (links.push(m.replace(/[.,;]+$/, "")), bump("link"), PLACEHOLDER.link));
  const phones: string[] = [];
  out = out.replace(PHONE_CANDIDATE, (m) => {
    if (!isPhone(m)) return m;
    phones.push(m.trim());
    bump("phone");
    return PLACEHOLDER.phone;
  });
  out = out.replace(AADHAAR, (m) => (keep("id_number", m), bump("id_number"), PLACEHOLDER.id));
  out = out.replace(PAN, (m) => (keep("id_number", m), bump("id_number"), PLACEHOLDER.id));
  out = out.replace(PASSPORT, (m) => (keep("id_number", m), bump("id_number"), PLACEHOLDER.id));
  out = out.replace(HANDLE, (m) => (keep("handle", m), bump("handle"), PLACEHOLDER.handle));

  // 4. The name: the full name first, then each part on its own ("Ms. Sharma", "Priya's").
  const tokens = nameTokens(fullName);
  if (fullName) {
    const re = new RegExp(`\\b${escapeRegExp(fullName).replace(/\s+/g, "\\s+")}\\b`, "gi");
    out = out.replace(re, () => (bump("name"), PLACEHOLDER.name));
  }
  for (const t of tokens) {
    const re = new RegExp(`(?<![\\p{L}])${escapeRegExp(t)}(?![\\p{L}])`, "giu");
    out = out.replace(re, () => (bump("name"), PLACEHOLDER.name));
  }
  out = out.replace(/(\[CANDIDATE\]\s*){2,}/g, `${PLACEHOLDER.name} `);
  out = out.replace(/\b(Mr|Mrs|Ms|Miss|Dr)\.?\s+\[CANDIDATE\]/g, PLACEHOLDER.name);

  out = out.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();

  return {
    redacted: out,
    pii: {
      fullName: fullName ?? null,
      email: primaryEmail,
      phone: phones[0] ?? null,
      links: [...new Set(links)],
      other,
    },
    counts,
    leaks: findLeaks(out, tokens),
  };
}

/** Re-scan redacted text for anything that still looks personal. Non-empty → do not send to AI. */
export function findLeaks(redacted: string, nameParts: string[] = []): string[] {
  const leaks: string[] = [];
  if (EMAIL.test(redacted)) leaks.push("email address");
  EMAIL.lastIndex = 0;
  for (const m of redacted.match(PHONE_CANDIDATE) ?? []) if (isPhone(m)) leaks.push("phone number");
  for (const t of nameParts) {
    if (new RegExp(`(?<![\\p{L}])${escapeRegExp(t)}(?![\\p{L}])`, "iu").test(redacted)) leaks.push("name");
  }
  return [...new Set(leaks)];
}
