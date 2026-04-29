-- ============================================================================
-- 10b: Sales workflow catch-up
-- This was originally part of Day 7's work but never made it into a migration
-- file. Replays staging's sales table + RLS + record_sale onto prod.
-- Idempotent — safe to run on staging too (will be a no-op there).
-- ============================================================================

-- Sales table
create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  organization_id uuid not null references public.organizations(id),
  source_purchase_id uuid not null references public.raw_material_purchases(id),
  buyer_name text not null,
  volume numeric(12,2) not null check (volume > 0),
  volume_unit text not null default 'tonnes',
  sale_date date,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (organization_id, code)
);

create index if not exists sales_organization_id_idx
  on public.sales(organization_id);
create index if not exists sales_source_purchase_id_idx
  on public.sales(source_purchase_id);

-- RLS
alter table public.sales enable row level security;

drop policy if exists "sales_select" on public.sales;
create policy "sales_select" on public.sales
  for select
  using (is_admin() or organization_id = get_my_org_id());

drop policy if exists "sales_insert" on public.sales;
create policy "sales_insert" on public.sales
  for insert
  with check (organization_id = get_my_org_id());

-- record_sale function
create or replace function public.record_sale(
  p_code text,
  p_source_purchase_id uuid,
  p_buyer_name text,
  p_volume numeric,
  p_sale_date date,
  p_notes text
) returns sales
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_org       uuid := get_my_org_id();
  v_remaining numeric;
  v_sale      sales;
begin
  if v_org is null then
    raise exception 'no_organization';
  end if;

  select volume_remaining
    into v_remaining
    from raw_material_purchases
    where id = p_source_purchase_id
      and organization_id = v_org
    for update;

  if v_remaining is null then
    raise exception 'source_not_found';
  end if;
  if v_remaining < p_volume then
    raise exception 'insufficient_volume';
  end if;

  update raw_material_purchases
     set volume_remaining = volume_remaining - p_volume
   where id = p_source_purchase_id;

  insert into sales (
    code, organization_id, source_purchase_id, buyer_name,
    volume, volume_unit, sale_date, notes, created_by
  )
  values (
    p_code, v_org, p_source_purchase_id, p_buyer_name,
    p_volume, 'tonnes', p_sale_date, p_notes, auth.uid()
  )
  returning * into v_sale;

  return v_sale;
end;
$function$;