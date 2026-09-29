# Kargo Hiring

Internal CV screening for Kargo's Product Manager and Senior Product Manager roles.

## How it works

1. **Upload** – drop CVs (PDF, DOCX, TXT up to 4 MB) or paste text, and pick the role they applied for.
2. **Privacy split (no AI)** – the server pulls out name, email, phone, links, address, date of birth,
   gender, marital status, ID numbers etc. with deterministic rules (`src/lib/privacy/redact.ts`).
   Those go to the private `candidate_pii` table, and the original file to `cv_files`, both in Neon Postgres.
   The redacted text is re-scanned for leftovers, and if the name can't be found or anything personal
   remains, the CV is held until the team fixes the contact details. Only the redacted text is ever sent to the model.
3. **Scoring** – Gemini scores every CV against **both** rubrics (`src/lib/rubric.ts`), 0–4 per criterion
   with verbatim evidence quotes. Code checks each quote exists in the CV (unfound quotes cap the criterion at 1),
   applies the weights, and computes a total out of 100 (`src/lib/scoring.ts`).
4. **Decision** – shortlist at 70+, reject below 45, review in between (editable in Settings). If a candidate
   only clears the bar for the other role, they're shortlisted for that role instead.
5. **Emails** – drafts are written from templates and the candidate's real name/email are merged in only at this
   step (`src/lib/email/templates.ts`). Shortlisted: interview confirmation + 4-line interview brief.
   Rejected: a soft rejection. With auto-send on, these go out via Resend as soon as scoring finishes.
   "Needs review" candidates wait for the team.

## Stack

Next.js on Vercel · Neon Postgres for records and CV files · Gemini for scoring · Resend for email.

## Setup

```bash
cp .env.example .env.local   # fill in the keys
npm install
npm run db:migrate           # creates the tables in Neon
npm run dev
```

Tests: `npm test`.

## Deploy (Vercel)

The GitHub repo is connected to the Vercel project: every push to `main` deploys to production
(https://kargo-hiring-chi.vercel.app), and other branches get preview deployments.

Import the repo in Vercel, add every variable from `.env.example` in Project → Settings → Environment Variables,
and deploy. Run `npm run db:migrate` once against the Neon database before first use. Scoring runs in `/api/candidates/[id]/evaluate` with `maxDuration = 300`.
