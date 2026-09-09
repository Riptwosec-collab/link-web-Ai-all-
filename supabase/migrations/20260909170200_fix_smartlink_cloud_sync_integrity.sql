-- Smart Link Hub cloud persistence repair.
-- Root causes fixed:
-- 1) BEFORE UPDATE history trigger returned OLD, cancelling every cloud-state update.
-- 2) smartlink_state_put_v2 used an ambiguous revision reference on UPDATE.
-- 3) Cloud writes had no server-side guard against catastrophic state shrink.

create or replace function smartlink_private.archive_cloud_state_before_change()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
  insert into public.smartlink_cloud_state_history(profile_id, revision, state, archived_at)
  values (old.profile_id, old.revision, old.state, now())
  on conflict (profile_id, revision) do nothing;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$function$;

create or replace function public.smartlink_state_put_v2(
  p_token text,
  p_state jsonb,
  p_expected_revision bigint default 0
)
returns table(revision bigint, updated_at timestamptz, conflict boolean)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_profile_id uuid;
  v_revision bigint;
  v_updated timestamptz;
  v_current_state jsonb;
  v_current_links integer := 0;
  v_next_links integer := 0;
  v_link_tombstones integer := 0;
begin
  if p_state is null or jsonb_typeof(p_state) <> 'object' then
    raise exception 'invalid_state' using errcode='22023';
  end if;

  select s.profile_id into v_profile_id
  from public.smartlink_login_sessions s
  where s.token_hash=extensions.digest(convert_to(coalesce(p_token,''),'UTF8'),'sha256')
    and s.expires_at>now()
  limit 1;

  if v_profile_id is null then
    raise exception 'invalid_session' using errcode='28000';
  end if;

  update public.smartlink_login_sessions
  set last_seen_at=now()
  where token_hash=extensions.digest(convert_to(coalesce(p_token,''),'UTF8'),'sha256');

  select c.revision,c.updated_at,c.state
  into v_revision,v_updated,v_current_state
  from public.smartlink_cloud_state c
  where c.profile_id=v_profile_id
  for update;

  if v_revision is null then
    if coalesce(p_expected_revision,0)<>0 then
      return query select 0::bigint,null::timestamptz,true;
      return;
    end if;

    insert into public.smartlink_cloud_state(profile_id,state,revision,updated_at)
    values(v_profile_id,p_state,1,now());
  else
    if v_revision<>coalesce(p_expected_revision,0) then
      return query select v_revision,v_updated,true;
      return;
    end if;

    v_current_links := jsonb_array_length(coalesce(v_current_state->'links','[]'::jsonb));
    v_next_links := jsonb_array_length(coalesce(p_state->'links','[]'::jsonb));
    select count(*)::integer into v_link_tombstones
    from jsonb_array_elements(coalesce(p_state->'tombstones','[]'::jsonb)) t
    where t->>'store'='links';

    if v_current_links >= 10
       and v_next_links < (v_current_links / 2)
       and v_link_tombstones < (v_current_links - v_next_links) then
      raise exception 'destructive_state_rejected' using errcode='22023';
    end if;

    update public.smartlink_cloud_state c
    set state=p_state,
        revision=c.revision+1,
        updated_at=now()
    where c.profile_id=v_profile_id;
  end if;

  return query
  select c.revision,c.updated_at,false
  from public.smartlink_cloud_state c
  where c.profile_id=v_profile_id;
end;
$function$;

create or replace function public.smartlink_state_put(p_token text, p_state jsonb)
returns table(revision bigint, updated_at timestamptz)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_profile_id uuid;
  v_current_state jsonb;
  v_current_links integer := 0;
  v_next_links integer := 0;
  v_link_tombstones integer := 0;
begin
  if p_state is null or jsonb_typeof(p_state) <> 'object' then
    raise exception 'invalid_state' using errcode='22023';
  end if;

  select s.profile_id into v_profile_id
  from public.smartlink_login_sessions s
  where s.token_hash = extensions.digest(convert_to(coalesce(p_token,''),'UTF8'),'sha256')
    and s.expires_at > now()
  limit 1;

  if v_profile_id is null then
    raise exception 'invalid_session' using errcode='28000';
  end if;

  update public.smartlink_login_sessions
  set last_seen_at = now()
  where token_hash = extensions.digest(convert_to(coalesce(p_token,''),'UTF8'),'sha256');

  select c.state into v_current_state
  from public.smartlink_cloud_state c
  where c.profile_id=v_profile_id
  for update;

  if v_current_state is not null then
    v_current_links := jsonb_array_length(coalesce(v_current_state->'links','[]'::jsonb));
    v_next_links := jsonb_array_length(coalesce(p_state->'links','[]'::jsonb));
    select count(*)::integer into v_link_tombstones
    from jsonb_array_elements(coalesce(p_state->'tombstones','[]'::jsonb)) t
    where t->>'store'='links';

    if v_current_links >= 10
       and v_next_links < (v_current_links / 2)
       and v_link_tombstones < (v_current_links - v_next_links) then
      raise exception 'destructive_state_rejected' using errcode='22023';
    end if;
  end if;

  insert into public.smartlink_cloud_state(profile_id,state,revision,updated_at)
  values(v_profile_id,p_state,1,now())
  on conflict(profile_id) do update
    set state = excluded.state,
        revision = public.smartlink_cloud_state.revision + 1,
        updated_at = now();

  return query
  select c.revision, c.updated_at
  from public.smartlink_cloud_state c
  where c.profile_id = v_profile_id;
end;
$function$;
