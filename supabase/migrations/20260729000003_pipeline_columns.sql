-- Pipeline result columns. Written only by the worker (service role);
-- readable through the existing applications RLS policies.
alter table public.applications
  add column intake_result jsonb,
  add column copilot_result jsonb,
  add column deficiency_notice jsonb,
  add column readiness_score numeric;

create index jobs_claimable on public.jobs (created_at) where status = 'queued';
