-- Migration 49: atomic sale code generation
-- ============================================================
-- Same race-condition fix as migration 43/44 for purchase codes,
-- now applied to sales. Replaces whatever logic backs the
-- existing generate_next_sale_code function with a Postgres
-- sequence and self-healing max-check. Atomic, conflict-proof.

create sequence if not exists public.sales_seq;

-- Bump the sequence past any existing SALE-YYYY-NNNN codes so
-- new sales don't collide with historical rows.
do $$
declare
  v_max int;
begin
  select coalesce(max(substring(code from '\d+$')::int), 0)
    into v_max
    from public.sales
    where code ~ '^SALE-\d{4}-\d+$';
  if v_max > 0 then
    perform setval('public.sales_seq', v_max, true);
  end if;
end $$;

-- Replace the existing generate_next_sale_code function with
-- the sequence-backed, self-healing version. Same signature
-- so callers (createSale action) don't need to change.
create or replace function public.generate_next_sale_code()
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

  v_seq := nextval('public.sales_seq');

  -- If reality has moved ahead of the sequence (rows inserted
  -- via some other code path), bump it.
  select coalesce(max(substring(code from '\d+$')::int), 0)
    into v_max_existing
    from public.sales
    where code ~ '^SALE-\d{4}-\d+$';

  if v_max_existing >= v_seq then
    v_seq := v_max_existing + 1;
    perform setval('public.sales_seq', v_seq, true);
  end if;

  return 'SALE-' || v_year || '-' || lpad(v_seq::text, 4, '0');
end;
$$;

revoke all on function public.generate_next_sale_code() from public;
grant  execute on function public.generate_next_sale_code() to authenticated;