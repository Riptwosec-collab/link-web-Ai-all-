-- V8.1 bounded runtime observability for custom session-token auth.
create table if not exists public.smartlink_runtime_events(
 id bigint generated always as identity primary key,
 profile_id uuid not null references public.smartlink_login_profiles(id) on delete cascade,
 event_type text not null,
 level text not null default 'info' check(level in('info','warn','error')),
 detail jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
create index if not exists smartlink_runtime_events_profile_idx on public.smartlink_runtime_events(profile_id,created_at desc);
alter table public.smartlink_runtime_events enable row level security;
revoke all on public.smartlink_runtime_events from anon,authenticated;

create or replace function public.smartlink_runtime_event_put(p_token text,p_event_type text,p_level text default 'info',p_detail jsonb default '{}'::jsonb)
returns boolean language plpgsql security definer set search_path to '' as $$
declare v_profile_id uuid;v_level text:=lower(coalesce(p_level,'info'));
begin
 v_profile_id:=public._smartlink_profile_from_token(p_token);if v_level not in('info','warn','error') then v_level:='info';end if;
 insert into public.smartlink_runtime_events(profile_id,event_type,level,detail) values(v_profile_id,left(coalesce(nullif(trim(p_event_type),''),'event'),100),v_level,coalesce(p_detail,'{}'::jsonb));
 delete from public.smartlink_runtime_events e where e.profile_id=v_profile_id and e.id not in(select id from public.smartlink_runtime_events where profile_id=v_profile_id order by created_at desc limit 1000);
 return true;
end $$;

create or replace function public.smartlink_runtime_events_list(p_token text,p_limit integer default 100)
returns setof public.smartlink_runtime_events language plpgsql security definer set search_path to '' as $$
declare v_profile_id uuid;
begin v_profile_id:=public._smartlink_profile_from_token(p_token);return query select e.* from public.smartlink_runtime_events e where e.profile_id=v_profile_id order by e.created_at desc limit greatest(1,least(coalesce(p_limit,100),500));end $$;

grant execute on function public.smartlink_runtime_event_put(text,text,text,jsonb) to anon,authenticated;
grant execute on function public.smartlink_runtime_events_list(text,integer) to anon,authenticated;
