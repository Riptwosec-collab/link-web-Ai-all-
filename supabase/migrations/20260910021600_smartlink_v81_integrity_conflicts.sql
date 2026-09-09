-- V8.1 reliability: backup verification, optimistic concurrency, live change feed, integrity and import preflight.
alter table public.smartlink_backups add column if not exists checksum text;
alter table public.smartlink_backups add column if not exists verified_at timestamptz;

create or replace function public._smartlink_backup_stamp()
returns trigger language plpgsql security definer set search_path to '' as $$
begin
  new.checksum:=encode(extensions.digest(convert_to(coalesce(new.snapshot,'[]'::jsonb)::text,'UTF8'),'sha256'),'hex');
  new.verified_at:=now();return new;
end $$;
drop trigger if exists smartlink_backup_stamp on public.smartlink_backups;
create trigger smartlink_backup_stamp before insert or update of snapshot on public.smartlink_backups for each row execute function public._smartlink_backup_stamp();
update public.smartlink_backups set snapshot=snapshot where checksum is null or verified_at is null;
create index if not exists smartlink_links_profile_updated_idx on public.smartlink_links(profile_id,updated_at desc);

create or replace function public.smartlink_link_update_v2(p_token text,p_id text,p_patch jsonb,p_expected_version bigint default null,p_request_id text default null)
returns setof public.smartlink_links language plpgsql security definer set search_path to '' as $$
declare v_profile_id uuid;v_current bigint;
begin
 v_profile_id:=public._smartlink_profile_from_token(p_token);select l.version into v_current from public.smartlink_links l where l.profile_id=v_profile_id and l.id=p_id and l.deleted_at is null for update;
 if v_current is null then raise exception 'link_not_found' using errcode='P0002';end if;if p_expected_version is not null and v_current<>p_expected_version then raise exception 'version_conflict:%',v_current using errcode='40001';end if;
 return query select * from public.smartlink_link_update(p_token,p_id,p_patch,p_request_id);
end $$;
create or replace function public.smartlink_link_delete_v2(p_token text,p_id text,p_expected_version bigint default null,p_request_id text default null)
returns setof public.smartlink_links language plpgsql security definer set search_path to '' as $$
declare v_profile_id uuid;v_current bigint;
begin
 v_profile_id:=public._smartlink_profile_from_token(p_token);select l.version into v_current from public.smartlink_links l where l.profile_id=v_profile_id and l.id=p_id and l.deleted_at is null for update;
 if v_current is null then raise exception 'link_not_found' using errcode='P0002';end if;if p_expected_version is not null and v_current<>p_expected_version then raise exception 'version_conflict:%',v_current using errcode='40001';end if;
 return query select * from public.smartlink_link_delete(p_token,p_id,p_request_id);
end $$;
create or replace function public.smartlink_link_restore_v2(p_token text,p_id text,p_expected_version bigint default null,p_request_id text default null)
returns setof public.smartlink_links language plpgsql security definer set search_path to '' as $$
declare v_profile_id uuid;v_current bigint;
begin
 v_profile_id:=public._smartlink_profile_from_token(p_token);select l.version into v_current from public.smartlink_links l where l.profile_id=v_profile_id and l.id=p_id and l.deleted_at is not null for update;
 if v_current is null then raise exception 'link_not_found' using errcode='P0002';end if;if p_expected_version is not null and v_current<>p_expected_version then raise exception 'version_conflict:%',v_current using errcode='40001';end if;
 return query select * from public.smartlink_link_restore(p_token,p_id,p_request_id);
end $$;
grant execute on function public.smartlink_link_update_v2(text,text,jsonb,bigint,text) to anon,authenticated;
grant execute on function public.smartlink_link_delete_v2(text,text,bigint,text) to anon,authenticated;
grant execute on function public.smartlink_link_restore_v2(text,text,bigint,text) to anon,authenticated;

create or replace function public.smartlink_link_changes_since(p_token text,p_since timestamptz default null,p_limit integer default 500)
returns setof public.smartlink_links language plpgsql security definer set search_path to '' as $$
declare v_profile_id uuid;
begin v_profile_id:=public._smartlink_profile_from_token(p_token);return query select l.* from public.smartlink_links l where l.profile_id=v_profile_id and (p_since is null or l.updated_at>p_since) order by l.updated_at asc limit greatest(1,least(coalesce(p_limit,500),1000));end $$;
grant execute on function public.smartlink_link_changes_since(text,timestamptz,integer) to anon,authenticated;

