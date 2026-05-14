-- Migration 53: attestation columns
-- ============================================================
-- Every partner-submitted action gets an explicit attestation
-- — a checkbox the user must tick affirming the data is
-- accurate and the material has been handled in accordance with
-- the L2M Standard. The action records who attested and when.
--
-- Sales get two attestation pairs because there are two
-- decision points:
--   - seller attests at sale creation        → attested_at/by
--   - buyer attests at sale acceptance       → acceptance_attested_at/by
--
-- For received purchases (rows in raw_material_purchases that
-- the buyer auto-gains on accept_sale), attested_at/by are set
-- by the inbox acceptSale action.

alter table public.raw_material_purchases
  add column if not exists attested_at timestamptz,
  add column if not exists attested_by uuid references auth.users(id);

alter table public.processing_batches
  add column if not exists attested_at timestamptz,
  add column if not exists attested_by uuid references auth.users(id);

alter table public.sales
  add column if not exists attested_at timestamptz,
  add column if not exists attested_by uuid references auth.users(id),
  add column if not exists acceptance_attested_at timestamptz,
  add column if not exists acceptance_attested_by uuid references auth.users(id);

-- ============================================================
-- Helper RPCs
-- ------------------------------------------------------------
-- Direct UPDATEs on sales are blocked by RLS (sellers can
-- INSERT but don't have a broad UPDATE policy). Same for the
-- post-acceptance attestation done by the buyer. Two thin
-- SECURITY DEFINER functions stamp the attestation fields on
-- behalf of the calling user.

create or replace function public.set_sale_attestation(
  p_sale_id uuid,
  p_attested_by uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.sales
     set attested_at = now(),
         attested_by = p_attested_by
   where id = p_sale_id;
end;
$$;

revoke all on function public.set_sale_attestation(uuid, uuid) from public;
grant execute on function public.set_sale_attestation(uuid, uuid) to authenticated;

create or replace function public.set_sale_acceptance_attestation(
  p_sale_id uuid,
  p_attested_by uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.sales
     set acceptance_attested_at = now(),
         acceptance_attested_by = p_attested_by
   where id = p_sale_id;
end;
$$;

revoke all on function public.set_sale_acceptance_attestation(uuid, uuid) from public;
grant execute on function public.set_sale_acceptance_attestation(uuid, uuid) to authenticated;

-- Received-purchase attestation: the buyer attests when accepting
-- a sale. The received purchase row is owned by the buyer org,
-- but it was inserted by the accept_sale RPC under SECURITY
-- DEFINER, so we do the same here to be consistent.
create or replace function public.set_received_purchase_attestation(
  p_purchase_id uuid,
  p_attested_by uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.raw_material_purchases
     set attested_at = now(),
         attested_by = p_attested_by
   where id = p_purchase_id;
end;
$$;

revoke all on function public.set_received_purchase_attestation(uuid, uuid) from public;
grant execute on function public.set_received_purchase_attestation(uuid, uuid) to authenticated;