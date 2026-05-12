-- Migration 50: admin cert void capability
-- ============================================================
-- Lets an admin mark a certificate as voided when something
-- catastrophic happens after issuance (wrong volume agreed,
-- fraudulent purchase exposed, etc).
--
-- Voided certs are NOT deleted — they stay queryable for audit.
-- The cert detail page renders a VOIDED banner with the reason
-- when voided_at is non-null.

alter table public.certificates
  add column if not exists voided_at  timestamptz,
  add column if not exists voided_by  uuid references auth.users(id),
  add column if not exists void_reason text;

create or replace function public.admin_void_certificate(
  p_cert_id uuid,
  p_reason  text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if not is_admin() then
    raise exception 'admin_only';
  end if;
  if v_user_id is null then
    raise exception 'no_user';
  end if;
  if p_reason is null or trim(p_reason) = '' then
    raise exception 'reason_required';
  end if;

  if not exists (select 1 from certificates where id = p_cert_id) then
    raise exception 'cert_not_found';
  end if;

  update certificates
     set voided_at   = now(),
         voided_by   = v_user_id,
         void_reason = trim(p_reason)
   where id = p_cert_id;
end;
$$;

-- Optional reverse — un-void a cert (in case admin makes a mistake)
create or replace function public.admin_unvoid_certificate(
  p_cert_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'admin_only';
  end if;
  update certificates
     set voided_at   = null,
         voided_by   = null,
         void_reason = null
   where id = p_cert_id;
end;
$$;

revoke all on function public.admin_void_certificate(uuid, text)  from public;
revoke all on function public.admin_unvoid_certificate(uuid)      from public;
grant  execute on function public.admin_void_certificate(uuid, text)  to authenticated;
grant  execute on function public.admin_unvoid_certificate(uuid)      to authenticated;