create or replace function public.smartlink_integrity_status(p_token text)
returns table(live_links bigint,deleted_links bigint,history_records bigint,duplicate_groups bigint,orphan_history bigint,backup_count bigint,last_backup_at timestamptz,last_write_at timestamptz,checksum_failures bigint,storage_mode text)
language plpgsql security definer set search_path to '' as $$
declare v_profile_id uuid;
begin
 v_profile_id:=public._smartlink_profile_from_token(p_token);
 return query select
 (select count(*) from public.smartlink_links l where l.profile_id=v_profile_id and l.deleted_at is null),
 (select count(*) from public.smartlink_links l where l.profile_id=v_profile_id and l.deleted_at is not null),
 (select count(*) from public.smartlink_link_history h where h.profile_id=v_profile_id),
 (select count(*) from (select normalized_url from public.smartlink_links l where l.profile_id=v_profile_id and l.deleted_at is null group by normalized_url having count(*)>1) d),
 (select count(*) from public.smartlink_link_history h where h.profile_id=v_profile_id and not exists(select 1 from public.smartlink_links l where l.profile_id=v_profile_id and l.id=h.link_id)),
 (select count(*) from public.smartlink_backups b where b.profile_id=v_profile_id),(select max(b.created_at) from public.smartlink_backups b where b.profile_id=v_profile_id),(select max(l.updated_at) from public.smartlink_links l where l.profile_id=v_profile_id),
 (select count(*) from public.smartlink_backups b where b.profile_id=v_profile_id and b.checksum is distinct from encode(extensions.digest(convert_to(coalesce(b.snapshot,'[]'::jsonb)::text,'UTF8'),'sha256'),'hex')),
 'supabase-row-v8.1'::text;
end $$;
grant execute on function public.smartlink_integrity_status(text) to anon,authenticated;

create or replace function public.smartlink_backup_verify(p_token text,p_backup_id uuid)
returns table(ok boolean,checksum text,computed_checksum text,link_count integer,verified_at timestamptz)
language plpgsql security definer set search_path to '' as $$
declare v_profile_id uuid;
begin v_profile_id:=public._smartlink_profile_from_token(p_token);return query select b.checksum=encode(extensions.digest(convert_to(coalesce(b.snapshot,'[]'::jsonb)::text,'UTF8'),'sha256'),'hex'),b.checksum,encode(extensions.digest(convert_to(coalesce(b.snapshot,'[]'::jsonb)::text,'UTF8'),'sha256'),'hex'),b.link_count,b.verified_at from public.smartlink_backups b where b.profile_id=v_profile_id and b.id=p_backup_id;end $$;
grant execute on function public.smartlink_backup_verify(text,uuid) to anon,authenticated;

create or replace function public.smartlink_import_preview(p_token text,p_links jsonb)
returns table(input_count integer,valid_count integer,duplicate_input integer,duplicate_cloud integer)
language plpgsql security definer set search_path to '' as $$
declare v_profile_id uuid;
begin
 v_profile_id:=public._smartlink_profile_from_token(p_token);if p_links is null or jsonb_typeof(p_links)<>'array' then raise exception 'invalid_import' using errcode='22023';end if;
 return query with x as(select trim(coalesce(v->>'normalizedUrl',v->>'normalized_url',v->>'url','')) n,trim(coalesce(v->>'url','')) u from jsonb_array_elements(p_links) v),q as(select * from x where u~'^https?://' and n<>''),g as(select n,count(*) c from q group by n)
 select jsonb_array_length(p_links),(select count(*)::integer from q),(select coalesce(sum(c-1),0)::integer from g where c>1),(select count(*)::integer from (select distinct q.n from q join public.smartlink_links l on l.profile_id=v_profile_id and l.normalized_url=q.n and l.deleted_at is null) z);
end $$;
grant execute on function public.smartlink_import_preview(text,jsonb) to anon,authenticated;
