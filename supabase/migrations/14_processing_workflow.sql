-- ============================================================================
-- Migration 14: Processing workflow
-- 
-- 1. Clean slate: delete existing test sales + their TCs + origin links,
--    reset raw_material_purchases.volume_remaining
-- 2. Switch sales.source_purchase_id → sales.inventory_lot_id
-- 3. record_processing_batch RPC (raw → batch → inventory_lot, atomic)
-- 4. Update record_sale RPC to draw from inventory_lots
-- ============================================================================

begin;

-- ─────────────────────────────────────────
-- Section 1: Clean slate
-- ─────────────────────────────────────────
delete from certificate_origin_links;
delete from certificates where type = 'transaction';
delete from sales;
update raw_material_purchases set volume_remaining = volume;

-- ─────────────────────────────────────────
-- Section 2: Switch sales table to point at inventory_lots
-- ─────────────────────────────────────────
alter table sales drop constraint if exists sales_source_purchase_id_fkey;
alter table sales drop column if exists source_purchase_id;

alter table sales
  add column if not exists inventory_lot_id uuid references inventory_lots(id);

create index if not exists idx_sales_inventory_lot
  on sales(inventory_lot_id);

-- ─────────────────────────────────────────
-- Section 3: record_processing_batch RPC
-- ─────────────────────────────────────────
-- p_inputs is a jsonb array: [{"raw_purchase_id": "uuid", "volume_used": 5.0}, ...]
create or replace function public.record_processing_batch(
  p_lot_code         text,
  p_inputs           jsonb,
  p_output_product   text,
  p_output_volume    numeric,
  p_processing_method text default null,
  p_processing_date  date default current_date,
  p_subcontractors   text default null
) returns inventory_lots
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_org         uuid := get_my_org_id();
  v_batch_id    uuid;
  v_input_total numeric := 0;
  v_lot         inventory_lots;
  v_input       record;
  v_remaining   numeric;
begin
  if v_org is null then
    raise exception 'no_organization';
  end if;
  if p_inputs is null or jsonb_array_length(p_inputs) = 0 then
    raise exception 'no_inputs';
  end if;
  if p_output_volume is null or p_output_volume <= 0 then
    raise exception 'invalid_output_volume';
  end if;

  -- Validate + decrement each input. Lock rows with FOR UPDATE.
  for v_input in
    select
      (elem->>'raw_purchase_id')::uuid as raw_purchase_id,
      (elem->>'volume_used')::numeric as volume_used
    from jsonb_array_elements(p_inputs) as elem
  loop
    if v_input.volume_used is null or v_input.volume_used <= 0 then
      raise exception 'invalid_input_volume';
    end if;

    select volume_remaining into v_remaining
      from raw_material_purchases
     where id = v_input.raw_purchase_id
       and organization_id = v_org
     for update;

    if v_remaining is null then
      raise exception 'input_not_found';
    end if;
    if v_remaining < v_input.volume_used then
      raise exception 'insufficient_input_volume';
    end if;

    update raw_material_purchases
       set volume_remaining = volume_remaining - v_input.volume_used
     where id = v_input.raw_purchase_id;

    v_input_total := v_input_total + v_input.volume_used;
  end loop;

  -- Insert the batch
  insert into processing_batches (
    organization_id, input_total_volume, output_volume, output_product,
    processing_method, subcontractors, processing_date
  ) values (
    v_org, v_input_total, p_output_volume, p_output_product,
    p_processing_method, p_subcontractors, p_processing_date
  ) returning id into v_batch_id;

  -- Insert batch inputs (one row per raw purchase)
  insert into processing_batch_inputs (
    processing_batch_id, source_type, source_id, volume_used
  )
  select
    v_batch_id,
    'raw_purchase',
    (elem->>'raw_purchase_id')::uuid,
    (elem->>'volume_used')::numeric
  from jsonb_array_elements(p_inputs) as elem;

  -- Insert the resulting inventory lot
  insert into inventory_lots (
    code, organization_id, processing_batch_id, product_name,
    total_volume, volume_remaining, volume_unit
  ) values (
    p_lot_code, v_org, v_batch_id, p_output_product,
    p_output_volume, p_output_volume, 'tonnes'
  ) returning * into v_lot;

  return v_lot;
end;
$function$;

-- ─────────────────────────────────────────
-- Section 4: record_sale now draws from inventory_lots
-- ─────────────────────────────────────────
-- Drop the old record_sale (parameter names changed so create-or-replace
-- isn't enough).
drop function if exists public.record_sale(text, uuid, text, numeric, date, text);

create or replace function public.record_sale(
  p_code             text,
  p_inventory_lot_id uuid,
  p_buyer_name       text,
  p_volume           numeric,
  p_sale_date        date,
  p_notes            text
) returns sales
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_org       uuid := get_my_org_id();
  v_remaining numeric;
  v_sale      sales;
begin
  if v_org is null then
    raise exception 'no_organization';
  end if;

  select volume_remaining
    into v_remaining
    from inventory_lots
   where id = p_inventory_lot_id
     and organization_id = v_org
   for update;

  if v_remaining is null then
    raise exception 'lot_not_found';
  end if;
  if v_remaining < p_volume then
    raise exception 'insufficient_volume';
  end if;

  update inventory_lots
     set volume_remaining = volume_remaining - p_volume
   where id = p_inventory_lot_id;

  insert into sales (
    code, organization_id, inventory_lot_id, buyer_name,
    volume, volume_unit, sale_date, notes, created_by
  )
  values (
    p_code, v_org, p_inventory_lot_id, p_buyer_name,
    p_volume, 'tonnes', p_sale_date, p_notes, auth.uid()
  )
  returning * into v_sale;

  return v_sale;
end;
$function$;

commit;