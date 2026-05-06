-- Migration 28: buyer can see upstream OCs even before accepting
--
-- Migration 23's helper only allowed buyers to see OCs once a TC link
-- existed (i.e., after accepting). But buyers need to verify upstream
-- OCs BEFORE they accept. Rewrite the helper to walk the actual
-- batch_inputs chain via recursive CTE — same logic as the trace
-- function — so it works for pending sales too.

create or replace function public.is_buyer_for_oc_in_chain(p_oc_id uuid)
returns boolean
language plpgsql
security definer
stable
set search_path to 'public'
as $function$
declare
  v_my_org         uuid := get_my_org_id();
  v_oc_purchase_id uuid;
begin
  -- Get the OC's underlying raw_material_purchases id
  select related_purchase_id into v_oc_purchase_id
  from certificates
  where id = p_oc_id and type = 'origin';

  if v_oc_purchase_id is null then
    return false;
  end if;

  return exists (
    with recursive chain as (
      -- Start from any sale where I'm the buyer
      select bi.source_id as purchase_id
      from sales s
      join inventory_lots l on l.id = s.inventory_lot_id
      join processing_batch_inputs bi on bi.processing_batch_id = l.processing_batch_id
      where s.buyer_org_id = v_my_org
        and bi.source_type = 'raw_purchase'

      union all

      -- Recurse through received purchases
      select bi2.source_id
      from chain c
      join raw_material_purchases p on p.id = c.purchase_id
      join sales s2 on s2.id = p.source_sale_id
      join inventory_lots l2 on l2.id = s2.inventory_lot_id
      join processing_batch_inputs bi2 on bi2.processing_batch_id = l2.processing_batch_id
      where p.source_sale_id is not null
        and bi2.source_type = 'raw_purchase'
    )
    select 1 from chain where purchase_id = v_oc_purchase_id
  );
end;
$function$;