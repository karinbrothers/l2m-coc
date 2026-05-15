-- Migration 55: capture attestor full name + org name
-- ============================================================
-- The cert footer reads better as "Joe Smith, Acme Wool Co." than
-- as "joe@acme.com". This migration adds:
--   1. profiles.full_name — required at first login (enforced in
--      the WelcomeModal, which now blocks until set).
--   2. attested_by_name + attested_by_org_name snapshot columns
--      on every attestation-bearing row. Snapshotting means the
--      cert always reflects what was true at attestation time,
--      not what's currently in profiles/orgs.
--   3. Updated SECURITY DEFINER RPCs that accept the new params.
--   4. A set_profile_full_name RPC so the WelcomeModal/Profile
--      page can save the name without needing a broad UPDATE
--      policy on profiles.

alter table public.profiles
  add column if not exists full_name text;

alter table public.raw_material_purchases
  add column if not exists attested_by_name text,
  add column if not exists attested_by_org_name text;

alter table public.processing_batches
  add column if not exists attested_by_name text,
  add column if not exists attested_by_org_name text;

alter table public.sales
  add column if not exists attested_by_name text,
  add column if not exists attested_by_org_name text,
  add column if not exists acceptance_attested_by_name text,
  add column if not exists acceptance_attested_by_org_name text;

-- ------------------------------------------------------------
-- Updated attestation RPCs
-- ------------------------------------------------------------

create or replace function public.set_sale_attestation(
  p_sale_id uuid,
  p_attested_by uuid,
  p_attested_by_email text default null,
  p_attested_by_name text default null,
  p_attested_by_org_name text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.sales
     set attested_at = now(),
         attested_by = p_attested_by,
         attested_by_email = p_attested_by_email,
         attested_by_name = p_attested_by_name,
         attested_by_org_name = p_attested_by_org_name
   where id = p_sale_id;
end;
$$;

revoke all on function public.set_sale_attestation(uuid, uuid, text, text, text) from public;
grant execute on function public.set_sale_attestation(uuid, uuid, text, text, text) to authenticated;

create or replace function public.set_sale_acceptance_attestation(
  p_sale_id uuid,
  p_attested_by uuid,
  p_attested_by_email text default null,
  p_attested_by_name text default null,
  p_attested_by_org_name text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.sales
     set acceptance_attested_at = now(),
         acceptance_attested_by = p_attested_by,
         acceptance_attested_by_email = p_attested_by_email,
         acceptance_attested_by_name = p_attested_by_name,
         acceptance_attested_by_org_name = p_attested_by_org_name
   where id = p_sale_id;
end;
$$;

revoke all on function public.set_sale_acceptance_attestation(uuid, uuid, text, text, text) from public;
grant execute on function public.set_sale_acceptance_attestation(uuid, uuid, text, text, text) to authenticated;

create or replace function public.set_received_purchase_attestation(
  p_purchase_id uuid,
  p_attested_by uuid,
  p_attested_by_email text default null,
  p_attested_by_name text default null,
  p_attested_by_org_name text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.raw_material_purchases
     set attested_at = now(),
         attested_by = p_attested_by,
         attested_by_email = p_attested_by_email,
         attested_by_name = p_attested_by_name,
         attested_by_org_name = p_attested_by_org_name
   where id = p_purchase_id;
end;
$$;

revoke all on function public.set_received_purchase_attestation(uuid, uuid, text, text, text) from public;
grant execute on function public.set_received_purchase_attestation(uuid, uuid, text, text, text) to authenticated;

-- ------------------------------------------------------------
-- Profile name setter
-- ------------------------------------------------------------
-- The user can update their own full_name. Direct UPDATE on
-- profiles is usually limited to the owner anyway, but doing it
-- via SECURITY DEFINER means we can normalise (trim, reject
-- blanks) and keep the contract explicit.

create or replace function public.set_profile_full_name(
  p_full_name text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_clean text := trim(coalesce(p_full_name, ''));
begin
  if v_user is null then
    raise exception 'not_authenticated';
  end if;
  if length(v_clean) = 0 then
    raise exception 'name_required';
  end if;
  update public.profiles
     set full_name = v_clean
   where id = v_user;
end;
$$;

revoke all on function public.set_profile_full_name(text) from public;
grant execute on function public.set_profile_full_name(text) to authenticated;
