-- Migration 44: self-healing purchase code generator
-- ============================================================
-- Migration 43 created a Postgres sequence for purchase codes,
-- but only the new-purchase path uses it. Accept-sale creates
-- "received purchase" rows via a different code path, so the
-- sequence drifts behind reality and the next nextval() collides.
--
-- Fix: have the function compare nextval() with the highest
-- existing WOOL-YYYY-NNNN code and bump the sequence forward
-- if needed before returning. Self-corrects regardless of how
-- the other rows were created.

create or replace function public.next_purchase_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year         int;
  v_seq          int;
  v_max_existing int;
begin
  v_year := extract(year from now())::int;

  v_seq := nextval('public.raw_material_purchase_seq');

  select coalesce(max(substring(code from '\d+$')::int), 0)
    into v_max_existing
    from public.raw_material_purchases
    where code ~ '^WOOL-\d{4}-\d+$';

  -- If reality has moved ahead of the sequence (because another
  -- code path created rows without using nextval), bump the
  -- sequence so this call returns a fresh, unused number.
  if v_max_existing >= v_seq then
    v_seq := v_max_existing + 1;
    perform setval('public.raw_material_purchase_seq', v_seq, true);
  end if;

  return 'WOOL-' || v_year || '-' || lpad(v_seq::text, 4, '0');
end;
$$;