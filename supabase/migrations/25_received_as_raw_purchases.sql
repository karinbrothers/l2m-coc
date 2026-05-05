-- Migration 25: model received material as raw_material_purchases
--
-- Each partner's incoming material — whether direct from landbase or
-- received from another partner's sale — sits in their "unprocessed
-- inventory" until they process it themselves. That maps cleanly to
-- raw_material_purchases. Migration 24's inventory_lots approach is
-- reverted.
--
-- Chain of custody is preserved by source_sale_id linking received
-- raw_purchases back to the upstream sale; issue_tc_for_sale walks
-- through it recursively when issuing the buyer's onward TC.

begin;

-- ─────────────────────────────────────────
-- Section 1: schema on raw_material_purchases
-- ─────────────────────────────────────────
alter table raw_material_purchases
  alter column landbase_id drop not null,
  add column if not exists source_sale_id uuid
    references sales(id) on delete set null;

create index if not exists idx_raw_material_purchases_source_sale
  on raw_material_purchases(source_sale_id);

-- ─────────────────────────────────────────
-- Section 2: undo migration 24's buyer-lot approach
-- ─────────────────────────────────────────
delete from inventory_lots where received_from_sale_id is not null;
alter table inventory_lots drop column if exists received_from_sale_id;

-- ─────────────────────────────────────────
-- Section 3: accept_sale now inserts raw_material_purchases for buyer
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
  v_sale            sales;
  v_seller_lot      inventory_lots;
  v_my_org          uuid := get_my_org_id();
  v_purchase_code   text;
begin
  select * into v_sale
    from sales
   where id = p_sale_id
   for update;

  if v_sale.id is null then raise exception 'sale_not_found'; end if;
  if v_sale.buyer_org_id is null or v_sale.buyer_org_id != v_my_org then
    raise exception 'not_your_sale';
  end if;
  if v_sale.status != 'pending' then raise exception 'sale_not_pending'; end if;

  update sales
     set status = 'accepted',
         accepted_at = now(),
         response_notes = p_notes
   where id = p_sale_id
   returning * into v_sale;

  -- Issue the TC (uses recursive walk for received-purchase ancestry)
  perform issue_tc_for_sale(v_sale.id);

  -- Look up seller's lot for unit info
  select * into v_seller_lot
    from inventory_lots
    where id = v_sale.inventory_lot_id;

  -- Generate buyer's next purchase code (globally unique via existing RPC)
  v_purchase_code := generate_next_purchase_code();

  -- Insert into buyer's unprocessed inventory as a received raw purchase
  insert into raw_material_purchases (
    code, organization_id, landbase_id,
    volume, volume_remaining, volume_unit,
    commodity_type, purchase_date, source_sale_id
  ) values (
    v_purchase_code, v_my_org, null,
    v_sale.volume, v_sale.volume, coalesce(v_seller_lot.volume_unit, 'tonnes'),
    'wool',
    v_sale.sale_date, v_sale.id
  );

  return v_sale;
end;
$function$;

-- ─────────────────────────────────────────
-- Section 4: issue_tc_for_sale walks received-purchase chain
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
  select id into v_existing_tc
    from certificates
    where related_transaction_id = p_sale_id and type = 'transaction';
  if v_existing_tc is not null then return v_existing_tc; end if;

  select * into v_sale from sales where id = p_sale_id;
  if v_sale.id is null then raise exception 'sale_not_found'; end if;

  select * into v_lot from inventory_lots where id = v_sale.inventory_lot_id;
  v_batch_id := v_lot.processing_batch_id;

  select name into v_seller_name
    from organizations where id = v_sale.organization_id;

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
      -- Case A: direct purchase — link straight to its OC
      insert into certificate_origin_links (
        transaction_certificate_id, origin_certificate_id, volume_attributed
      )
      select
        v_tc_id,
        oc.id,
        round((bi.volume_used / v_input_total) * v_sale.volume, 2)
      from processing_batch_inputs bi
      join raw_material_purchases p on p.id = bi.source_id
      join certificates oc
        on oc.related_purchase_id = p.id and oc.type = 'origin'
      where bi.processing_batch_id = v_batch_id
        and bi.source_type = 'raw_purchase'
        and p.source_sale_id is null;

      -- Case B: received purchase — walk through its source sale's TC's links
      insert into certificate_origin_links (
        transaction_certificate_id, origin_certificate_id, volume_attributed
      )
      select
        v_tc_id,
        col.origin_certificate_id,
        round(
          (bi.volume_used / v_input_total) * v_sale.volume *
          (col.volume_attributed / nullif(source_total.total_attributed, 0)),
          2
        )
      from processing_batch_inputs bi
      join raw_material_purchases p on p.id = bi.source_id
      join certificates source_tc
        on source_tc.related_transaction_id = p.source_sale_id
       and source_tc.type = 'transaction'
      join certificate_origin_links col
        on col.transaction_certificate_id = source_tc.id
      cross join lateral (
        select sum(volume_attributed) as total_attributed
        from certificate_origin_links
        where transaction_certificate_id = source_tc.id
      ) source_total
      where bi.processing_batch_id = v_batch_id
        and bi.source_type = 'raw_purchase'
        and p.source_sale_id is not null
        and source_total.total_attributed > 0;
    end if;
  end if;

  return v_tc_id;
end;
$function$;

-- ─────────────────────────────────────────
-- Section 5: backfill received raw_purchases for already-accepted sales
-- ─────────────────────────────────────────
do $$
declare
  v_sale          sales;
  v_seller_lot    inventory_lots;
  v_year          integer;
  v_purchase_code text;
  v_prefix        text;
  v_max_seq       integer;
begin
  for v_sale in
    select s.* from sales s
    left join raw_material_purchases p on p.source_sale_id = s.id
    where s.status = 'accepted'
      and s.buyer_org_id is not null
      and p.id is null
    order by s.accepted_at
  loop
    select * into v_seller_lot from inventory_lots
      where id = v_sale.inventory_lot_id;

    v_year := extract(year from v_sale.accepted_at)::integer;
    v_prefix := 'WOOL-' || v_year || '-';

    select coalesce(max((substring(code from '\d+$'))::integer), 0) + 1
      into v_max_seq
      from raw_material_purchases
      where code like v_prefix || '%';

    v_purchase_code := v_prefix || lpad(v_max_seq::text, 4, '0');

    insert into raw_material_purchases (
      code, organization_id, landbase_id,
      volume, volume_remaining, volume_unit,
      commodity_type, purchase_date, source_sale_id
    ) values (
      v_purchase_code, v_sale.buyer_org_id, null,
      v_sale.volume, v_sale.volume, coalesce(v_seller_lot.volume_unit, 'tonnes'),
      'wool',
      v_sale.sale_date, v_sale.id
    );
  end loop;
end $$;

commit;