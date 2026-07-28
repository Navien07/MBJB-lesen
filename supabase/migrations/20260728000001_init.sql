-- MBJB-lesen initial schema.
-- Invariants enforced here, not in application code:
--   §1.1 terminal decisions require a human officer (trigger on applications)
--   §1.5 audit_log is append-only (trigger + revoked grants)
--   §1.6 rule versions are immutable (trigger + revoked grants)

create type public.application_status as enum (
  'DRAFT', 'SUBMITTED', 'INTAKE_CHECK', 'DEFICIENT', 'ANALYSING',
  'ASSESSED', 'OFFICER_REVIEW',
  'APPROVED', 'APPROVED_WITH_CONDITIONS', 'AMENDMENT_REQUESTED', 'REJECTED',
  'CLOSED'
);

create type public.user_role as enum ('applicant', 'officer');
create type public.finding_status as enum ('compliant', 'non_compliant', 'escalated');
create type public.job_status as enum ('queued', 'running', 'done', 'failed', 'parked');
create type public.pipeline_stage as enum ('intake', 'signboard', 'compliance', 'copilot');
create type public.actor_type as enum ('human', 'agent', 'system');

-- ---------------------------------------------------------------- profiles
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.user_role not null default 'applicant',
  full_name text not null default '',
  created_at timestamptz not null default now()
);

create or replace function public.current_role_is_officer()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'officer'
  );
$$;

-- ------------------------------------------------------------ applications
create table public.applications (
  id uuid primary key default gen_random_uuid(),
  applicant_id uuid not null references public.profiles (id),
  status public.application_status not null default 'DRAFT',
  -- Borang Permohonan Lesen Premis Perniagaan dan Iklan fields
  applicant_name text not null default '',
  ic_or_passport text not null default '',
  citizenship text not null default '',
  correspondence_address text not null default '',
  premise_address text not null default '',
  ssm_registration_no text not null default '',
  company_name text not null default '',
  property_tax_account_no text not null default '',
  phone text not null default '',
  business_activity text not null default '',
  floor_area_m2 numeric,
  signboard_width_m numeric,
  signboard_height_m numeric,
  risk_tier text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- §1.1: no code path by which a non-human actor reaches a terminal state.
-- auth.uid() is null for the service role and for direct connections, so a
-- worker or seed script physically cannot write a terminal status.
create or replace function public.enforce_human_terminal_transition()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status in ('APPROVED', 'APPROVED_WITH_CONDITIONS', 'AMENDMENT_REQUESTED', 'REJECTED')
     and new.status is distinct from old.status then
    if auth.uid() is null or not public.current_role_is_officer() then
      raise exception 'terminal status % may only be set by a human officer', new.status
        using errcode = 'P0001';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger applications_terminal_guard
  before update on public.applications
  for each row execute function public.enforce_human_terminal_transition();

-- --------------------------------------------------------------- documents
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications (id) on delete cascade,
  doc_type text not null,               -- declared checklist doc_id, e.g. DOC-SSM
  storage_path text not null,
  filename text not null,
  mime_type text not null default '',
  classified_type text,                 -- intake agent's classification
  legible boolean,
  classification_confidence numeric,
  uploaded_at timestamptz not null default now()
);

