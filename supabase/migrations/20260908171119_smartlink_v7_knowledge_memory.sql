create extension if not exists vector with schema extensions;

create table if not exists public.smartlink_documents (
  profile_id uuid not null references public.smartlink_login_profiles(id) on delete cascade,
  link_id text not null,
  content text not null default '',
  markdown text not null default '',
  screenshot_data text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  content_hash text not null default '',
  updated_at timestamptz not null default now(),
  primary key (profile_id, link_id),
  constraint smartlink_documents_metadata_object check (jsonb_typeof(metadata) = 'object'),
  constraint smartlink_documents_content_limit check (length(content) <= 60000),
  constraint smartlink_documents_markdown_limit check (length(markdown) <= 60000),
  constraint smartlink_documents_screenshot_limit check (length(screenshot_data) <= 450000)
);

create table if not exists public.smartlink_embeddings (
  profile_id uuid not null references public.smartlink_login_profiles(id) on delete cascade,
  link_id text not null,
  embedding extensions.vector(1024) not null,
  model text not null default '@cf/baai/bge-m3',
  content_hash text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (profile_id, link_id),
  constraint smartlink_embeddings_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create index if not exists smartlink_embeddings_hnsw_cosine_idx
  on public.smartlink_embeddings using hnsw (embedding extensions.vector_cosine_ops);
create index if not exists smartlink_embeddings_profile_updated_idx
  on public.smartlink_embeddings(profile_id, updated_at desc);

create table if not exists public.smartlink_shares (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.smartlink_login_profiles(id) on delete cascade,
  share_token_hash bytea not null unique,
  kind text not null default 'collection',
  entity_id text not null default '',
  permission text not null default 'viewer',
  payload jsonb not null default '{}'::jsonb,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint smartlink_shares_payload_object check (jsonb_typeof(payload) = 'object'),
  constraint smartlink_shares_permission_check check (permission in ('viewer','editor'))
);
create index if not exists smartlink_shares_profile_created_idx
  on public.smartlink_shares(profile_id, created_at desc);
create index if not exists smartlink_shares_expiry_idx
  on public.smartlink_shares(expires_at) where revoked_at is null;

alter table public.smartlink_documents enable row level security;
alter table public.smartlink_embeddings enable row level security;
alter table public.smartlink_shares enable row level security;
revoke all on table public.smartlink_documents from public, anon, authenticated;
revoke all on table public.smartlink_embeddings from public, anon, authenticated;
revoke all on table public.smartlink_shares from public, anon, authenticated;
create policy smartlink_documents_direct_api_deny on public.smartlink_documents as restrictive for all to public using (false) with check (false);
create policy smartlink_embeddings_direct_api_deny on public.smartlink_embeddings as restrictive for all to public using (false) with check (false);
create policy smartlink_shares_direct_api_deny on public.smartlink_shares as restrictive for all to public using (false) with check (false);

create or replace function public.smartlink_document_put(p_token text,p_link_id text,p_content text,p_markdown text default '',p_screenshot_data text default '',p_metadata jsonb default '{}'::jsonb,p_content_hash text default '')
returns table(updated_at timestamptz) language plpgsql security definer set search_path to '' as $$
declare v_profile_id uuid; v_now timestamptz:=now();
begin
  select s.profile_id into v_profile_id from public.smartlink_login_sessions s where s.token_hash=extensions.digest(convert_to(p_token,'UTF8'),'sha256') and s.expires_at>v_now limit 1;
  if v_profile_id is null then raise exception 'invalid_session' using errcode='28000'; end if;
  if nullif(trim(p_link_id),'') is null then raise exception 'link_id_required'; end if;
  if length(coalesce(p_content,''))>60000 or length(coalesce(p_markdown,''))>60000 or length(coalesce(p_screenshot_data,''))>450000 then raise exception 'document_too_large'; end if;
  if coalesce(jsonb_typeof(p_metadata),'object')<>'object' then raise exception 'metadata_must_be_object'; end if;
  update public.smartlink_login_sessions set last_seen_at=v_now where token_hash=extensions.digest(convert_to(p_token,'UTF8'),'sha256');
  insert into public.smartlink_documents(profile_id,link_id,content,markdown,screenshot_data,metadata,content_hash,updated_at)
  values(v_profile_id,p_link_id,coalesce(p_content,''),coalesce(p_markdown,''),coalesce(p_screenshot_data,''),coalesce(p_metadata,'{}'::jsonb),coalesce(p_content_hash,''),v_now)
  on conflict(profile_id,link_id) do update set content=excluded.content,markdown=excluded.markdown,screenshot_data=excluded.screenshot_data,metadata=excluded.metadata,content_hash=excluded.content_hash,updated_at=excluded.updated_at;
  return query select v_now;
end $$;

create or replace function public.smartlink_document_get(p_token text,p_link_id text)
returns table(link_id text,content text,markdown text,screenshot_data text,metadata jsonb,content_hash text,updated_at timestamptz)
language plpgsql security definer set search_path to '' as $$
declare v_profile_id uuid;
begin
  select s.profile_id into v_profile_id from public.smartlink_login_sessions s where s.token_hash=extensions.digest(convert_to(p_token,'UTF8'),'sha256') and s.expires_at>now() limit 1;
  if v_profile_id is null then raise exception 'invalid_session' using errcode='28000'; end if;
  return query select d.link_id,d.content,d.markdown,d.screenshot_data,d.metadata,d.content_hash,d.updated_at from public.smartlink_documents d where d.profile_id=v_profile_id and d.link_id=p_link_id limit 1;
end $$;

create or replace function public.smartlink_document_delete(p_token text,p_link_id text)
returns boolean language plpgsql security definer set search_path to '' as $$
declare v_profile_id uuid; v_count int;
begin
  select s.profile_id into v_profile_id from public.smartlink_login_sessions s where s.token_hash=extensions.digest(convert_to(p_token,'UTF8'),'sha256') and s.expires_at>now() limit 1;
  if v_profile_id is null then raise exception 'invalid_session' using errcode='28000'; end if;
  delete from public.smartlink_documents where profile_id=v_profile_id and link_id=p_link_id; get diagnostics v_count=row_count;
  delete from public.smartlink_embeddings where profile_id=v_profile_id and link_id=p_link_id;
  return v_count>0;
end $$;

create or replace function public.smartlink_embedding_put(p_token text,p_link_id text,p_embedding text,p_content_hash text default '',p_model text default '@cf/baai/bge-m3',p_metadata jsonb default '{}'::jsonb)
returns table(updated_at timestamptz) language plpgsql security definer set search_path to '' as $$
declare v_profile_id uuid; v_now timestamptz:=now(); v_embedding extensions.vector(1024);
begin
  select s.profile_id into v_profile_id from public.smartlink_login_sessions s where s.token_hash=extensions.digest(convert_to(p_token,'UTF8'),'sha256') and s.expires_at>v_now limit 1;
  if v_profile_id is null then raise exception 'invalid_session' using errcode='28000'; end if;
  if nullif(trim(p_link_id),'') is null then raise exception 'link_id_required'; end if;
  v_embedding:=p_embedding::extensions.vector(1024);
  insert into public.smartlink_embeddings(profile_id,link_id,embedding,model,content_hash,metadata,updated_at)
  values(v_profile_id,p_link_id,v_embedding,left(coalesce(p_model,'@cf/baai/bge-m3'),120),left(coalesce(p_content_hash,''),128),coalesce(p_metadata,'{}'::jsonb),v_now)
  on conflict(profile_id,link_id) do update set embedding=excluded.embedding,model=excluded.model,content_hash=excluded.content_hash,metadata=excluded.metadata,updated_at=excluded.updated_at;
  return query select v_now;
end $$;

create or replace function public.smartlink_semantic_search(p_token text,p_embedding text,p_limit integer default 20,p_threshold real default 0.35)
returns table(link_id text,similarity real,metadata jsonb) language plpgsql security definer set search_path to '' as $$
declare v_profile_id uuid; v_embedding extensions.vector(1024); v_limit int;
begin
  select s.profile_id into v_profile_id from public.smartlink_login_sessions s where s.token_hash=extensions.digest(convert_to(p_token,'UTF8'),'sha256') and s.expires_at>now() limit 1;
  if v_profile_id is null then raise exception 'invalid_session' using errcode='28000'; end if;
  v_embedding:=p_embedding::extensions.vector(1024); v_limit:=least(greatest(coalesce(p_limit,20),1),100);
  return query select e.link_id,(1-(e.embedding<=>v_embedding))::real,e.metadata from public.smartlink_embeddings e where e.profile_id=v_profile_id and (1-(e.embedding<=>v_embedding))>=greatest(least(coalesce(p_threshold,.35),1),-1) order by e.embedding<=>v_embedding limit v_limit;
end $$;

create or replace function public.smartlink_share_create(p_token text,p_kind text,p_entity_id text,p_payload jsonb,p_expires_days integer default 30,p_permission text default 'viewer')
returns table(share_token text,expires_at timestamptz) language plpgsql security definer set search_path to '' as $$
declare v_profile_id uuid;v_token text;v_expires timestamptz;v_permission text;
begin
  select s.profile_id into v_profile_id from public.smartlink_login_sessions s where s.token_hash=extensions.digest(convert_to(p_token,'UTF8'),'sha256') and s.expires_at>now() limit 1;
  if v_profile_id is null then raise exception 'invalid_session' using errcode='28000'; end if;
  if coalesce(jsonb_typeof(p_payload),'')<>'object' then raise exception 'payload_must_be_object'; end if;
  if length(p_payload::text)>500000 then raise exception 'share_payload_too_large'; end if;
  v_permission:=case when p_permission='editor' then 'editor' else 'viewer' end;
  v_token:=encode(extensions.gen_random_bytes(24),'hex');
  v_expires:=case when coalesce(p_expires_days,30)<=0 then null else now()+make_interval(days=>least(p_expires_days,365)) end;
  insert into public.smartlink_shares(profile_id,share_token_hash,kind,entity_id,permission,payload,expires_at) values(v_profile_id,extensions.digest(convert_to(v_token,'UTF8'),'sha256'),left(coalesce(p_kind,'collection'),40),left(coalesce(p_entity_id,''),200),v_permission,p_payload,v_expires);
  return query select v_token,v_expires;
end $$;

create or replace function public.smartlink_share_get(p_share_token text)
returns table(kind text,entity_id text,permission text,payload jsonb,expires_at timestamptz,created_at timestamptz)
language sql security definer set search_path to '' as $$ select s.kind,s.entity_id,s.permission,s.payload,s.expires_at,s.created_at from public.smartlink_shares s where s.share_token_hash=extensions.digest(convert_to(p_share_token,'UTF8'),'sha256') and s.revoked_at is null and (s.expires_at is null or s.expires_at>now()) limit 1 $$;

create or replace function public.smartlink_share_revoke(p_token text,p_share_token text)
returns boolean language plpgsql security definer set search_path to '' as $$
declare v_profile_id uuid;v_count int;
begin
  select s.profile_id into v_profile_id from public.smartlink_login_sessions s where s.token_hash=extensions.digest(convert_to(p_token,'UTF8'),'sha256') and s.expires_at>now() limit 1;
  if v_profile_id is null then raise exception 'invalid_session' using errcode='28000'; end if;
  update public.smartlink_shares set revoked_at=now() where profile_id=v_profile_id and share_token_hash=extensions.digest(convert_to(p_share_token,'UTF8'),'sha256') and revoked_at is null;get diagnostics v_count=row_count;return v_count>0;
end $$;

revoke all on function public.smartlink_document_put(text,text,text,text,text,jsonb,text) from public,authenticated;
revoke all on function public.smartlink_document_get(text,text) from public,authenticated;
revoke all on function public.smartlink_document_delete(text,text) from public,authenticated;
revoke all on function public.smartlink_embedding_put(text,text,text,text,text,jsonb) from public,authenticated;
revoke all on function public.smartlink_semantic_search(text,text,integer,real) from public,authenticated;
revoke all on function public.smartlink_share_create(text,text,text,jsonb,integer,text) from public,authenticated;
revoke all on function public.smartlink_share_get(text) from public,authenticated;
revoke all on function public.smartlink_share_revoke(text,text) from public,authenticated;
grant execute on function public.smartlink_document_put(text,text,text,text,text,jsonb,text) to anon;
grant execute on function public.smartlink_document_get(text,text) to anon;
grant execute on function public.smartlink_document_delete(text,text) to anon;
grant execute on function public.smartlink_embedding_put(text,text,text,text,text,jsonb) to anon;
grant execute on function public.smartlink_semantic_search(text,text,integer,real) to anon;
grant execute on function public.smartlink_share_create(text,text,text,jsonb,integer,text) to anon;
grant execute on function public.smartlink_share_get(text) to anon;
grant execute on function public.smartlink_share_revoke(text,text) to anon;