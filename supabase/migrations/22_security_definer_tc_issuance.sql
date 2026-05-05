-- Migration 22: SECURITY DEFINER TC issuance + buyer-visible chain OCs
--
-- Bug: when a buyer accepts a sale, the JS issueTransactionCertificate
-- runs in their auth context. The chain (lot → batch → batch_inputs →
-- raw_purchases → OCs) all belongs to the seller's org, so RLS blocked
-- every lookup and the TC was created with no origin links.
--
-- Fix:
--   1. Move TC issuance into a SECURITY DEFINER RPC.
--   2. Have accept_sale call it inside the same transaction.
--   3. Extend certs_select so the buyer can display the resulting OC
--      links (PostgREST nested fetch is still subject to RLS).

begin;

-- ─────────────────────────────────────────
-- Section 1: extend certs_select so buyer can see OCs in their chain
-- ─────────────────────────────────────────
drop policy if exists certs_select on certificates;

create policy certs_select on certificates
for select to authenticated
using (
  is_admin()
  or exists (
    select 1 from raw_material_purchases p
    where p.id = certificates.related_purchase_id
      and p.organization_id = get_my_org_id()
  )
  or exists (
    select 1 from sales s
    where s.id = certificates.related_transaction_id
      and (s.organization_id = get_my_org_id()
           or s.buyer_org_id = get_my_org_id())
  )
  or exists (
    -- Buyer can see OCs linked into TCs of sales where they're the buyer
    select 1
    from certificate_origin_links col
    join certificates tc on tc.id = col.transaction_certificate_id
    join sales s on s.id = tc.related_transaction_id
    where col.origin_certificate_id = certificates.id
      and s.buyer_org_id = get_my_org_id()
  )
);

-- ─────────────────────────────────────────
-- Section 2: issue_tc_for_sale SECURITY DEFINER RPC
-- ─────────────────────────────────────────
create or replace function public.issue_tc_for_sale(p_sale_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_sale         sales;
  v_lot          inventory_lots;
  v_batch_id     uuid;
  v_seller_name  text;
  v_tc_id        uuid;
  v_input_total  numeric;
  v_existing_tc  uuid;
begin
  -- Idempotent: skip if a TC already exists for this sale
  select id into v_existing_tc
    from certificates
    where related_transaction_id = p_sale_id
      and type = 'transaction';
  if v_existing_tc is not null then
    return v_existing_tc;
  end if;

  select * into v_sale from sales where id = p_sale_id;
  if v_sale.id is null then
    raise exception 'sale_not_found';
  end if;

  select * into v_lot
    from inventory_lots
    where id = v_sale.inventory_lot_id;

  v_batch_id := v_lot.processing_batch_id;

  select name into v_seller_name
    from organizations
    where id = v_sale.organization_id;

  insert into certificates (
    certificate_number, type, related_transaction_id,
    volume, volume_unit, commodity_type, purchase_code,
    sale_code, buyer_name_snapshot, seller_org_name_snapshot,
    sale_date_snapshot, commodity_type_snapshot, volume_snapshot,
    volume_unit_snapshot, source_purchase_code_snapshot
  ) values (
    'TC-' || v_sale.code, 'transaction', v_sale.id,
    v_sale.volume, 'tonnes', v_lot.product_name, v_lot.code,
    v_sale.code, v_sale.buyer_name, v_seller_name,
    v_sale.sale_date, v_lot.product_name, v_sale.volume,
    'tonnes', v_lot.code
  )
  returning id into v_tc_id;

  if v_batch_id is not null then
    select coalesce(sum(volume_used), 0)
      into v_input_total
      from processing_batch_inputs
      where processing_batch_id = v_batch_id
        and source_type = 'raw_purchase';

    if v_input_total > 0 then
      insert into certificate_origin_links (
        transaction_certificate_id, origin_certificate_id, volume_attributed
      )
      select
        v_tc_id,
        oc.id,
        round((bi.volume_used / v_input_total) * v_sale.volume, 2)
      from processing_batch_inputs bi
      join certificates oc
        on oc.related_purchase_id = bi.source_id
       and oc.type = 'origin'
      where bi.processing_batch_id = v_batch_id
        and bi.source_type = 'raw_purchase';
    end if;
  end if;

  return v_tc_id;
end;
$function$;

-- ─────────────────────────────────────────
-- Section 3: accept_sale now also issues the TC
-- ─────────────────────────────────────────
create or replace function public.accept_sale(
  p_sale_id uuid,
  p_notes   text default null
) returns sales
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_sale       sales;
  v_my_org     uuid := get_my_org_id();
begin
  select * into v_sale
    from sales
   where id = p_sale_id
   for update;

  if v_sale.id is null then
    raise exception 'sale_not_found';
  end if;
  if v_sale.buyer_org_id is null or v_sale.buyer_org_id != v_my_org then
    raise exception 'not_your_sale';
  end if;
  if v_sale.status != 'pending' then
    raise exception 'sale_not_pending';
  end if;

  update sales
     set status = 'accepted',
         accepted_at = now(),
         response_notes = p_notes
   where id = p_sale_id
   returning * into v_sale;

  -- Issue TC inside the same transaction (SECURITY DEFINER bypasses RLS)
  perform issue_tc_for_sale(v_sale.id);

  return v_sale;
end;
$function$;

commit;