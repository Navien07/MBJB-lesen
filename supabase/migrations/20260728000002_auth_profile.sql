-- Auto-create a profile for every new auth user. Self-registration always
-- yields an applicant: sign-up metadata is client-controlled and must never
-- pick the role. Officers are promoted by the service role (seed script).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, role, full_name)
  values (
    new.id,
    'applicant',
    coalesce(new.raw_user_meta_data ->> 'full_name', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- No API-facing role (anon/authenticated) may ever write an officer profile,
-- regardless of RLS policy drift. Service-role and direct connections may.
create or replace function public.prevent_role_forgery()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  jwt_role text;
begin
  if new.role = 'officer' then
    jwt_role := coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '');
    if jwt_role in ('anon', 'authenticated') then
      raise exception 'officer accounts are provisioned, not self-registered';
    end if;
  end if;
  return new;
end;
$$;

create trigger profiles_role_guard
  before insert or update on public.profiles
  for each row execute function public.prevent_role_forgery();
