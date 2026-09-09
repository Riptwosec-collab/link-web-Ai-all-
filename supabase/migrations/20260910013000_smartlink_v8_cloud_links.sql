-- Smart Link Hub V8 data architecture
-- Links are persisted as individual Supabase rows. Browser IndexedDB is not a link database.

create table if not exists public.smartlink_links (
  id text primary key default gen_random_uuid()::text,
  profile_id uuid not null references public.smartlink_login_profiles(id) on delete cascade,
  url text not null,
  normalized_url text not null,
  title text not null default '',
  description text not null default '',
  domain text not null default '',
  category text not null default 'General',
  subcategory text not null default '',
  tags jsonb not null default '[]'::jsonb check (jsonb_typeof(tags)='array'),
  favorite boolean not null default false,
  read_later boolean not null default false,
  summary text not null default '',
  image_url text,
  favicon text,
  health_status text not null default 'unknown',
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object'),
  last_opened_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version bigint not null default 1,
  unique(profile_id,normalized_url)
);
create index if not exists smartlink_links_profile_live_idx on public.smartlink_links(profile_id,updated_at desc) where deleted_at is null;
create index if not exists smartlink_links_profile_deleted_idx on public.smartlink_links(profile_id,deleted_at desc) where deleted_at is not null;
create index if not exists smartlink_links_category_idx on public.smartlink_links(profile_id,category) where deleted_at is null;
create index if not exists smartlink_links_domain_idx on public.smartlink_links(profile_id,domain) where deleted_at is null;

create table if not exists public.smartlink_link_history (
  id bigint generated always as identity primary key,
  profile_id uuid not null references public.smartlink_login_profiles(id) on delete cascade,
  link_id text not null,
  action text not null check (action in ('create','update','delete','restore','backup_restore')),
  version bigint not null,
  snapshot jsonb not null,
  request_id text,
  changed_at timestamptz not null default now()
);
create index if not exists smartlink_link_history_profile_idx on public.smartlink_link_history(profile_id,changed_at desc);
create index if not exists smartlink_link_history_link_idx on public.smartlink_link_history(profile_id,link_id,changed_at desc);
create unique index if not exists smartlink_link_history_request_uidx on public.smartlink_link_history(profile_id,request_id) where request_id is not null;

create table if not exists public.smartlink_backups (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.smartlink_login_profiles(id) on delete cascade,
  backup_type text not null check (backup_type in ('daily','monthly','manual','pre_restore')),
  backup_key text not null,
  snapshot jsonb not null default '[]'::jsonb check (jsonb_typeof(snapshot)='array'),
  link_count integer not null default 0,
  created_at timestamptz not null default now()
);
create unique index if not exists smartlink_backups_key_uidx on public.smartlink_backups(profile_id,backup_type,backup_key);
create index if not exists smartlink_backups_profile_idx on public.smartlink_backups(profile_id,created_at desc);

alter table public.smartlink_links enable row level security;
alter table public.smartlink_link_history enable row level security;
alter table public.smartlink_backups enable row level security;
revoke all on public.smartlink_links from anon,authenticated;
revoke all on public.smartlink_link_history from anon,authenticated;
revoke all on public.smartlink_backups from anon,authenticated;

create or replace function public._smartlink_profile_from_token(p_token text)
returns uuid language plpgsql security definer set search_path to '' as $$
declare v_profile_id uuid;
begin
  select s.profile_id into v_profile_id from public.smartlink_login_sessions s
  where s.token_hash=extensions.digest(convert_to(coalesce(p_token,''),'UTF8'),'sha256') and s.expires_at>now() limit 1;
  if v_profile_id is null then raise exception 'invalid_session' using errcode='28000'; end if;
  update public.smartlink_login_sessions set last_seen_at=now()
  where token_hash=extensions.digest(convert_to(coalesce(p_token,''),'UTF8'),'sha256');
  return v_profile_id;
end $$;
revoke all on function public._smartlink_profile_from_token(text) from public,anon,authenticated;

