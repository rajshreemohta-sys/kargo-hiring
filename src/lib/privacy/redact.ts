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
// Indian mobile numbers, also when a PDF runs two copies together ("97293 4421897293 44218").
const INDIAN_MOBILE = /(?:\+?91[ -]?)?[6-9]\d{4}[ -]?\d{5}/g;

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

// Words that mark a line as a section heading or job title rather than a person's name.
const HEADING_WORDS =
  /\b(summary|profile|objective|experience|education|skills?|competenc(?:y|ies)|qualifications?|projects?|achievements?|awards?|certifications?|languages?|interests?|hobbies|references?|responsibilities|highlights|expertise|strengths|internships?|activities|publications|positions?|academic|professional|technical|core|key|career|personal|contact|details|information|declaration|training|tools|leadership|extracurricular|volunteer(?:ing)?|work|employment|history|about|curriculum|vitae|resume|résumé|overview|accomplishments|coursework|relevant|selected|additional|portfolio)\b/i;
const ROLE_WORDS =
  /\b(manager|engineer|analyst|executive|lead|head|director|associate|consultant|officer|intern|specialist|coordinator|developer|designer|founder|co-founder|product|operations|logistics|freight|marketing|marketer|strategic|strategy|strategist|senior|junior|chief|growth|sales|business|brand|content|digital|data|scientist|researcher|research|writer|planner|advisor|adviser|architect|owner|partner|representative|administrator|supervisor|trainee|fresher|student|graduate|supply|chain|account|customer|success|program|programme|project|finance|financial|commercial|procurement|hr|recruiter|teacher|professor|doctor|lawyer|accountant|cpo|ceo|cto|coo|vp|president|leader|expert|professional|generalist|apm|pm|limited|ltd|pvt|inc|llp|corp|university|college|institute|school|technology|technologies|solutions|bachelor|master|mba)\b/i;
// Words in file names that aren't part of a person's name.
const FILENAME_NOISE = new Set(["cv", "resume", "resumé", "final", "updated", "new", "latest", "copy", "pm", "spm", "apm", "product", "manager", "senior", "doc", "pdf", "docx", "version", "draft"]);

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

/**
 * PDFs sometimes render a name twice (small caps + normal) and the text comes out glued:
 * "PRIYA SHARMAPriya Sharma", "Tarun JosephTARUN JOSEPH". Put the spaces back.
 * Deliberately narrow so "LinkedIn", "KPIs" and "SaaS" are left alone.
 */
export function splitJoins(s: string): string {
  return s.replace(/(\p{Ll})(\p{Lu}{2,})/gu, "$1 $2").replace(/(\p{Lu}{2,})(\p{Lu}\p{Ll}{2,})/gu, "$1 $2");
}

