-- §4: the four terminal outcomes are reachable only from OFFICER_REVIEW —
-- enforce the edge in the database alongside the human-actor requirement.
create or replace function public.enforce_human_terminal_transition()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status in ('APPROVED', 'APPROVED_WITH_CONDITIONS', 'AMENDMENT_REQUESTED', 'REJECTED')
     and new.status is distinct from old.status then
    if auth.uid() is null or not public.current_role_is_officer() then
      raise exception 'terminal status % may only be set by a human officer', new.status
        using errcode = 'P0001';
    end if;
    if old.status <> 'OFFICER_REVIEW' then
      raise exception 'terminal status % is only reachable from OFFICER_REVIEW, not %',
        new.status, old.status using errcode = 'P0001';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
