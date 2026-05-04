-- Migration 17: partner-aware RLS + global sale code uniqueness + scoped trace
--
-- 1. Fix certificates RLS:
--    - certs_insert allows org members for related purchase OR sale (was admin-only)
--    - certs_select uses current `sales` table (was obsolete `sale_transactions`)
-- 2. Make sale codes globally unique:
--    - rename Kering's SALE-2026-0001 to free the slot LtM owns
--    - add unique index
--    - new SECURITY DEFINER RPC generate_next_sale_code() so generation
--      isn't RLS-filtered
-- 3. Scope get_trace_by_sale_code to caller's org (admins still see all)

begin;

-- ─────────────────────────────────────────
-- Section 1: rename duplicate sale code (must precede unique index)
-- ─────────────────────────────────────────
update sales
   set code = 'SALE-2026-0002'
 where code = 'SALE-2026-0001'
   and organization_id = '178d2f46-1c25-4c92-8ae0-1eb4744d50d6';  -- Kering

-- ─────────────────────────────────────────
-- Section 2: enforce global sale code uniqueness
-- ─────────────────────────────────────────
create unique index if not exists sales_code_unique on sales (code);

-- ─────────────────────────────────────────
-- Section 3: SECURITY DEFINER RPC for collision-proof code generation
-- ─────────────────────────────────────────
create or replace function public.generate_next_sale_code()
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_year   integer := extract(year from current_date);
  v_prefix text    := 'SALE-' || v_year || '-';
  v_last   text;
  v_tail   text;
  v_next   integer := 1;
begin
  select code into v_last
    from public.sales
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

-- ─────────────────────────────────────────
-- Section 4: certificates RLS — current schema + partner-friendly insert
-- ─────────────────────────────────────────
drop policy if exists certs_insert on certificates;
drop policy if exists certs_select on certificates;

create policy certs_insert on certificates
for insert to authenticated
with check (
  is_admin()
  or exists (
    select 1 from raw_material_purchases p
    where p.id = certificates.related_purchase_id
      and p.organization_id = get_my_org_id()
  )
  or exists (
    select 1 from sales s
    where s.id = certificates.related_transaction_id
      and s.organization_id = get_my_org_id()
  )
);

create policy certs_select on certificates
for select to authenticated
using (
  is_admin()
  or exists (
    select 1 from raw_material_purchases p
    where p.id = certificates.related_purchase_id
      and p.organization_id = get_my_org_id()
  )
  or exists (
    select 1 from sales s
    where s.id = certificates.related_transaction_id
      and s.organization_id = get_my_org_id()
  )
);

-- ─────────────────────────────────────────
-- Section 5: scope get_trace_by_sale_code to caller's org (admins see all)
-- ─────────────────────────────────────────
create or replace function public.get_trace_by_sale_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  result        jsonb;
  v_sale_id     uuid;
  v_sale_volume numeric;
  v_sale_org    uuid;
  v_batch_id    uuid;
  v_input_total numeric;
  v_my_org      uuid    := get_my_org_id();
  v_is_admin    boolean := is_admin();
begin
  select s.id, s.volume, s.organization_id, l.processing_batch_id
    into v_sale_id, v_sale_volume, v_sale_org, v_batch_id
    from public.sales s
    left join public.inventory_lots l on l.id = s.inventory_lot_id
    where s.code = p_code;

  if v_sale_id is null then
    return null;
  end if;

  -- Authz: admins see any trace; partners only their own org's
  if not v_is_admin and v_sale_org is distinct from v_my_org then
    return null;
  end if;

  select coalesce(sum(volume_used), 0)
    into v_input_total
    from public.processing_batch_inputs
    where processing_batch_id = v_batch_id
      and source_type = 'raw_purchase';

  select jsonb_build_object(
    'sale', jsonb_build_object(
      'code',         s.code,
      'buyer_name',   s.buyer_name,
      'volume',       s.volume,
      'volume_unit',  s.volume_unit,
      'sale_date',    s.sale_date,
      'created_at',   s.created_at
    ),
    'lot', case when l.id is not null then jsonb_build_object(
      'code',             l.code,
      'product_name',     l.product_name,
      'total_volume',     l.total_volume,
      'volume_remaining', l.volume_remaining,
      'volume_unit',      l.volume_unit
    ) else null end,
    'batch', case when b.id is not null then jsonb_build_object(
      'input_total_volume', b.input_total_volume,
      'output_volume',      b.output_volume,
      'output_product',     b.output_product,
      'processing_method',  b.processing_method,
      'subcontractors',     b.subcontractors,
      'processing_date',    b.processing_date,
      'yield_pct', case
        when b.input_total_volume > 0
        then round((b.output_volume / b.input_total_volume) * 100)
        else null
      end
    ) else null end,
    'inputs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'volume_used',       bi.volume_used,
        'volume_attributed', case
          when v_input_total > 0
          then round((bi.volume_used / v_input_total) * v_sale_volume, 2)
          else null
        end,
        'raw_purchase', jsonb_build_object(
          'code',           p.code,
          'volume',         p.volume,
          'volume_unit',    p.volume_unit,
          'purchase_date',  p.purchase_date,
          'batch_number',   p.batch_number,
          'fibre_diameter', p.fibre_diameter,
          'year_of_clip',   p.year_of_clip
        ),
        'landbase', jsonb_build_object(
          'name',               lb.name,
          'country',            lb.country,
          'eligibility_status', lb.eligibility_status
        ),
        'origin_certificate', case when oc.id is not null then jsonb_build_object(
          'id',                 oc.id,
          'certificate_number', oc.certificate_number
        ) else null end
      ) order by p.code)
      from public.processing_batch_inputs bi
      join public.raw_material_purchases p on p.id = bi.source_id
      join public.landbases lb on lb.id = p.landbase_id
      left join public.certificates oc
        on oc.related_purchase_id = p.id
       and oc.type = 'origin'
      where bi.processing_batch_id = v_batch_id
        and bi.source_type = 'raw_purchase'
    ), '[]'::jsonb),
    'organization', jsonb_build_object(
      'name', o.name
    )
  )
  into result
  from public.sales s
  left join public.inventory_lots l on l.id = s.inventory_lot_id
  left join public.processing_batches b on b.id = l.processing_batch_id
  join public.organizations o on o.id = s.organization_id
  where s.code = p_code;

  return result;
end;
$function$;

commit;