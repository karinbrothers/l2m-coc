-- Migration 47: full admin edit on a sale
-- ============================================================
-- Supersedes admin_update_sale_metadata. Lets admin edit every
-- editable field on a sale:
--   - volume         (rebalances inventory_lot when pending)
--   - sale_date
--   - shipping_number
--   - country_of_dispatch
--   - notes
--
-- Volume semantics:
--   - On a PENDING sale, changing volume adjusts the parent
--     inventory_lot.volume_remaining by the delta. Won't allow
--     the lot to go negative.
--   - On a non-pending sale, the volume on the sale row is
--     updated but downstream rows (TC, buyer's purchase, origin
--     links) are NOT auto-rewritten — the cert has these values
--     snapshotted at issue time and stays consistent with what
--     was actually agreed. Editing volume here is for record
--     correction only; the cert reflects what was issued.

create or replace function public.admin_update_sale(
  p_sale_id             uuid,
  p_volume              numeric default null,
  p_sale_date           date    default null,
  p_shipping_number     text    default null,
  p_country_of_dispatch text    default null,
  p_notes               text    default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale  sales%rowtype;
  v_delta numeric;
begin
  if not is_admin() then
    raise exception 'admin_only';
  end if;

  select * into v_sale from sales where id = p_sale_id;
  if v_sale.id is null then
    raise exception 'sale_not_found';
  end if;

  -- Volume change on a pending sale: rebalance inventory_lot
  if p_volume is not null
     and p_volume <> v_sale.volume
     and v_sale.status = 'pending' then
    v_delta := p_volume - v_sale.volume;
    update inventory_lots
       set volume_remaining = volume_remaining - v_delta
     where id = v_sale.inventory_lot_id
       and volume_remaining - v_delta >= 0;
    if not found then
      raise exception 'insufficient_lot_volume';
    end if;
  end if;

  -- Volume on non-pending sale must be > 0 (sanity) but is
  -- otherwise allowed; admin is fixing a record-keeping issue.
  if p_volume is not null and p_volume <= 0 then
    raise exception 'invalid_volume';
  end if;

  update sales set
    volume    = coalesce(p_volume, volume),
    sale_date = coalesce(p_sale_date, sale_date),
    shipping_number = case
      when p_shipping_number is null then shipping_number
      else nullif(trim(p_shipping_number), '')
    end,
    country_of_dispatch = case
      when p_country_of_dispatch is null then country_of_dispatch
      else nullif(trim(p_country_of_dispatch), '')
    end,
    notes = case
      when p_notes is null then notes
      else nullif(trim(p_notes), '')
    end
  where id = p_sale_id;
end;
$$;

revoke all on function public.admin_update_sale(uuid, numeric, date, text, text, text) from public;
grant  execute on function public.admin_update_sale(uuid, numeric, date, text, text, text) to authenticated;