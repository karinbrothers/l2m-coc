-- Migration 15: rewrite get_trace_by_sale_code for processing chain
--
-- New shape: returns sale + inventory lot + processing batch + array of
-- inputs (each with raw purchase + landbase + origin certificate +
-- proportional volume_attributed).
--
-- Same parameter signature as before (p_code text → jsonb), so
-- CREATE OR REPLACE is enough.

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
  v_batch_id    uuid;
  v_input_total numeric;
begin
  -- Find the sale + chain ids
  select s.id, s.volume, l.processing_batch_id
    into v_sale_id, v_sale_volume, v_batch_id
    from public.sales s
    left join public.inventory_lots l on l.id = s.inventory_lot_id
    where s.code = p_code;

  if v_sale_id is null then
    return null;
  end if;

  -- Sum batch input volumes for proportional attribution
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