-- Migration 54: capture attestor email at attestation time
-- ============================================================
-- attested_by stores the user's UUID, which isn't human-readable
-- on a certificate. Snapshot the email at the moment of
-- attestation so the OC/TC footer can show "Attested by
-- jane@brand.com on …" without needing a join to auth.users
-- (which is locked down anyway).

alter table public.raw_material_purchases
  add column if not exists attested_by_email text;

alter table public.processing_batches
  add column if not exists attested_by_email text;

alter table public.sales
  add column if not exists attested_by_email text,
  add column if not exists acceptance_attested_by_email text;

-- Update the helper RPCs from migration 53 to accept an email.
-- Param is nullable so old callers don't break; new actions
-- pass it in.

create or replace function public.set_sale_attestation(
  p_sale_id uuid,
  p_attested_by uuid,
  p_attested_by_email text default null
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
         attested_by_email = p_attested_by_email
   where id = p_sale_id;
end;
$$;

revoke all on function public.set_sale_attestation(uuid, uuid, text) from public;
grant execute on function public.set_sale_attestation(uuid, uuid, text) to authenticated;

create or replace function public.set_sale_acceptance_attestation(
  p_sale_id uuid,
  p_attested_by uuid,
  p_attested_by_email text default null
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
         acceptance_attested_by_email = p_attested_by_email
   where id = p_sale_id;
end;
$$;

revoke all on function public.set_sale_acceptance_attestation(uuid, uuid, text) from public;
grant execute on function public.set_sale_acceptance_attestation(uuid, uuid, text) to authenticated;

create or replace function public.set_received_purchase_attestation(
  p_purchase_id uuid,
  p_attested_by uuid,
  p_attested_by_email text default null
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
         attested_by_email = p_attested_by_email
   where id = p_purchase_id;
end;
$$;

revoke all on function public.set_received_purchase_attestation(uuid, uuid, text) from public;
grant execute on function public.set_received_purchase_attestation(uuid, uuid, text) to authenticated;