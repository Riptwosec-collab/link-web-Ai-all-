-- Smart Link Hub V8.1 auth identity migration.
-- Credential hashes are deliberately NOT stored in source control. Production credential rotation is performed out-of-band.

alter table public.smartlink_login_profiles drop constraint if exists smartlink_login_profiles_username_key_check;
update public.smartlink_login_profiles set username_key='meka',display_name='Meka',failed_attempts=0,locked_until=null,updated_at=now() where username_key='mek';
alter table public.smartlink_login_profiles add constraint smartlink_login_profiles_username_key_check check (username_key='meka');

-- Revoke old sessions when the profile identity changes.
delete from public.smartlink_login_sessions s using public.smartlink_login_profiles p where s.profile_id=p.id and p.username_key='meka';

create or replace function public.smartlink_login(p_username text,p_pin text)
returns table(profile_id uuid,display_name text,session_token text,expires_at timestamptz,error_code text)
language plpgsql security definer set search_path to '' as $$
declare v_key text:=lower(btrim(coalesce(p_username,'')));v_profile public.smartlink_login_profiles%rowtype;v_token text;v_expires timestamptz;v_attempts integer;
begin
  if p_pin !~ '^[0-9]{6}$' then return query select null::uuid,null::text,null::text,null::timestamptz,'invalid_credentials'::text;return;end if;
  select * into v_profile from public.smartlink_login_profiles p where p.username_key=v_key for update;
  if v_profile.id is null then return query select null::uuid,null::text,null::text,null::timestamptz,'invalid_credentials'::text;return;end if;
  if v_profile.locked_until is not null and v_profile.locked_until>now() then return query select null::uuid,null::text,null::text,v_profile.locked_until,'try_later'::text;return;end if;
  if extensions.crypt(p_pin,v_profile.pin_hash)<>v_profile.pin_hash then
    v_attempts:=v_profile.failed_attempts+1;
    update public.smartlink_login_profiles set failed_attempts=case when v_attempts>=5 then 0 else v_attempts end,locked_until=case when v_attempts>=5 then now()+interval '10 minutes' else null end,updated_at=now() where id=v_profile.id;
    return query select null::uuid,null::text,null::text,null::timestamptz,'invalid_credentials'::text;return;
  end if;
  v_token:=encode(extensions.gen_random_bytes(32),'hex');v_expires:=now()+interval '90 days';
  insert into public.smartlink_login_sessions(profile_id,token_hash,expires_at) values(v_profile.id,extensions.digest(v_token,'sha256'),v_expires);
  delete from public.smartlink_login_sessions s where s.profile_id=v_profile.id and (s.expires_at<=now() or s.created_at<now()-interval '90 days');
  update public.smartlink_login_profiles set failed_attempts=0,locked_until=null,last_signed_in_at=now(),updated_at=now() where id=v_profile.id;
  return query select v_profile.id,v_profile.display_name,v_token,v_expires,null::text;
end $$;

create or replace function public.smartlink_login_v2(p_username text,p_pin text,p_device_name text default null)
returns table(profile_id uuid,display_name text,session_token text,expires_at timestamptz,error_code text)
language plpgsql security definer set search_path to '' as $$
declare v_key text:=lower(btrim(coalesce(p_username,'')));v_profile public.smartlink_login_profiles%rowtype;v_token text;v_expires timestamptz;v_attempts integer;v_device text:=left(nullif(btrim(coalesce(p_device_name,'')),''),120);
begin
  select * into v_profile from public.smartlink_login_profiles p where p.username_key=v_key for update;
  if v_profile.id is null or p_pin !~ '^[0-9]{6}$' then insert into public.smartlink_login_audit(profile_id,username_key,success,device_name) values(v_profile.id,left(v_key,80),false,v_device);return query select null::uuid,null::text,null::text,null::timestamptz,'invalid_credentials'::text;return;end if;
  if v_profile.locked_until is not null and v_profile.locked_until>now() then insert into public.smartlink_login_audit(profile_id,username_key,success,device_name) values(v_profile.id,v_key,false,v_device);return query select null::uuid,null::text,null::text,v_profile.locked_until,'try_later'::text;return;end if;
  if extensions.crypt(p_pin,v_profile.pin_hash)<>v_profile.pin_hash then
    v_attempts:=v_profile.failed_attempts+1;update public.smartlink_login_profiles set failed_attempts=case when v_attempts>=5 then 0 else v_attempts end,locked_until=case when v_attempts>=5 then now()+interval '10 minutes' else null end,updated_at=now() where id=v_profile.id;
    insert into public.smartlink_login_audit(profile_id,username_key,success,device_name) values(v_profile.id,v_key,false,v_device);return query select null::uuid,null::text,null::text,null::timestamptz,'invalid_credentials'::text;return;
  end if;
  v_token:=encode(extensions.gen_random_bytes(32),'hex');v_expires:=now()+interval '90 days';
  insert into public.smartlink_login_sessions(profile_id,token_hash,expires_at,device_name) values(v_profile.id,extensions.digest(v_token,'sha256'),v_expires,v_device);
  delete from public.smartlink_login_sessions s where s.profile_id=v_profile.id and (s.expires_at<=now() or s.created_at<now()-interval '90 days');
  update public.smartlink_login_profiles set failed_attempts=0,locked_until=null,last_signed_in_at=now(),updated_at=now() where id=v_profile.id;
  insert into public.smartlink_login_audit(profile_id,username_key,success,device_name) values(v_profile.id,v_key,true,v_device);
  return query select v_profile.id,v_profile.display_name,v_token,v_expires,null::text;
end $$;

grant execute on function public.smartlink_login(text,text) to anon,authenticated;
grant execute on function public.smartlink_login_v2(text,text,text) to anon,authenticated;
