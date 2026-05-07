-- Migration 42: fix user_can_see_cert column reference
-- ============================================================
-- Migration 41 referenced certificates.organization_id, which
-- doesn't exist on this schema (certs derive their owning org
-- via related_purchase_id → raw_material_purchases.org_id, or
-- related_transaction_id → sales.organization_id).
--
-- Fix: remove the organization_id reference and use the joins
-- through the related purchase / sale instead.

create or replace function public.user_can_see_cert(p_cert_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_my_org           uuid := get_my_org_id();
  v_cert_type        text;
  v_related_sale     uuid;
  v_related_purchase uuid;
  v_found            boolean;
begin
  if is_admin() then return true; end if;
  if v_my_org is null then return false; end if;

  select type::text, related_transaction_id, related_purchase_id
    into v_cert_type, v_related_sale, v_related_purchase
    from certificates where id = p_cert_id;

  if v_cert_type is null then return false; end if;

  -- Transaction certs: visible if user is in the related sale,
  -- or in any sale that descends from it (downstream chain).
  if v_cert_type = 'transaction' and v_related_sale is not null then
    if exists (
      select 1 from sales
      where id = v_related_sale
        and (organization_id = v_my_org or buyer_org_id = v_my_org)
    ) then return true; end if;

    with recursive descendants as (
      select v_related_sale as sale_id, 0 as depth
      union all
      select s.id, d.depth + 1
      from descendants d
      join raw_material_purchases p on p.source_sale_id = d.sale_id
      join processing_batch_inputs bi on bi.source_id = p.id
      join inventory_lots l on l.processing_batch_id = bi.processing_batch_id
      join sales s on s.inventory_lot_id = l.id
      where d.depth < 50
    )
    select exists (
      select 1 from descendants d
      join sales s on s.id = d.sale_id
      where s.organization_id = v_my_org
         or s.buyer_org_id = v_my_org
    ) into v_found;

    if v_found then return true; end if;
  end if;

  -- Origin certs: visible if user owns the related purchase
  -- (the FSP that bought from the landbase), or if any TC that
  -- uses this OC is visible to them via the chain.
  if v_cert_type = 'origin' then
    if v_related_purchase is not null and exists (
      select 1 from raw_material_purchases
      where id = v_related_purchase
        and organization_id = v_my_org
    ) then return true; end if;

    if exists (
      select 1
      from certificate_origin_links col
      join certificates tc on tc.id = col.transaction_certificate_id
      join sales s on s.id = tc.related_transaction_id
      where col.origin_certificate_id = p_cert_id
        and (s.organization_id = v_my_org or s.buyer_org_id = v_my_org)
    ) then return true; end if;
  end if;

  return false;
end;
$$;