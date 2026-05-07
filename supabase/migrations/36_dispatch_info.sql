-- Migration 36: Country of dispatch + fibre diameter on certs
-- ============================================================
-- Two schema additions:
--   1. sales.country_of_dispatch — captured on the sale form,
--      surfaced on the TC in Box 4 (Country of Dispatch).
--   2. certificates.fibre_diameter_snapshot — snapshot of the
--      purchase's fibre diameter (microns) at issue time, for
--      OC Box 4. Backfilled from existing purchases.
--
-- Plus a combined SECURITY DEFINER RPC that supersedes
-- set_sale_shipping_number, letting the seller set both
-- shipping_number and country_of_dispatch in one call.

-- 1. New columns ---------------------------------------------
alter table public.sales
  add column if not exists country_of_dispatch text;

alter table public.certificates
  add column if not exists fibre_diameter_snapshot numeric;

-- 2. Backfill fibre_diameter_snapshot from existing OCs ------
update public.certificates c
   set fibre_diameter_snapshot = p.fibre_diameter
  from public.raw_material_purchases p
 where c.related_purchase_id = p.id
   and c.type = 'origin'
   and c.fibre_diameter_snapshot is null
   and p.fibre_diameter is not null;

-- 3. Combined dispatch-info setter RPC -----------------------
create or replace function public.set_sale_dispatch_info(
  p_sale_id uuid,
  p_shipping_number text,
  p_country_of_dispatch text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale_org uuid;
  v_my_org   uuid := get_my_org_id();
begin
  if v_my_org is null then
    raise exception 'no_organization';
  end if;

  select organization_id into v_sale_org from sales where id = p_sale_id;

  if v_sale_org is null then
    raise exception 'sale_not_found';
  end if;

  if v_sale_org <> v_my_org then
    raise exception 'not_authorized';
  end if;

  update sales
     set shipping_number     = nullif(trim(p_shipping_number), ''),
         country_of_dispatch = nullif(trim(p_country_of_dispatch), '')
   where id = p_sale_id;
end;
$$;

revoke all on function public.set_sale_dispatch_info(uuid, text, text) from public;
grant  execute on function public.set_sale_dispatch_info(uuid, text, text) to authenticated;