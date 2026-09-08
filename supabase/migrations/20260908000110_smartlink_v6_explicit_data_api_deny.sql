-- Smart Link Hub V6: direct Data API access is denied.
-- The browser uses intentionally exposed RPCs, each of which validates custom credentials/session tokens.

revoke all on table public.smartlink_login_profiles from anon, authenticated;
revoke all on table public.smartlink_login_sessions from anon, authenticated;
revoke all on table public.smartlink_cloud_state from anon, authenticated;
revoke all on table public.smartlink_cloud_state_history from anon, authenticated;
revoke all on table public.smartlink_login_audit from anon, authenticated;

do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as fn
      from pg_proc p
      join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='public' and p.proname like 'smartlink_%'
  loop
    execute format('revoke execute on function %s from authenticated',r.fn);
  end loop;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'smartlink_login_profiles',
    'smartlink_login_sessions',
    'smartlink_cloud_state',
    'smartlink_cloud_state_history',
    'smartlink_login_audit'
  ]
  loop
    if not exists(
      select 1 from pg_policies
       where schemaname='public'
         and tablename=t
         and policyname='smartlink_direct_api_deny'
    ) then
      execute format(
        'create policy smartlink_direct_api_deny on public.%I as restrictive for all to anon, authenticated using (false) with check (false)',
        t
      );
    end if;
  end loop;
end $$;
