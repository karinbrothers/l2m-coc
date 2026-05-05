-- Migration 24: buyer-side acquisition tracking
--
-- When a sale is accepted, the buyer should receive an inventory_lot
-- representing the material they now own. They can then either resell
-- it directly, or use it as input to a further processing batch.
--
-- The `received_from_sale_id` column links a buyer-side lot back to
-- the sale that created it, so chain-of-custody traversal can follow
-- the cross-org acquisition chain.

begin;

-- ─────────────────────────────────────────
-- Section 1: track which sale a lot was received from
-- ─────────────────────────────────────────
alter table inventory_lots
  add column if not exists received_from_sale_id uuid
    references sales(id) on delete set null;

create index if not exists idx_inventory_lots_received_from_sale
  on inventory_lots(received_from_sale_id);

-- ─────────────────────────────────────────
-- Section 2: accept_sale now also creates the buyer's inventory_lot
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
  v_my_org          uuid    := get_my_org_id();
  v_year            integer := extract(year from current_date);
  v_lot_prefix      text;
  v_last_lot_code   text;
  v_next_lot_seq    integer := 1;
  v_buyer_lot_code  text;
  v_tail            text;
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

  -- Issue the TC (SECURITY DEFINER bypasses RLS)
  perform issue_tc_for_sale(v_sale.id);

  -- Look up seller's lot to inherit product_name + volume_unit
  select * into v_seller_lot
    from inventory_lots
    where id = v_sale.inventory_lot_id;

  -- Generate buyer's next lot code (org-scoped)
  v_lot_prefix := 'LOT-' || v_year || '-';

  select code into v_last_lot_code
    from inventory_lots
    where organization_id = v_my_org
      and code like v_lot_prefix || '%'
    order by code desc
    limit 1;

  if v_last_lot_code is not null then
    v_tail := substring(v_last_lot_code from length(v_lot_prefix) + 1);
    if v_tail ~ '^\d+$' then
      v_next_lot_seq := v_tail::integer + 1;
    end if;
  end if;

  v_buyer_lot_code := v_lot_prefix || lpad(v_next_lot_seq::text, 4, '0');

  -- Create the buyer's inventory_lot (received material, no processing batch)
  insert into inventory_lots (
    code, organization_id, product_name,
    total_volume, volume_remaining, volume_unit,
    received_from_sale_id, processing_batch_id
  ) values (
    v_buyer_lot_code, v_my_org,
    coalesce(v_seller_lot.product_name, 'Received material'),
    v_sale.volume, v_sale.volume,
    coalesce(v_seller_lot.volume_unit, 'tonnes'),
    v_sale.id, null
  );

  return v_sale;
end;
$function$;

commit;