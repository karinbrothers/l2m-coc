-- Migration 41: chain-aware cert visibility + immediate inputs
-- ============================================================
-- Two fixes wrapped into one migration:
--
-- 1. Cert detail page returns "not found" for intermediate
--    chain TCs (e.g., a buyer trying to view the cert for an
--    upstream sale they didn't directly participate in).
--    Cause: RLS on certificates restricts to the cert's owning
--    org. Fix: add a chain-visibility helper + permissive RLS
--    policy that lets a chain participant see any cert that
--    feeds into a sale they can already see.
--
-- 2. TC Box 5 ("Input Information") currently lists the landbase
--    OCs at the bottom of the chain. Per industry standard it
--    should list the IMMEDIATE upstream cert: the TC of the
--    sale that fed this batch, OR the OC if the input was a
--    direct landbase purchase. New function returns this list.
-- ============================================================

-- 1. Chain-visibility helper ---------------------------------
-- Returns true if the current user is a participant (seller
-- or buyer) of any sale that descends from the cert's sale,
-- OR the cert is owned by their org, OR they're an admin.
create or replace function public.user_can_see_cert(p_cert_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_my_org       uuid := get_my_org_id();
  v_cert_type    text;
  v_cert_org     uuid;
  v_related_sale uuid;
  v_found        boolean;
begin
  if is_admin() then return true; end if;
  if v_my_org is null then return false; end if;

  select type::text, organization_id, related_transaction_id
    into v_cert_type, v_cert_org, v_related_sale
    from certificates where id = p_cert_id;

  if v_cert_type is null then return false; end if;

  -- Cert's owning org sees it.
  if v_cert_org = v_my_org then return true; end if;

  -- TCs: visible if user is in any sale that descends from the
  -- cert's sale (forward through the batch chain), or directly
  -- a participant in the cert's sale.
  if v_cert_type = 'transaction' and v_related_sale is not null then
    if exists (
      select 1 from sales
      where id = v_related_sale
        and (organization_id = v_my_org or buyer_org_id = v_my_org)
    ) then
      return true;
    end if;

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

  -- OCs: visible if any TC that links to this OC is visible
  -- to the user (i.e., they're seller/buyer of that TC's sale).
  if v_cert_type = 'origin' then
    if exists (
      select 1
      from certificate_origin_links col
      join certificates tc on tc.id = col.transaction_certificate_id
      join sales s on s.id = tc.related_transaction_id
      where col.origin_certificate_id = p_cert_id
        and (s.organization_id = v_my_org or s.buyer_org_id = v_my_org)
    ) then
      return true;
    end if;
  end if;

  return false;
end;
$$;

revoke all on function public.user_can_see_cert(uuid) from public;
grant  execute on function public.user_can_see_cert(uuid) to authenticated;

-- Additive RLS policy: allows reads via the chain check.
-- Postgres ORs permissive SELECT policies, so this never
-- restricts what users could already see.
drop policy if exists certs_chain_select on public.certificates;
create policy certs_chain_select on public.certificates
  for select
  using (public.user_can_see_cert(id));

-- 2. Immediate inputs for a TC --------------------------------
-- Returns one row per input purchase to this TC's batch:
--   - For direct landbase purchases: the landbase's OC
--   - For received purchases (came from another sale): the
--     upstream TC for that source sale
create or replace function public.get_tc_immediate_inputs(p_tc_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_batch_id uuid;
  v_result   jsonb;
begin
  select l.processing_batch_id
    into v_batch_id
    from certificates c
    join sales s on s.id = c.related_transaction_id
    join inventory_lots l on l.id = s.inventory_lot_id
    where c.id = p_tc_id and c.type = 'transaction';

  if v_batch_id is null then
    return '[]'::jsonb;
  end if;

  select coalesce(jsonb_agg(input_obj), '[]'::jsonb)
    into v_result
  from (
    select jsonb_build_object(
      'type', case when p.source_sale_id is null then 'origin' else 'transaction' end,
      'cert_id', case when p.source_sale_id is null then oc.id else upstream_tc.id end,
      'cert_number', case when p.source_sale_id is null then oc.certificate_number else upstream_tc.certificate_number end,
      'source_label', case
        when p.source_sale_id is null then
          coalesce(lb.name, '—') ||
          coalesce(' (' || lb.country || ')', '')
        else
          'Sale ' || coalesce(upstream_sale.code, '—') ||
          ' from ' || coalesce(upstream_seller.name, '—')
      end,
      'volume_used', bi.volume_used,
      'volume_unit', p.volume_unit
    ) as input_obj
    from processing_batch_inputs bi
    join raw_material_purchases p on p.id = bi.source_id
    left join certificates oc
      on oc.related_purchase_id = p.id and oc.type = 'origin'
    left join sales upstream_sale
      on upstream_sale.id = p.source_sale_id
    left join certificates upstream_tc
      on upstream_tc.related_transaction_id = upstream_sale.id
     and upstream_tc.type = 'transaction'
    left join landbases lb on lb.id = p.landbase_id
    left join organizations upstream_seller
      on upstream_seller.id = upstream_sale.organization_id
    where bi.processing_batch_id = v_batch_id
      and bi.source_type = 'raw_purchase'
    order by bi.volume_used desc
  ) sub;

  return v_result;
end;
$$;

revoke all on function public.get_tc_immediate_inputs(uuid) from public;
grant  execute on function public.get_tc_immediate_inputs(uuid) to authenticated;