-- Kargo hiring dashboard.
-- Personal details live ONLY in candidate_pii. Everything the AI reads comes from
-- candidates.redacted_cv. Nothing in the evaluation path selects from candidate_pii.

create extension if not exists pgcrypto;

create table public.candidates (
  id uuid primary key default gen_random_uuid(),
  ref_num bigint generated always as identity unique,
  applied_role text not null check (applied_role in ('pm', 'spm')),
  status text not null default 'pending'
    check (status in ('pending', 'evaluating', 'evaluated', 'error')),
  decision text check (decision in ('shortlisted', 'review', 'rejected')),
  decision_role text check (decision_role in ('pm', 'spm')),
  decision_source text check (decision_source in ('auto', 'manual')),
  redacted_cv text not null,
  redactions jsonb not null default '{}'::jsonb,
  interview_brief jsonb,          -- { pm: string[4], spm: string[4] }
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.candidate_pii (
  candidate_id uuid primary key references public.candidates(id) on delete cascade,
  full_name text,
  email text,
  phone text,
  links text[] not null default '{}',
  other jsonb not null default '{}'::jsonb,   -- address, DOB etc. that were stripped
  raw_text text not null,                     -- original CV text, never sent to AI
  cv_path text,                               -- private storage object
  cv_filename text,
  created_at timestamptz not null default now()
);
create index candidate_pii_email_idx on public.candidate_pii (lower(email));

create table public.evaluations (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  role text not null check (role in ('pm', 'spm')),
  total numeric(5, 1) not null,
  criteria jsonb not null,
  summary text not null,
  model text not null,
  created_at timestamptz not null default now(),
  unique (candidate_id, role)
);

create table public.emails (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  kind text not null check (kind in ('rejection', 'invite')),
  subject text not null,
  body text not null,
  status text not null default 'draft' check (status in ('draft', 'sending', 'sent', 'failed')),
  resend_id text,
  error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (candidate_id, kind)
);

create table public.settings (
  id int primary key default 1 check (id = 1),
  shortlist_threshold int not null default 70,
  reject_threshold int not null default 45,
  auto_send boolean not null default true,
  sender_name text not null default 'Arjun Mehta',
  sender_title text not null default 'Founder, Kargo',
  interview_format text not null default 'a 45-minute conversation',
  interview_location text not null default 'our office in Mumbai',
  scheduling_link text not null default '',
  updated_at timestamptz not null default now()
);
insert into public.settings (id) values (1) on conflict do nothing;

-- Server-only access: RLS on, no policies, no grants for browser roles.
do $$
declare t text;
begin
  foreach t in array array['candidates', 'candidate_pii', 'evaluations', 'emails', 'settings'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- Private bucket for original CV files.
insert into storage.buckets (id, name, public) values ('cvs', 'cvs', false)
on conflict (id) do nothing;