-- ------------------------------------------- signboard_observations
create table public.signboard_observations (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications (id) on delete cascade,
  document_id uuid references public.documents (id) on delete set null,
  run_text text not null,
  script text not null,
  language text not null,
  role text not null,
  relative_glyph_height numeric,
  bbox jsonb,
  confidence numeric not null,
  model_version text,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------------- rules
-- §1.6 rules are data; versions immutable.
create table public.rules (
  id uuid primary key default gen_random_uuid(),
  rule_set_id text not null,
  version text not null,
  pack jsonb not null,
  created_at timestamptz not null default now(),
  unique (rule_set_id, version)
);

create or replace function public.reject_mutation()
returns trigger language plpgsql as $$
begin
  raise exception '% on % is not permitted: append-only', tg_op, tg_table_name
    using errcode = 'P0001';
end;
$$;

create trigger rules_immutable
  before update or delete on public.rules
  for each row execute function public.reject_mutation();

-- ---------------------------------------------------------------- findings
create table public.findings (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications (id) on delete cascade,
  rule_id text not null,
  rule_version text not null,
  status public.finding_status not null,
  severity text not null,
  required_value jsonb,
  observed_value jsonb,
  confidence numeric,
  evidence jsonb,                        -- {document_id, page, bbox, observation_ids}
  corrective_action text,
  produced_by jsonb not null,            -- {engine: string|null, model: string|null}
  created_at timestamptz not null default now(),
  -- §1.2: a finding produced by a model without the engine is a defect.
  constraint findings_engine_required check (produced_by ? 'engine' and produced_by ->> 'engine' is not null)
);

-- ------------------------------------------------------------- escalations
create table public.escalations (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications (id) on delete cascade,
  rule_id text not null,
  reason text not null,
  context jsonb,
  status text not null default 'open' check (status in ('open', 'resolved')),
  resolved_by uuid references public.profiles (id),
  resolution_reason text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

-- --------------------------------------------------------------- decisions
create table public.decisions (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications (id) on delete cascade,
  officer_id uuid not null references public.profiles (id),
  outcome public.application_status not null check (
    outcome in ('APPROVED', 'APPROVED_WITH_CONDITIONS', 'AMENDMENT_REQUESTED', 'REJECTED')
  ),
  conditions jsonb not null default '[]'::jsonb,
  letter_md text not null default '',
  created_at timestamptz not null default now()
);

-- --------------------------------------------------------------- audit_log
-- §1.5 append-only, enforced at the database level.
create table public.audit_log (
  id bigint generated always as identity primary key,
  application_id uuid references public.applications (id) on delete set null,
  actor_type public.actor_type not null,
  actor_id text,                          -- profile uuid for humans, agent name otherwise
  action text not null,
  detail jsonb not null default '{}'::jsonb,
  model_version text,
  rule_version text,
  tokens jsonb,                           -- {input, output} accounting from the gateway
  created_at timestamptz not null default now()
);

create trigger audit_log_append_only
  before update or delete on public.audit_log
  for each row execute function public.reject_mutation();

-- -------------------------------------------------------------------- jobs
create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications (id) on delete cascade,
  stage public.pipeline_stage not null,
  status public.job_status not null default 'queued',
  attempts int not null default 0,
  max_attempts int not null default 3,
  last_error text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------- RLS
alter table public.profiles enable row level security;
alter table public.applications enable row level security;
alter table public.documents enable row level security;
alter table public.signboard_observations enable row level security;
alter table public.rules enable row level security;
alter table public.findings enable row level security;
alter table public.escalations enable row level security;
alter table public.decisions enable row level security;
alter table public.audit_log enable row level security;
alter table public.jobs enable row level security;

-- profiles: own row, officers see all
create policy profiles_select on public.profiles for select
  using (id = auth.uid() or public.current_role_is_officer());
create policy profiles_insert_self on public.profiles for insert
  with check (id = auth.uid());

-- applications
create policy applications_applicant_select on public.applications for select
  using (applicant_id = auth.uid() or public.current_role_is_officer());
create policy applications_applicant_insert on public.applications for insert
  with check (applicant_id = auth.uid());
-- USING gates which rows an applicant may touch (their own, still editable);
-- WITH CHECK additionally permits the submission transition itself, since it
-- evaluates the NEW row whose status is already SUBMITTED.
create policy applications_applicant_update on public.applications for update
  using (
    (applicant_id = auth.uid() and status in ('DRAFT', 'DEFICIENT'))
    or public.current_role_is_officer()
  )
  with check (
    (applicant_id = auth.uid() and status in ('DRAFT', 'DEFICIENT', 'SUBMITTED'))
    or public.current_role_is_officer()
  );

-- documents follow their application
create policy documents_select on public.documents for select
  using (
    exists (select 1 from public.applications a
            where a.id = application_id and a.applicant_id = auth.uid())
    or public.current_role_is_officer()
  );
create policy documents_insert on public.documents for insert
  with check (
    exists (select 1 from public.applications a
            where a.id = application_id
              and a.applicant_id = auth.uid()
              and a.status in ('DRAFT', 'DEFICIENT'))
  );

-- observations / findings / escalations / decisions: read follows the
-- application; writes come only from the worker (service role) or officers.
create policy observations_select on public.signboard_observations for select
  using (
    exists (select 1 from public.applications a
            where a.id = application_id and a.applicant_id = auth.uid())
    or public.current_role_is_officer()
  );

create policy findings_select on public.findings for select
  using (
    exists (select 1 from public.applications a
            where a.id = application_id and a.applicant_id = auth.uid())
    or public.current_role_is_officer()
  );

create policy escalations_select on public.escalations for select
  using (public.current_role_is_officer());
create policy escalations_officer_update on public.escalations for update
  using (public.current_role_is_officer());

create policy decisions_select on public.decisions for select
  using (
    exists (select 1 from public.applications a
            where a.id = application_id and a.applicant_id = auth.uid())
    or public.current_role_is_officer()
  );
create policy decisions_officer_insert on public.decisions for insert
  with check (officer_id = auth.uid() and public.current_role_is_officer());

-- audit log: readable by the case's applicant and by officers; anyone
-- authenticated may append; nobody updates or deletes (trigger + grants).
create policy audit_select on public.audit_log for select
  using (
    application_id is null
    or exists (select 1 from public.applications a
               where a.id = application_id and a.applicant_id = auth.uid())
    or public.current_role_is_officer()
  );
create policy audit_insert on public.audit_log for insert
  with check (auth.uid() is not null);

-- rules: everyone signed-in reads; inserts via service role only
create policy rules_select on public.rules for select
  using (auth.uid() is not null);

-- jobs: applicants see their case's job progress; officers see all
create policy jobs_select on public.jobs for select
  using (
    exists (select 1 from public.applications a
            where a.id = application_id and a.applicant_id = auth.uid())
    or public.current_role_is_officer()
  );

-- -------------------------------------------------------------- storage
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

create policy documents_bucket_rw on storage.objects for all
  using (
    bucket_id = 'documents'
    and (
      (auth.uid())::text = (storage.foldername(name))[1]
      or public.current_role_is_officer()
    )
  )
  with check (
    bucket_id = 'documents'
    and (auth.uid())::text = (storage.foldername(name))[1]
  );

-- ------------------------------------------------------------------ grants
-- This CLI version does not auto-grant DML on migration-created tables, so
-- be explicit. RLS still governs row access for authenticated users.
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant all privileges on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;

-- Append-only means no update/delete privilege at all for API roles; the
-- reject_mutation trigger then also stops the service role and direct SQL.
revoke update, delete on public.audit_log from anon, authenticated;
revoke update, delete on public.rules from anon, authenticated;
