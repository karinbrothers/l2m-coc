-- Migration 40: include each sale's TC in sale_chain
-- ============================================================
-- Each entry in sale_chain now also reports its transaction
-- certificate (id + number) so the trace page can show
-- "View transaction certificate L2M-TC-2026-NNNN →" on every
-- sale step. Sales that haven't been accepted yet (no TC)
-- return null and the link is hidden.

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

  with recursive
  chain as (
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
  ),
  sale_path as (
    select
      s.id, s.code,
      s.organization_id as seller_org_id,
      s.buyer_org_id, s.buyer_name,
      s.volume, s.volume_unit, s.sale_date,
      s.inventory_lot_id, l.product_name,
      0 as depth
    from public.sales s
    left join public.inventory_lots l on l.id = s.inventory_lot_id
    where s.id = v_sale_id

    union all

    select
      src_sale.id, src_sale.code,
      src_sale.organization_id, src_sale.buyer_org_id, src_sale.buyer_name,
      src_sale.volume, src_sale.volume_unit, src_sale.sale_date,
      src_sale.inventory_lot_id, src_lot.product_name,
      sp.depth + 1
    from sale_path sp
    join public.inventory_lots l on l.id = sp.inventory_lot_id
    join public.processing_batch_inputs bi
      on bi.processing_batch_id = l.processing_batch_id
    join public.raw_material_purchases p on p.id = bi.source_id
    join public.sales src_sale on src_sale.id = p.source_sale_id
    left join public.inventory_lots src_lot
      on src_lot.id = src_sale.inventory_lot_id
    where bi.source_type = 'raw_purchase'
      and p.source_sale_id is not null
      and sp.depth < 50
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
    'sale_chain', coalesce((
      select jsonb_agg(jsonb_build_object(
        'sale_code',    d.code,
        'sale_date',    d.sale_date,
        'volume',       d.volume,
        'volume_unit',  d.volume_unit,
        'product_name', d.product_name,
        'seller', jsonb_build_object('name', seller_org.name),
        'buyer',  jsonb_build_object(
          'name', coalesce(buyer_org.name, d.buyer_name)
        ),
        'transaction_certificate', case
          when tc.id is not null then jsonb_build_object(
            'id', tc.id,
            'certificate_number', tc.certificate_number
          )
          else null
        end
      ) order by d.depth desc)
      from (
        select distinct on (id)
          id, code, sale_date, volume, volume_unit, product_name,
          seller_org_id, buyer_org_id, buyer_name, depth
        from sale_path
        order by id, depth
      ) d
      left join public.organizations seller_org on seller_org.id = d.seller_org_id
      left join public.organizations buyer_org  on buyer_org.id  = d.buyer_org_id
      left join public.certificates tc
        on tc.related_transaction_id = d.id
       and tc.type = 'transaction'
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