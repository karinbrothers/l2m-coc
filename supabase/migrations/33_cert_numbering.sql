-- Migration 33: Cert numbering format L2M-{TYPE}-{YEAR}-{NNNN}
-- ============================================================
-- Brings everything onto a single source-of-truth numbering
-- scheme:
--
--   L2M-OC-2026-0001, L2M-OC-2026-0002, ...
--   L2M-TC-2026-0001, L2M-TC-2026-0002, ...
--
-- Per-type and per-year — OCs and TCs each start at 0001 every
-- year, independently of one another.
--
-- Three things happen here:
--   1. Replace generate_certificate_number with a per-type,
--      per-year counter using max(N) + 1.
--   2. Fix issue_tc_for_sale to call it (was hardcoding
--      'TC-' || sale_code).
--   3. Renumber every existing certificate to match.
--
-- App-level fix for OC numbering lives in
-- src/app/purchases/actions.ts (calls the RPC instead of
-- building the number client-side).
-- ============================================================

-- 1. Generation function -------------------------------------
create or replace function public.generate_certificate_number(cert_type text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  prefix   text;
  year_str text;
  next_num int;
begin
  year_str := extract(year from now())::text;

  if cert_type = 'origin' then
    prefix := 'L2M-OC';
  elsif cert_type = 'transaction' then
    prefix := 'L2M-TC';
  elsif cert_type = 'product_verification' then
    prefix := 'L2M-PV';
  else
    prefix := 'L2M-XX';
  end if;

  -- Highest sequence already used for this type+year, plus 1.
  -- Strips trailing digits from existing certificate_numbers
  -- and takes the max.
  select coalesce(
    max(
      substring(certificate_number from '\d+$')::int
    ),
    0
  ) + 1
    into next_num
    from certificates
    where type = cert_type
      and certificate_number like prefix || '-' || year_str || '-%';

  return prefix || '-' || year_str || '-' || lpad(next_num::text, 4, '0');
end;
$$;

revoke all on function public.generate_certificate_number(text) from public;
grant  execute on function public.generate_certificate_number(text) to authenticated, service_role;

-- 2. issue_tc_for_sale uses generate_certificate_number ------
create or replace function public.issue_tc_for_sale(p_sale_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale         sales;
  v_lot          inventory_lots;
  v_batch_id     uuid;
  v_seller_name  text;
  v_tc_id        uuid;
  v_input_total  numeric;
  v_existing_tc  uuid;
  v_cert_number  text;
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

  v_cert_number := generate_certificate_number('transaction');

  insert into certificates (
    certificate_number, type, related_transaction_id,
    volume, volume_unit, commodity_type, purchase_code,
    sale_code, buyer_name_snapshot, seller_org_name_snapshot,
    sale_date_snapshot, commodity_type_snapshot, volume_snapshot,
    volume_unit_snapshot, source_purchase_code_snapshot
  ) values (
    v_cert_number, 'transaction', v_sale.id,
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
        v_tc_id, oc.id,
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
        v_tc_id, col.origin_certificate_id,
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
$$;

-- 3. Renumber every existing certificate ---------------------
-- Per type, per year, ordered by issued_at (with id as tiebreak).
do $$
begin
  -- Origin certificates
  with numbered as (
    select id,
           row_number() over (
             partition by extract(year from issued_at)
             order by issued_at, id
           ) as rn,
           extract(year from issued_at)::text as year_str
      from certificates
      where type = 'origin'
  )
  update certificates c
  set certificate_number =
    'L2M-OC-' || numbered.year_str || '-' || lpad(numbered.rn::text, 4, '0')
  from numbered
  where c.id = numbered.id;

  -- Transaction certificates
  with numbered as (
    select id,
           row_number() over (
             partition by extract(year from issued_at)
             order by issued_at, id
           ) as rn,
           extract(year from issued_at)::text as year_str
      from certificates
      where type = 'transaction'
  )
  update certificates c
  set certificate_number =
    'L2M-TC-' || numbered.year_str || '-' || lpad(numbered.rn::text, 4, '0')
  from numbered
  where c.id = numbered.id;
end $$;