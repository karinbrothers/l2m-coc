-- Migration 37: trace function returns purchasing FSP
-- ============================================================
-- Adds the purchasing organisation (the first-stage processor
-- that bought from the landbase) to each input returned by
-- get_trace_by_sale_code, so the trace page can render
-- "Agua Dulce — purchased by Engraw" rather than just the
-- landbase on its own.
--
-- Body of the function is unchanged except for two additions
-- in the recursive CTE (carry organization_id forward) and one
-- additional join + JSON field in the final SELECT.

create or replace function public.get_trace_by_sale_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  result        jsonb;
  v_sale_id     uuid;
  v_sale_volume numeric;
  v_sale_org    uuid;
  v_buyer_org   uuid;
  v_batch_id    uuid;
  v_my_org      uuid    := get_my_org_id();
  v_is_admin    boolean := is_admin();
begin
  select s.id, s.volume, s.organization_id, s.buyer_org_id, l.processing_batch_id
    into v_sale_id, v_sale_volume, v_sale_org, v_buyer_org, v_batch_id
    from public.sales s
    left join public.inventory_lots l on l.id = s.inventory_lot_id
    where s.code = p_code;

  if v_sale_id is null then
    return null;
  end if;

  if not v_is_admin
     and v_sale_org is distinct from v_my_org
     and v_buyer_org is distinct from v_my_org then
    return null;
  end if;

  with recursive chain as (
    select
      p.id              as purchase_id,
      p.organization_id as purchase_org_id,
      p.source_sale_id,
      p.landbase_id,
      p.code            as purchase_code,
      p.volume          as purchase_volume,
      p.volume_unit,
      p.purchase_date,
      p.batch_number,
      p.fibre_diameter,
      p.year_of_clip,
      v_sale_volume * (bi.volume_used / parent_total.total) as effective_volume
    from public.processing_batch_inputs bi
    join public.raw_material_purchases p on p.id = bi.source_id
    cross join lateral (
      select sum(volume_used) as total
      from public.processing_batch_inputs
      where processing_batch_id = v_batch_id
        and source_type = 'raw_purchase'
    ) parent_total
    where bi.processing_batch_id = v_batch_id
      and bi.source_type = 'raw_purchase'
      and parent_total.total > 0

    union all

    select
      p2.id,
      p2.organization_id,
      p2.source_sale_id,
      p2.landbase_id,
      p2.code,
      p2.volume,
      p2.volume_unit,
      p2.purchase_date,
      p2.batch_number,
      p2.fibre_diameter,
      p2.year_of_clip,
      chain.effective_volume * (bi2.volume_used / parent_total.total)
    from chain
    join public.sales s2 on s2.id = chain.source_sale_id
    join public.inventory_lots l2 on l2.id = s2.inventory_lot_id
    join public.processing_batch_inputs bi2
      on bi2.processing_batch_id = l2.processing_batch_id
    join public.raw_material_purchases p2 on p2.id = bi2.source_id
    cross join lateral (
      select sum(volume_used) as total
      from public.processing_batch_inputs
      where processing_batch_id = l2.processing_batch_id
        and source_type = 'raw_purchase'
    ) parent_total
    where chain.source_sale_id is not null
      and chain.landbase_id is null
      and bi2.source_type = 'raw_purchase'
      and parent_total.total > 0
  )
  select jsonb_build_object(
    'sale', jsonb_build_object(
      'code',         s.code,
      'buyer_name',   s.buyer_name,
      'volume',       s.volume,
      'volume_unit',  s.volume_unit,
      'sale_date',    s.sale_date,
      'created_at',   s.created_at
    ),
    'inputs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'volume_attributed', round(c.effective_volume::numeric, 2),
        'volume_used',       round(c.effective_volume::numeric, 2),
        'raw_purchase', jsonb_build_object(
          'code',           c.purchase_code,
          'volume',         c.purchase_volume,
          'volume_unit',    c.volume_unit,
          'purchase_date',  c.purchase_date,
          'batch_number',   c.batch_number,
          'fibre_diameter', c.fibre_diameter,
          'year_of_clip',   c.year_of_clip
        ),
        'landbase', jsonb_build_object(
          'name',               lb.name,
          'country',            lb.country,
          'eligibility_status', lb.eligibility_status
        ),
        'purchasing_org', case
          when fsp.id is not null then jsonb_build_object('name', fsp.name)
          else null
        end,
        'origin_certificate', case when oc.id is not null then jsonb_build_object(
          'id',                 oc.id,
          'certificate_number', oc.certificate_number
        ) else null end
      ) order by c.purchase_code)
      from chain c
      join public.landbases lb on lb.id = c.landbase_id
      left join public.organizations fsp on fsp.id = c.purchase_org_id
      left join public.certificates oc
        on oc.related_purchase_id = c.purchase_id
       and oc.type = 'origin'
      where c.landbase_id is not null
    ), '[]'::jsonb),
    'organization', jsonb_build_object(
      'name', o.name
    )
  )
  into result
  from public.sales s
  join public.organizations o on o.id = s.organization_id
  where s.id = v_sale_id;

  return result;
end;
$$;