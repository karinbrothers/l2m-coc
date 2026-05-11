-- Migration 45: admin cancel pending sale
-- ============================================================
-- Lets an admin cancel a pending sale and return its volume to
-- the seller's inventory lot. Marks the sale as rejected with
-- a "Cancelled by admin" response note so the seller sees what
-- happened.
--
-- Only works on pending sales — accepted sales need a heavier
-- void/refund path (TC already issued, buyer's purchase row
-- created) which we'll build later if needed.

create or replace function public.cancel_pending_sale_admin(
  p_sale_id uuid,
  p_reason  text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale sales%rowtype;
  v_note text;
begin
  if not is_admin() then
    raise exception 'admin_only';
  end if;

  select * into v_sale from sales where id = p_sale_id;
  if v_sale.id is null then
    raise exception 'sale_not_found';
  end if;
  if v_sale.status <> 'pending' then
    raise exception 'sale_not_pending';
  end if;

  -- Return volume to seller's inventory lot.
  update inventory_lots
     set volume_remaining = volume_remaining + v_sale.volume
   where id = v_sale.inventory_lot_id;

  -- Mark rejected with a clear admin attribution. Reusing the
  -- rejected status (rather than introducing a new 'cancelled')
  -- keeps existing UI/queries working unchanged.
  v_note := 'Cancelled by admin' ||
    coalesce(': ' || nullif(trim(p_reason), ''), '');

  update sales
     set status         = 'rejected',
         rejected_at    = now(),
         response_notes = v_note
   where id = p_sale_id;
end;
$$;

revoke all on function public.cancel_pending_sale_admin(uuid, text) from public;
grant  execute on function public.cancel_pending_sale_admin(uuid, text) to authenticated;