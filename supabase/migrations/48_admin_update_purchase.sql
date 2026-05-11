-- Migration 48: admin edit purchase
-- ============================================================
-- Lets admin correct typos on a purchase (direct landbase
-- purchase or received-from-sale purchase). Editable fields:
--   - volume          (rebalances volume_remaining by the delta)
--   - fibre_diameter
--   - year_of_clip
--   - purchase_date
--   - batch_number
--
-- Volume semantics:
--   - delta = p_volume - existing volume
--   - volume_remaining is adjusted by the same delta
--   - if the adjusted volume_remaining would go below zero (i.e.
--     more has already been drawn into batches than the new
--     volume allows), the operation fails with volume_below_used.
--
-- Note: editing fibre/clip year on a purchase whose OC has
-- already been issued does NOT auto-update the OC's snapshot
-- columns. The cert reflects what was true at issue time. The
-- trace page reads the live purchase row, so it does update.

create or replace function public.admin_update_purchase(
  p_purchase_id    uuid,
  p_volume         numeric default null,
  p_fibre_diameter numeric default null,
  p_year_of_clip   int     default null,
  p_purchase_date  date    default null,
  p_batch_number   text    default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_purchase raw_material_purchases%rowtype;
  v_delta    numeric;
begin
  if not is_admin() then
    raise exception 'admin_only';
  end if;

  select * into v_purchase
    from raw_material_purchases
    where id = p_purchase_id;
  if v_purchase.id is null then
    raise exception 'purchase_not_found';
  end if;

  if p_volume is not null then
    if p_volume <= 0 then
      raise exception 'invalid_volume';
    end if;
    v_delta := p_volume - v_purchase.volume;
    update raw_material_purchases
       set volume           = p_volume,
           volume_remaining = volume_remaining + v_delta
     where id = p_purchase_id
       and (volume_remaining + v_delta) >= 0;
    if not found then
      raise exception 'volume_below_used';
    end if;
  end if;

  update raw_material_purchases set
    fibre_diameter = coalesce(p_fibre_diameter, fibre_diameter),
    year_of_clip   = coalesce(p_year_of_clip,   year_of_clip),
    purchase_date  = coalesce(p_purchase_date,  purchase_date),
    batch_number   = case
      when p_batch_number is null then batch_number
      else nullif(trim(p_batch_number), '')
    end
  where id = p_purchase_id;
end;
$$;

revoke all on function public.admin_update_purchase(uuid, numeric, numeric, int, date, text) from public;
grant  execute on function public.admin_update_purchase(uuid, numeric, numeric, int, date, text) to authenticated;