-- V8.1 permanent delete remains individual-only and requires an explicit confirmation token.
alter table public.smartlink_link_history drop constraint if exists smartlink_link_history_action_check;
alter table public.smartlink_link_history add constraint smartlink_link_history_action_check check(action in('create','update','delete','restore','backup_restore','purge'));

create or replace function public.smartlink_link_purge(p_token text,p_id text,p_expected_version bigint default null,p_confirm text default null)
returns boolean language plpgsql security definer set search_path to '' as $$
declare v_profile_id uuid;v_row public.smartlink_links%rowtype;
begin
 v_profile_id:=public._smartlink_profile_from_token(p_token);
 if p_confirm<>'PURGE' then raise exception 'purge_confirmation_required' using errcode='22023';end if;
 select * into v_row from public.smartlink_links l where l.profile_id=v_profile_id and l.id=p_id and l.deleted_at is not null for update;
 if v_row.id is null then raise exception 'deleted_link_not_found' using errcode='P0002';end if;
 if p_expected_version is not null and v_row.version<>p_expected_version then raise exception 'version_conflict:%',v_row.version using errcode='40001';end if;
 insert into public.smartlink_link_history(profile_id,link_id,action,version,snapshot,request_id) values(v_profile_id,v_row.id,'purge',v_row.version,to_jsonb(v_row),null);
 delete from public.smartlink_links where profile_id=v_profile_id and id=p_id;
 return true;
end $$;
grant execute on function public.smartlink_link_purge(text,text,bigint,text) to anon,authenticated;
