-- Migration 35: set_sale_shipping_number RPC
-- ============================================================
-- Direct UPDATE on sales is blocked by RLS (no UPDATE policy
-- for sellers on the table). Adding a broad UPDATE policy
-- would let sellers change volume / buyer / etc. after a sale
-- is submitted, which we don't want.
--
-- Instead: a tightly scoped SECURITY DEFINER RPC that lets a
-- seller set ONLY the shipping_number column on their own
-- sale. Called from createSale right after record_sale.

create or replace function public.set_sale_shipping_number(
  p_sale_id uuid,
  p_shipping_number text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale_org uuid;
  v_my_org   uuid := get_my_org_id();
begin
  if v_my_org is null then
    raise exception 'no_organization';
  end if;

  select organization_id into v_sale_org from sales where id = p_sale_id;

  if v_sale_org is null then
    raise exception 'sale_not_found';
  end if;

  if v_sale_org <> v_my_org then
    raise exception 'not_authorized';
  end if;

  update sales
     set shipping_number = nullif(trim(p_shipping_number), '')
   where id = p_sale_id;
end;
$$;

revoke all on function public.set_sale_shipping_number(uuid, text) from public;
grant  execute on function public.set_sale_shipping_number(uuid, text) to authenticated;

-- Backfill the existing test sale that was created before this
-- RPC existed (its shipping_number is currently null).
update public.sales
   set shipping_number = '123456789'
 where code = 'SALE-2026-0004';