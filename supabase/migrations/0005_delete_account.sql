-- Self-serve account deletion.
--
-- The client can already delete its own rows (the owner RLS policy covers
-- DELETE), but it cannot remove the login itself: auth.users is not reachable
-- with the publishable key. Without that step a "deleted" account would still
-- occupy its email address, so signing up again with it would fail.
--
-- This function is the one privileged operation in the schema. It is SECURITY
-- DEFINER because it writes to auth.users, so it re-checks both things RLS
-- would have enforced: an authenticated caller, and an aal2 (TOTP-verified)
-- session. It deletes only the caller's own row, which cascades through every
-- table in 0001/0004 (all of them reference auth.users on delete cascade).

create or replace function public.delete_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'delete_account: not authenticated';
  end if;
  if (select auth.jwt() ->> 'aal') is distinct from 'aal2' then
    raise exception 'delete_account: aal2 required';
  end if;
  delete from auth.users where id = (select auth.uid());
end
$$;

revoke all on function public.delete_account() from public, anon;
grant execute on function public.delete_account() to authenticated;