/** "Priya Sharma" if the text looks like a person's name (2–4 capitalised words), else null. */
function asName(raw: string): string | null {
  const line = raw.replace(/^name\s*[:\-–]\s*/i, "").replace(/[|•·,;].*$/, "").replace(/\s+/g, " ").trim();
  if (line.length < 3 || line.length > 60) return null;
  if (/[\d@/\\:()[\]&]/.test(line)) return null;
  if (HEADING_WORDS.test(line) || ROLE_WORDS.test(line)) return null;
  let words = line.split(" ");
  // The same name printed twice in a row: keep one copy, preferring the mixed-case one.
  if (words.length === 4 || words.length === 6) {
    const half = words.length / 2;
    const [x, y] = [words.slice(0, half), words.slice(half)];
    if (x.join(" ").toLowerCase() === y.join(" ").toLowerCase()) words = /\p{Ll}/u.test(y.join("")) ? y : x;
  }
  if (words.length < 2 || words.length > 4) return null;
  if (!words.every((w) => /^\p{Lu}[\p{L}'.-]*$/u.test(w))) return null;
  const name = words.join(" ");
  return /\p{Ll}/u.test(name) ? name : titleCase(name);
}

const CONTACT = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|linkedin\.com|\+?\d[\d \t.-]{8,}\d/i;

/**
 * Every plausible way the candidate's name appears, most reliable first:
 * a "Name:" label, the text just before or above the contact details, the first lines,
 * and the file name when it matches words in the CV.
 */
export function nameCandidates(text: string, filename?: string | null): string[] {
  const lines = splitJoins(text).split(/\r?\n/).map((l) => l.trim());
  const found: string[] = [];
  const add = (n: string | null) => n && !found.some((f) => f.toLowerCase() === n.toLowerCase()) && found.push(n);

  for (const l of lines.slice(0, 40)) if (/^name\s*[:\-–]/i.test(l)) add(asName(l));

  lines.forEach((l, i) => {
    const m = l.match(CONTACT);
    if (!m) return;
    add(asName(l.slice(0, m.index))); // "Tarun Joseph  tarun@… · +91…"
    // Name on the lines above, read top-down: the usual layout is name, then title, then contact.
    for (let j = Math.max(0, i - 3); j < i; j++) add(asName(lines[j]));
  });

  for (const l of lines.filter(Boolean).slice(0, 3)) add(asName(l));

  if (filename) {
    const parts = filename
      .replace(/\.[a-z0-9]+$/i, "")
      .split(/[^\p{L}]+/u)
      .filter((t) => t.length >= 2 && !FILENAME_NOISE.has(t.toLowerCase()));
    for (let k = Math.min(parts.length, 3); k >= 2; k--) {
      for (let i = 0; i + k <= parts.length; i++) {
        const phrase = parts.slice(i, i + k);
        const re = new RegExp(`(?<![\\p{L}])${phrase.map(escapeRegExp).join("\\s+")}(?![\\p{L}])`, "iu");
        if (re.test(splitJoins(text))) add(titleCase(phrase.join(" ")));
      }
    }
  }
  // Prefer a candidate whose words also appear in the email address or LinkedIn handle
  // ("rohit.varma@…", "linkedin.com/in/rohit-varma"). Otherwise keep the order above.
  const handles = (text.match(/[A-Z0-9._%+-]+(?=@)|linkedin\.com\/in\/[^\s/?]+/gi) ?? []).join(" ").toLowerCase();
  const corroborated = (n: string) => n.toLowerCase().split(" ").some((w) => w.length >= 3 && handles.includes(w));
  return [...found.filter(corroborated), ...found.filter((n) => !corroborated(n))];
}

/** Best guess at the candidate's name. */
export function guessName(text: string, filename?: string | null): string | null {
  return nameCandidates(text, filename)[0] ?? null;
}

/** The words of the name, longest first, so "Priya" and "Sharma" are caught on their own too. */
function nameTokens(...names: (string | null)[]): string[] {
  const parts = names
    .join(" ")
    .split(/\s+/)
    .map((t) => t.replace(/[^\p{L}'-]/gu, ""))
    .filter((t) => t.length >= 2);
  return [...new Set(parts.map((t) => t.toLowerCase()))].sort((a, b) => b.length - a.length);
}

function isPhone(match: string): boolean {
  if (YEAR_RANGE.test(match)) return false;
  INDIAN_MOBILE.lastIndex = 0;
  const digits = match.replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 13;
}

export function redact(text: string, opts: { fullName?: string | null; filename?: string | null } = {}): RedactionResult {
  const counts: Record<string, number> = {};
  const bump = (k: string, n = 1) => (counts[k] = (counts[k] ?? 0) + n);
  const other: Record<string, string[]> = {};
  const keep = (k: string, v: string) => (other[k] ??= []).push(v.trim());

  let out = splitJoins(text.replace(/ /g, " "));

  const emails = [...new Set(out.match(EMAIL) ?? [])];
  const candidates = nameCandidates(out, opts.filename);
  const fullName = opts.fullName?.trim() || candidates[0] || null;
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
  out = out.replace(INDIAN_MOBILE, (m) => (phones.push(m.trim()), bump("phone"), PLACEHOLDER.phone));
  out = out.replace(AADHAAR, (m) => (keep("id_number", m), bump("id_number"), PLACEHOLDER.id));
  out = out.replace(PAN, (m) => (keep("id_number", m), bump("id_number"), PLACEHOLDER.id));
  out = out.replace(PASSPORT, (m) => (keep("id_number", m), bump("id_number"), PLACEHOLDER.id));
  out = out.replace(HANDLE, (m) => (keep("handle", m), bump("handle"), PLACEHOLDER.handle));

  // 4. The name: the full name first, then each part on its own ("Ms. Sharma", "Priya's").
  //    Every candidate spelling is removed, not only the one we picked, in case the pick is wrong.
  const tokens = nameTokens(fullName, ...candidates);
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

/** Every word of every plausible spelling of the candidate's name, for the final leak check. */
export function identityTokens(rawText: string, fullName: string | null, filename?: string | null): string[] {
  return nameTokens(fullName, ...nameCandidates(rawText, filename));
}

/** Re-scan redacted text for anything that still looks personal. Non-empty → do not send to AI. */
export function findLeaks(redacted: string, nameParts: string[] = []): string[] {
  const leaks: string[] = [];
  if (EMAIL.test(redacted)) leaks.push("email address");
  EMAIL.lastIndex = 0;
  for (const m of redacted.match(PHONE_CANDIDATE) ?? []) if (isPhone(m)) leaks.push("phone number");
  if (INDIAN_MOBILE.test(redacted)) leaks.push("phone number");
  INDIAN_MOBILE.lastIndex = 0;
  for (const t of nameParts) {
    if (new RegExp(`(?<![\\p{L}])${escapeRegExp(t)}(?![\\p{L}])`, "iu").test(redacted)) leaks.push("name");
  }
  return [...new Set(leaks)];
}
