-- V8 owns links in public.smartlink_links. The legacy JSON state remains only for non-link UI/settings data.
-- Old clients cannot repopulate or erase the V8 row store because link-shaped fields are stripped server-side.

create or replace function public.smartlink_state_put(p_token text,p_state jsonb)
returns table(revision bigint,updated_at timestamptz)
language plpgsql security definer set search_path to '' as $$
declare v_profile_id uuid;v_safe_state jsonb;
begin
  if p_state is null or jsonb_typeof(p_state)<>'object' then raise exception 'invalid_state' using errcode='22023';end if;
  v_profile_id:=public._smartlink_profile_from_token(p_token);
  v_safe_state:=jsonb_set(jsonb_set(jsonb_set(p_state,'{links}','[]'::jsonb,true),'{trash}','[]'::jsonb,true),'{tombstones}','[]'::jsonb,true) || jsonb_build_object('version',8,'storageMode','supabase-row-v8');
  insert into public.smartlink_cloud_state(profile_id,state,revision,updated_at)
  values(v_profile_id,v_safe_state,1,now())
  on conflict(profile_id) do update set state=excluded.state,revision=public.smartlink_cloud_state.revision+1,updated_at=now();
  return query select c.revision,c.updated_at from public.smartlink_cloud_state c where c.profile_id=v_profile_id;
end $$;

create or replace function public.smartlink_state_put_v2(p_token text,p_state jsonb,p_expected_revision bigint default 0)
returns table(revision bigint,updated_at timestamptz,conflict boolean)
language plpgsql security definer set search_path to '' as $$
declare v_profile_id uuid;v_revision bigint;v_updated timestamptz;v_safe_state jsonb;
begin
  if p_state is null or jsonb_typeof(p_state)<>'object' then raise exception 'invalid_state' using errcode='22023';end if;
  v_profile_id:=public._smartlink_profile_from_token(p_token);
  v_safe_state:=jsonb_set(jsonb_set(jsonb_set(p_state,'{links}','[]'::jsonb,true),'{trash}','[]'::jsonb,true),'{tombstones}','[]'::jsonb,true) || jsonb_build_object('version',8,'storageMode','supabase-row-v8');
  select c.revision,c.updated_at into v_revision,v_updated from public.smartlink_cloud_state c where c.profile_id=v_profile_id for update;
  if v_revision is null then
    if coalesce(p_expected_revision,0)<>0 then return query select 0::bigint,null::timestamptz,true;return;end if;
    insert into public.smartlink_cloud_state(profile_id,state,revision,updated_at) values(v_profile_id,v_safe_state,1,now());
  else
    if v_revision<>coalesce(p_expected_revision,0) then return query select v_revision,v_updated,true;return;end if;
    update public.smartlink_cloud_state c set state=v_safe_state,revision=c.revision+1,updated_at=now() where c.profile_id=v_profile_id;
  end if;
  return query select c.revision,c.updated_at,false from public.smartlink_cloud_state c where c.profile_id=v_profile_id;
end $$;

revoke all on function public.smartlink_state_put(text,jsonb) from public;
revoke all on function public.smartlink_state_put_v2(text,jsonb,bigint) from public;
grant execute on function public.smartlink_state_put(text,jsonb) to anon,authenticated;
grant execute on function public.smartlink_state_put_v2(text,jsonb,bigint) to anon,authenticated;

update public.smartlink_cloud_state c
set state=jsonb_set(jsonb_set(jsonb_set(c.state,'{links}','[]'::jsonb,true),'{trash}','[]'::jsonb,true),'{tombstones}','[]'::jsonb,true) || jsonb_build_object('version',8,'storageMode','supabase-row-v8'),
    revision=c.revision+1,
    updated_at=now();
