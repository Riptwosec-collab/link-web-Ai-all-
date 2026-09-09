-- Browser clients must use conflict-safe smartlink_state_put_v2.
-- The old writer has no expected-revision argument, so keep it service-role only.
revoke execute on function public.smartlink_state_put(text,jsonb) from public, anon, authenticated;
grant execute on function public.smartlink_state_put(text,jsonb) to service_role;
