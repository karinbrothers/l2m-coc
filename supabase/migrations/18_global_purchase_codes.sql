-- Migration 18: global purchase code uniqueness
--
-- Per-org purchase codes can collide on certificate_number which is
-- globally unique. Make purchase codes globally unique:
--   1. For ANY duplicate code, keep the oldest, rename newer ones to
--      the next-available sequence within the same year prefix
--   2. Add unique index on raw_material_purchases.code
--   3. SECURITY DEFINER RPC generate_next_purchase_code() so generation
--      isn't RLS-filtered (matches the sales-code fix in migration 17)

begin;

-- ─────────────────────────────────────────
-- Section 1: rename all duplicate purchase codes to next-available globally
-- ─────────────────────────────────────────
do $$
declare
  v_rec         record;
  v_year_prefix text;
  v_max_seq     integer;
  v_new_code    text;
begin
  for v_rec in
    select p.id, p.code
      from public.raw_material_purchases p
      where p.code in (
        select code from public.raw_material_purchases
        group by code having count(*) > 1
      )
      and p.created_at > (
        select min(p2.created_at)
          from public.raw_material_purchases p2
          where p2.code = p.code
      )
      order by p.created_at
  loop
    -- Strip last 4 digits to get prefix like 'WOOL-2026-'
    v_year_prefix := substring(v_rec.code from 1 for length(v_rec.code) - 4);

    select coalesce(max((substring(code from '\d+$'))::integer), 0) + 1
      into v_max_seq
      from public.raw_material_purchases
      where code like v_year_prefix || '%';

    v_new_code := v_year_prefix || lpad(v_max_seq::text, 4, '0');

    update public.raw_material_purchases
       set code = v_new_code
     where id = v_rec.id;
  end loop;
end $$;

-- ─────────────────────────────────────────
-- Section 2: enforce global purchase code uniqueness
-- ─────────────────────────────────────────
create unique index if not exists raw_material_purchases_code_unique
  on raw_material_purchases (code);

-- ─────────────────────────────────────────
-- Section 3: SECURITY DEFINER RPC for collision-proof code generation
-- ─────────────────────────────────────────
create or replace function public.generate_next_purchase_code()
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_year   integer := extract(year from current_date);
  v_prefix text    := 'WOOL-' || v_year || '-';
  v_last   text;
  v_tail   text;
  v_next   integer := 1;
begin
  select code into v_last
    from public.raw_material_purchases
    where code like v_prefix || '%'
    order by code desc
    limit 1;

  if v_last is not null then
    v_tail := substring(v_last from length(v_prefix) + 1);
    if v_tail ~ '^\d+$' then
      v_next := v_tail::integer + 1;
    end if;
  end if;

  return v_prefix || lpad(v_next::text, 4, '0');
end;
$function$;

commit;