create or replace function public._smartlink_ensure_backups(p_profile_id uuid)
returns void language plpgsql security definer set search_path to '' as $$
declare v_snapshot jsonb;v_count integer;v_day text:=to_char(now() at time zone 'UTC','YYYY-MM-DD');v_month text:=to_char(now() at time zone 'UTC','YYYY-MM');
begin
  select coalesce(jsonb_agg(to_jsonb(l) order by l.created_at),'[]'::jsonb),count(*)::integer into v_snapshot,v_count
  from public.smartlink_links l where l.profile_id=p_profile_id and l.deleted_at is null;
  insert into public.smartlink_backups(profile_id,backup_type,backup_key,snapshot,link_count) values(p_profile_id,'daily',v_day,v_snapshot,v_count) on conflict(profile_id,backup_type,backup_key) do nothing;
  insert into public.smartlink_backups(profile_id,backup_type,backup_key,snapshot,link_count) values(p_profile_id,'monthly',v_month,v_snapshot,v_count) on conflict(profile_id,backup_type,backup_key) do nothing;
  delete from public.smartlink_backups b where b.profile_id=p_profile_id and b.backup_type='daily' and b.id not in(select id from public.smartlink_backups where profile_id=p_profile_id and backup_type='daily' order by created_at desc limit 30);
  delete from public.smartlink_backups b where b.profile_id=p_profile_id and b.backup_type='monthly' and b.id not in(select id from public.smartlink_backups where profile_id=p_profile_id and backup_type='monthly' order by created_at desc limit 12);
end $$;
revoke all on function public._smartlink_ensure_backups(uuid) from public,anon,authenticated;

create or replace function public.smartlink_links_list(p_token text,p_include_deleted boolean default false)
returns setof public.smartlink_links language plpgsql security definer set search_path to '' as $$
declare v_profile_id uuid;
begin
  v_profile_id:=public._smartlink_profile_from_token(p_token);
  return query select l.* from public.smartlink_links l where l.profile_id=v_profile_id and (p_include_deleted or l.deleted_at is null) order by coalesce(l.deleted_at,l.updated_at) desc,l.created_at desc;
end $$;

