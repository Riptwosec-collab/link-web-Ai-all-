-- Covers login history lookups and the profile_id foreign key.
create index if not exists smartlink_login_audit_profile_id_created_idx
  on public.smartlink_login_audit(profile_id, created_at desc);
