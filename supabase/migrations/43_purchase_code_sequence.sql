-- Migration 43: atomic purchase code generation via sequence
-- ============================================================
-- The previous JS-side generator computed "max(code) for this
-- org + 1", but raw_material_purchases.code is globally unique.
-- If two orgs happened to be at the same N, or a previous
-- session's data left a code in another org's row, every JS
-- retry would regenerate the same colliding code and fail.
--
-- Fix: postgres sequence + SECURITY DEFINER function. Atomic,
-- conflict-free, callable from the action via supabase.rpc.

create sequence if not exists public.raw_material_purchase_seq;

-- Bump the sequence past any existing WOOL-YYYY-NNNN codes so
-- new purchases don't collide with historical rows.
do $$
declare
  v_max int;
begin
  select coalesce(max(substring(code from '\d+$')::int), 0)
    into v_max
    from public.raw_material_purchases
    where code ~ '^WOOL-\d{4}-\d+$';

  if v_max > 0 then
    perform setval('public.raw_material_purchase_seq', v_max, true);
  end if;
end $$;

create or replace function public.next_purchase_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year int;
  v_seq  int;
begin
  v_year := extract(year from now())::int;
  v_seq  := nextval('public.raw_material_purchase_seq');
  return 'WOOL-' || v_year || '-' || lpad(v_seq::text, 4, '0');
end;
$$;

revoke all on function public.next_purchase_code() from public;
grant  execute on function public.next_purchase_code() to authenticated;