create or replace function public.smartlink_link_create(p_token text,p_link jsonb,p_request_id text default null)
returns setof public.smartlink_links language plpgsql security definer set search_path to '' as $$
declare v_profile_id uuid;v_id text;v_url text;v_normalized text;v_existing_id text;v_version bigint;
begin
  v_profile_id:=public._smartlink_profile_from_token(p_token);
  if p_link is null or jsonb_typeof(p_link)<>'object' then raise exception 'invalid_link' using errcode='22023'; end if;
  if p_request_id is not null then select h.link_id into v_existing_id from public.smartlink_link_history h where h.profile_id=v_profile_id and h.request_id=p_request_id limit 1;if v_existing_id is not null then return query select l.* from public.smartlink_links l where l.profile_id=v_profile_id and l.id=v_existing_id;return;end if;end if;
  v_url:=nullif(trim(p_link->>'url'),'');v_normalized:=nullif(trim(coalesce(p_link->>'normalizedUrl',p_link->>'normalized_url')),'');if v_url is null or v_normalized is null then raise exception 'url_required' using errcode='22023';end if;
  v_id:=coalesce(nullif(p_link->>'id',''),gen_random_uuid()::text);perform public._smartlink_ensure_backups(v_profile_id);
  insert into public.smartlink_links(id,profile_id,url,normalized_url,title,description,domain,category,subcategory,tags,favorite,read_later,summary,image_url,favicon,health_status,metadata,last_opened_at,created_at,updated_at,deleted_at,version)
  values(v_id,v_profile_id,v_url,v_normalized,coalesce(p_link->>'title',''),coalesce(p_link->>'description',''),coalesce(p_link->>'domain',''),coalesce(nullif(p_link->>'category',''),'General'),coalesce(p_link->>'subcategory',''),case when jsonb_typeof(p_link->'tags')='array' then p_link->'tags' else '[]'::jsonb end,coalesce((p_link->>'favorite')::boolean,false),coalesce((p_link->>'readLater')::boolean,(p_link->>'read_later')::boolean,false),coalesce(p_link->>'summary',''),coalesce(p_link->>'imageUrl',p_link->>'image_url'),p_link->>'favicon',coalesce(p_link#>>'{health,state}',p_link->>'health_status','unknown'),coalesce(p_link->'metadata','{}'::jsonb)||jsonb_build_object('legacy',p_link-array['id','url','normalizedUrl','normalized_url','title','description','domain','category','subcategory','tags','favorite','readLater','read_later','summary','imageUrl','image_url','favicon','health','health_status','metadata','createdAt','updatedAt','deletedAt','version']),case when coalesce(p_link->>'lastOpenedAt',p_link->>'last_opened_at')~'^\d+$' then to_timestamp(coalesce(p_link->>'lastOpenedAt',p_link->>'last_opened_at')::bigint/1000.0) else null end,case when p_link->>'createdAt'~'^\d+$' then to_timestamp((p_link->>'createdAt')::bigint/1000.0) else now() end,now(),null,1)
  on conflict(profile_id,normalized_url) do update set url=excluded.url,title=case when excluded.title<>'' then excluded.title else public.smartlink_links.title end,description=case when excluded.description<>'' then excluded.description else public.smartlink_links.description end,domain=case when excluded.domain<>'' then excluded.domain else public.smartlink_links.domain end,category=case when excluded.category<>'General' then excluded.category else public.smartlink_links.category end,subcategory=case when excluded.subcategory<>'' then excluded.subcategory else public.smartlink_links.subcategory end,tags=case when jsonb_array_length(excluded.tags)>0 then excluded.tags else public.smartlink_links.tags end,favorite=excluded.favorite or public.smartlink_links.favorite,read_later=excluded.read_later or public.smartlink_links.read_later,summary=case when excluded.summary<>'' then excluded.summary else public.smartlink_links.summary end,image_url=coalesce(excluded.image_url,public.smartlink_links.image_url),favicon=coalesce(excluded.favicon,public.smartlink_links.favicon),metadata=public.smartlink_links.metadata||excluded.metadata,deleted_at=null,updated_at=now(),version=public.smartlink_links.version+1 returning id,version into v_id,v_version;
  insert into public.smartlink_link_history(profile_id,link_id,action,version,snapshot,request_id) select v_profile_id,l.id,case when l.version=1 then 'create' else 'update' end,l.version,to_jsonb(l),p_request_id from public.smartlink_links l where l.profile_id=v_profile_id and l.id=v_id on conflict(profile_id,request_id) where request_id is not null do nothing;
  return query select l.* from public.smartlink_links l where l.profile_id=v_profile_id and l.id=v_id;
end $$;

create or replace function public.smartlink_link_update(p_token text,p_id text,p_patch jsonb,p_request_id text default null)
returns setof public.smartlink_links language plpgsql security definer set search_path to '' as $$
declare v_profile_id uuid;v_existing_id text;
begin
  v_profile_id:=public._smartlink_profile_from_token(p_token);if p_patch is null or jsonb_typeof(p_patch)<>'object' then raise exception 'invalid_patch' using errcode='22023';end if;
  if p_request_id is not null then select h.link_id into v_existing_id from public.smartlink_link_history h where h.profile_id=v_profile_id and h.request_id=p_request_id limit 1;if v_existing_id is not null then return query select l.* from public.smartlink_links l where l.profile_id=v_profile_id and l.id=v_existing_id;return;end if;end if;
  perform public._smartlink_ensure_backups(v_profile_id);
  update public.smartlink_links l set url=case when p_patch?'url' then coalesce(nullif(trim(p_patch->>'url'),''),l.url) else l.url end,normalized_url=case when p_patch?'normalizedUrl' or p_patch?'normalized_url' then coalesce(nullif(trim(coalesce(p_patch->>'normalizedUrl',p_patch->>'normalized_url')),''),l.normalized_url) else l.normalized_url end,title=case when p_patch?'title' then coalesce(p_patch->>'title','') else l.title end,description=case when p_patch?'description' then coalesce(p_patch->>'description','') else l.description end,domain=case when p_patch?'domain' then coalesce(p_patch->>'domain','') else l.domain end,category=case when p_patch?'category' then coalesce(nullif(p_patch->>'category',''),'General') else l.category end,subcategory=case when p_patch?'subcategory' then coalesce(p_patch->>'subcategory','') else l.subcategory end,tags=case when p_patch?'tags' and jsonb_typeof(p_patch->'tags')='array' then p_patch->'tags' else l.tags end,favorite=case when p_patch?'favorite' then (p_patch->>'favorite')::boolean else l.favorite end,read_later=case when p_patch?'readLater' then (p_patch->>'readLater')::boolean when p_patch?'read_later' then (p_patch->>'read_later')::boolean else l.read_later end,summary=case when p_patch?'summary' then coalesce(p_patch->>'summary','') else l.summary end,image_url=case when p_patch?'imageUrl' or p_patch?'image_url' then coalesce(p_patch->>'imageUrl',p_patch->>'image_url') else l.image_url end,favicon=case when p_patch?'favicon' then p_patch->>'favicon' else l.favicon end,health_status=case when p_patch?'health' then coalesce(p_patch#>>'{health,state}',l.health_status) when p_patch?'health_status' then coalesce(p_patch->>'health_status',l.health_status) else l.health_status end,metadata=l.metadata||jsonb_build_object('lastClientPatch',p_patch),last_opened_at=case when coalesce(p_patch->>'lastOpenedAt',p_patch->>'last_opened_at')~'^\d+$' then to_timestamp(coalesce(p_patch->>'lastOpenedAt',p_patch->>'last_opened_at')::bigint/1000.0) else l.last_opened_at end,updated_at=now(),version=l.version+1 where l.profile_id=v_profile_id and l.id=p_id and l.deleted_at is null;
  if not found then raise exception 'link_not_found' using errcode='P0002';end if;
  insert into public.smartlink_link_history(profile_id,link_id,action,version,snapshot,request_id) select v_profile_id,l.id,'update',l.version,to_jsonb(l),p_request_id from public.smartlink_links l where l.profile_id=v_profile_id and l.id=p_id on conflict(profile_id,request_id) where request_id is not null do nothing;
  return query select l.* from public.smartlink_links l where l.profile_id=v_profile_id and l.id=p_id;
end $$;

create or replace function public.smartlink_link_delete(p_token text,p_id text,p_request_id text default null)
returns setof public.smartlink_links language plpgsql security definer set search_path to '' as $$
declare v_profile_id uuid;v_existing_id text;
begin
  v_profile_id:=public._smartlink_profile_from_token(p_token);if p_request_id is not null then select h.link_id into v_existing_id from public.smartlink_link_history h where h.profile_id=v_profile_id and h.request_id=p_request_id limit 1;if v_existing_id is not null then return query select l.* from public.smartlink_links l where l.profile_id=v_profile_id and l.id=v_existing_id;return;end if;end if;
  perform public._smartlink_ensure_backups(v_profile_id);update public.smartlink_links l set deleted_at=now(),updated_at=now(),version=l.version+1 where l.profile_id=v_profile_id and l.id=p_id and l.deleted_at is null;if not found then raise exception 'link_not_found' using errcode='P0002';end if;
  insert into public.smartlink_link_history(profile_id,link_id,action,version,snapshot,request_id) select v_profile_id,l.id,'delete',l.version,to_jsonb(l),p_request_id from public.smartlink_links l where l.profile_id=v_profile_id and l.id=p_id on conflict(profile_id,request_id) where request_id is not null do nothing;
  return query select l.* from public.smartlink_links l where l.profile_id=v_profile_id and l.id=p_id;
end $$;

create or replace function public.smartlink_link_restore(p_token text,p_id text,p_request_id text default null)
returns setof public.smartlink_links language plpgsql security definer set search_path to '' as $$
declare v_profile_id uuid;v_existing_id text;
begin
  v_profile_id:=public._smartlink_profile_from_token(p_token);if p_request_id is not null then select h.link_id into v_existing_id from public.smartlink_link_history h where h.profile_id=v_profile_id and h.request_id=p_request_id limit 1;if v_existing_id is not null then return query select l.* from public.smartlink_links l where l.profile_id=v_profile_id and l.id=v_existing_id;return;end if;end if;
  perform public._smartlink_ensure_backups(v_profile_id);update public.smartlink_links l set deleted_at=null,updated_at=now(),version=l.version+1 where l.profile_id=v_profile_id and l.id=p_id and l.deleted_at is not null;if not found then raise exception 'link_not_found' using errcode='P0002';end if;
  insert into public.smartlink_link_history(profile_id,link_id,action,version,snapshot,request_id) select v_profile_id,l.id,'restore',l.version,to_jsonb(l),p_request_id from public.smartlink_links l where l.profile_id=v_profile_id and l.id=p_id on conflict(profile_id,request_id) where request_id is not null do nothing;
  return query select l.* from public.smartlink_links l where l.profile_id=v_profile_id and l.id=p_id;
end $$;

create or replace function public.smartlink_link_history_list(p_token text,p_link_id text default null,p_limit integer default 200)
returns setof public.smartlink_link_history language plpgsql security definer set search_path to '' as $$
declare v_profile_id uuid;
begin v_profile_id:=public._smartlink_profile_from_token(p_token);return query select h.* from public.smartlink_link_history h where h.profile_id=v_profile_id and (p_link_id is null or h.link_id=p_link_id) order by h.changed_at desc limit greatest(1,least(coalesce(p_limit,200),1000));end $$;

create or replace function public.smartlink_backup_create(p_token text,p_label text default null)
returns setof public.smartlink_backups language plpgsql security definer set search_path to '' as $$
declare v_profile_id uuid;v_snapshot jsonb;v_count integer;v_id uuid;v_key text;
begin
  v_profile_id:=public._smartlink_profile_from_token(p_token);select coalesce(jsonb_agg(to_jsonb(l) order by l.created_at),'[]'::jsonb),count(*)::integer into v_snapshot,v_count from public.smartlink_links l where l.profile_id=v_profile_id and l.deleted_at is null;v_key:=coalesce(nullif(trim(p_label),''),'manual-'||to_char(clock_timestamp(),'YYYYMMDDHH24MISSMS'));insert into public.smartlink_backups(profile_id,backup_type,backup_key,snapshot,link_count) values(v_profile_id,'manual',v_key,v_snapshot,v_count) returning id into v_id;return query select b.* from public.smartlink_backups b where b.id=v_id;
end $$;

create or replace function public.smartlink_backups_list(p_token text,p_limit integer default 100)
returns setof public.smartlink_backups language plpgsql security definer set search_path to '' as $$
declare v_profile_id uuid;
begin v_profile_id:=public._smartlink_profile_from_token(p_token);return query select b.* from public.smartlink_backups b where b.profile_id=v_profile_id order by b.created_at desc limit greatest(1,least(coalesce(p_limit,100),500));end $$;

create or replace function public.smartlink_backup_preview(p_token text,p_backup_id uuid)
returns table(current_links integer,backup_links integer,will_restore integer,will_remove integer,will_update integer) language plpgsql security definer set search_path to '' as $$
declare v_profile_id uuid;v_snapshot jsonb;
begin
  v_profile_id:=public._smartlink_profile_from_token(p_token);select b.snapshot into v_snapshot from public.smartlink_backups b where b.profile_id=v_profile_id and b.id=p_backup_id;if v_snapshot is null then raise exception 'backup_not_found' using errcode='P0002';end if;
  return query with cur as(select l.normalized_url,to_jsonb(l) j from public.smartlink_links l where l.profile_id=v_profile_id and l.deleted_at is null),bak as(select x->>'normalized_url' normalized_url,x from jsonb_array_elements(v_snapshot)x) select(select count(*)::integer from cur),(select count(*)::integer from bak),(select count(*)::integer from bak b where not exists(select 1 from cur c where c.normalized_url=b.normalized_url)),(select count(*)::integer from cur c where not exists(select 1 from bak b where b.normalized_url=c.normalized_url)),(select count(*)::integer from bak b join cur c using(normalized_url) where b.x<>c.j);
end $$;

create or replace function public.smartlink_backup_restore(p_token text,p_backup_id uuid,p_confirm boolean default false)
returns table(restored integer,removed integer,backup_id uuid) language plpgsql security definer set search_path to '' as $$
declare v_profile_id uuid;v_snapshot jsonb;v_pre uuid;v_restored integer:=0;v_removed integer:=0;
begin
  if not p_confirm then raise exception 'restore_confirmation_required' using errcode='22023';end if;v_profile_id:=public._smartlink_profile_from_token(p_token);select b.snapshot into v_snapshot from public.smartlink_backups b where b.profile_id=v_profile_id and b.id=p_backup_id;if v_snapshot is null then raise exception 'backup_not_found' using errcode='P0002';end if;
  insert into public.smartlink_backups(profile_id,backup_type,backup_key,snapshot,link_count) select v_profile_id,'pre_restore','pre-'||to_char(clock_timestamp(),'YYYYMMDDHH24MISSMS'),coalesce(jsonb_agg(to_jsonb(l) order by l.created_at),'[]'::jsonb),count(*)::integer from public.smartlink_links l where l.profile_id=v_profile_id and l.deleted_at is null returning id into v_pre;
  update public.smartlink_links l set deleted_at=now(),updated_at=now(),version=l.version+1 where l.profile_id=v_profile_id and l.deleted_at is null and not exists(select 1 from jsonb_array_elements(v_snapshot)x where x->>'normalized_url'=l.normalized_url);get diagnostics v_removed=row_count;
  insert into public.smartlink_links(id,profile_id,url,normalized_url,title,description,domain,category,subcategory,tags,favorite,read_later,summary,image_url,favicon,health_status,metadata,last_opened_at,created_at,updated_at,deleted_at,version)
  select coalesce(nullif(x->>'id',''),gen_random_uuid()::text),v_profile_id,x->>'url',x->>'normalized_url',coalesce(x->>'title',''),coalesce(x->>'description',''),coalesce(x->>'domain',''),coalesce(nullif(x->>'category',''),'General'),coalesce(x->>'subcategory',''),coalesce(x->'tags','[]'::jsonb),coalesce((x->>'favorite')::boolean,false),coalesce((x->>'read_later')::boolean,false),coalesce(x->>'summary',''),x->>'image_url',x->>'favicon',coalesce(x->>'health_status','unknown'),coalesce(x->'metadata','{}'::jsonb),case when x->>'last_opened_at' is not null then(x->>'last_opened_at')::timestamptz else null end,coalesce((x->>'created_at')::timestamptz,now()),now(),null,coalesce((x->>'version')::bigint,1)+1 from jsonb_array_elements(v_snapshot)x
  on conflict(profile_id,normalized_url) do update set url=excluded.url,title=excluded.title,description=excluded.description,domain=excluded.domain,category=excluded.category,subcategory=excluded.subcategory,tags=excluded.tags,favorite=excluded.favorite,read_later=excluded.read_later,summary=excluded.summary,image_url=excluded.image_url,favicon=excluded.favicon,health_status=excluded.health_status,metadata=excluded.metadata,last_opened_at=excluded.last_opened_at,deleted_at=null,updated_at=now(),version=public.smartlink_links.version+1;get diagnostics v_restored=row_count;
  insert into public.smartlink_link_history(profile_id,link_id,action,version,snapshot) select v_profile_id,l.id,'backup_restore',l.version,to_jsonb(l) from public.smartlink_links l where l.profile_id=v_profile_id and l.deleted_at is null;return query select v_restored,v_removed,v_pre;
end $$;

-- Generic migration from the old JSON state. No profile ID is hard-coded.
insert into public.smartlink_links(id,profile_id,url,normalized_url,title,description,domain,category,subcategory,tags,favorite,read_later,summary,image_url,favicon,health_status,metadata,last_opened_at,created_at,updated_at,deleted_at,version)
select coalesce(nullif(x->>'id',''),gen_random_uuid()::text),c.profile_id,x->>'url',coalesce(nullif(x->>'normalizedUrl',''),nullif(x->>'normalized_url',''),regexp_replace(x->>'url','/$','')),coalesce(x->>'title',''),coalesce(x->>'description',''),coalesce(x->>'domain',''),coalesce(nullif(x->>'category',''),'General'),coalesce(x->>'subcategory',''),case when jsonb_typeof(x->'tags')='array' then x->'tags' else '[]'::jsonb end,coalesce((x->>'favorite')::boolean,false),coalesce((x->>'readLater')::boolean,false),coalesce(x->>'summary',''),coalesce(x->>'imageUrl',x->>'image_url'),x->>'favicon',coalesce(x#>>'{health,state}','unknown'),jsonb_build_object('migratedFrom','smartlink_cloud_state','legacy',x),case when x->>'lastOpenedAt'~'^\d+$' then to_timestamp((x->>'lastOpenedAt')::bigint/1000.0) else null end,case when x->>'createdAt'~'^\d+$' then to_timestamp((x->>'createdAt')::bigint/1000.0) else now() end,case when x->>'updatedAt'~'^\d+$' then to_timestamp((x->>'updatedAt')::bigint/1000.0) else now() end,null,coalesce((x->>'version')::bigint,1)
from public.smartlink_cloud_state c cross join lateral jsonb_array_elements(coalesce(c.state->'links','[]'::jsonb))x where nullif(x->>'url','') is not null on conflict(profile_id,normalized_url) do nothing;
insert into public.smartlink_link_history(profile_id,link_id,action,version,snapshot) select l.profile_id,l.id,'create',l.version,to_jsonb(l) from public.smartlink_links l where not exists(select 1 from public.smartlink_link_history h where h.profile_id=l.profile_id and h.link_id=l.id);

revoke all on function public.smartlink_links_list(text,boolean) from public;
revoke all on function public.smartlink_link_create(text,jsonb,text) from public;
revoke all on function public.smartlink_link_update(text,text,jsonb,text) from public;
revoke all on function public.smartlink_link_delete(text,text,text) from public;
revoke all on function public.smartlink_link_restore(text,text,text) from public;
revoke all on function public.smartlink_link_history_list(text,text,integer) from public;
revoke all on function public.smartlink_backup_create(text,text) from public;
revoke all on function public.smartlink_backups_list(text,integer) from public;
revoke all on function public.smartlink_backup_preview(text,uuid) from public;
revoke all on function public.smartlink_backup_restore(text,uuid,boolean) from public;
grant execute on function public.smartlink_links_list(text,boolean) to anon,authenticated;
grant execute on function public.smartlink_link_create(text,jsonb,text) to anon,authenticated;
grant execute on function public.smartlink_link_update(text,text,jsonb,text) to anon,authenticated;
grant execute on function public.smartlink_link_delete(text,text,text) to anon,authenticated;
grant execute on function public.smartlink_link_restore(text,text,text) to anon,authenticated;
grant execute on function public.smartlink_link_history_list(text,text,integer) to anon,authenticated;
grant execute on function public.smartlink_backup_create(text,text) to anon,authenticated;
grant execute on function public.smartlink_backups_list(text,integer) to anon,authenticated;
grant execute on function public.smartlink_backup_preview(text,uuid) to anon,authenticated;
grant execute on function public.smartlink_backup_restore(text,uuid,boolean) to anon,authenticated;
