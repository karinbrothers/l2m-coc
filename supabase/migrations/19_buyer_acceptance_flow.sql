-- Migration 19: buyer-side acceptance flow
--
-- Sales can now go to either a platform partner org (with accept/reject
-- workflow) or a free-text external buyer (auto-accepted).
--   1. Add buyer_org_id, status, response_deadline, accepted_at,
--      rejected_at, response_notes to sales
--   2. Add sale_status enum
--   3. Update record_sale RPC to accept buyer_org_id; set initial status
--      based on buyer type
--   4. New accept_sale and reject_sale RPCs (reject restores lot volume)
--   5. Update sales RLS so buyer_org can see incoming sales

begin;

-- ─────────────────────────────────────────
-- Section 1: enum
-- ─────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'sale_status' and n.nspname = 'public'
  ) then
    create type public.sale_status as enum (
      'pending', 'accepted', 'rejected', 'expired'
    );
  end if;
end $$;

-- ─────────────────────────────────────────
-- Section 2: new columns on sales
-- ─────────────────────────────────────────
alter table sales
  add column if not exists buyer_org_id uuid
    references organizations(id) on delete set null,
  add column if not exists status public.sale_status not null default 'accepted',
  add column if not exists response_deadline timestamptz,
  add column if not exists accepted_at timestamptz,
  add column if not exists rejected_at timestamptz,
  add column if not exists response_notes text;

create index if not exists idx_sales_buyer_org on sales(buyer_org_id);
create index if not exists idx_sales_status on sales(status);

-- Existing sales (created before this migration) are 'accepted' by default.
-- That's intentional — they were external-buyer sales in the old model.

-- ─────────────────────────────────────────
-- Section 3: rewrite record_sale to accept buyer_org_id
-- ─────────────────────────────────────────
drop function if exists public.record_sale(text, uuid, text, numeric, date, text);

create or replace function public.record_sale(
  p_code             text,
  p_inventory_lot_id uuid,
  p_buyer_name       text,
  p_buyer_org_id     uuid,
  p_volume           numeric,
  p_sale_date        date,
  p_notes            text,
  p_response_days    integer default 14
) returns sales
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_org       uuid := get_my_org_id();
  v_remaining numeric;
  v_sale      sales;
  v_status    public.sale_status;
  v_deadline  timestamptz;
begin
  if v_org is null then
    raise exception 'no_organization';
  end if;

  select volume_remaining
    into v_remaining
    from inventory_lots
   where id = p_inventory_lot_id
     and organization_id = v_org
   for update;

  if v_remaining is null then
    raise exception 'lot_not_found';
  end if;
  if v_remaining < p_volume then
    raise exception 'insufficient_volume';
  end if;

  update inventory_lots
     set volume_remaining = volume_remaining - p_volume
   where id = p_inventory_lot_id;

  -- Buyer type determines initial status
  if p_buyer_org_id is not null then
    v_status := 'pending';
    v_deadline := now() + (p_response_days || ' days')::interval;
  else
    v_status := 'accepted';
    v_deadline := null;
  end if;

  insert into sales (
    code, organization_id, inventory_lot_id, buyer_name, buyer_org_id,
    volume, volume_unit, sale_date, notes, created_by,
    status, response_deadline,
    accepted_at
  )
  values (
    p_code, v_org, p_inventory_lot_id, p_buyer_name, p_buyer_org_id,
    p_volume, 'tonnes', p_sale_date, p_notes, auth.uid(),
    v_status, v_deadline,
    case when v_status = 'accepted' then now() else null end
  )
  returning * into v_sale;

  return v_sale;
end;
$function$;

-- ─────────────────────────────────────────
-- Section 4: accept_sale RPC
-- ─────────────────────────────────────────
create or replace function public.accept_sale(
  p_sale_id uuid,
  p_notes   text default null
) returns sales
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_sale       sales;
  v_my_org     uuid := get_my_org_id();
begin
  select * into v_sale
    from sales
   where id = p_sale_id
   for update;

  if v_sale.id is null then
    raise exception 'sale_not_found';
  end if;
  if v_sale.buyer_org_id is null or v_sale.buyer_org_id != v_my_org then
    raise exception 'not_your_sale';
  end if;
  if v_sale.status != 'pending' then
    raise exception 'sale_not_pending';
  end if;

  update sales
     set status = 'accepted',
         accepted_at = now(),
         response_notes = p_notes
   where id = p_sale_id
   returning * into v_sale;

  return v_sale;
end;
$function$;

-- ─────────────────────────────────────────
-- Section 5: reject_sale RPC (restores volume to lot)
-- ─────────────────────────────────────────
create or replace function public.reject_sale(
  p_sale_id uuid,
  p_notes   text default null
) returns sales
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_sale       sales;
  v_my_org     uuid := get_my_org_id();
begin
  select * into v_sale
    from sales
   where id = p_sale_id
   for update;

  if v_sale.id is null then
    raise exception 'sale_not_found';
  end if;
  if v_sale.buyer_org_id is null or v_sale.buyer_org_id != v_my_org then
    raise exception 'not_your_sale';
  end if;
  if v_sale.status != 'pending' then
    raise exception 'sale_not_pending';
  end if;

  -- Restore volume to the inventory lot
  update inventory_lots
     set volume_remaining = volume_remaining + v_sale.volume
   where id = v_sale.inventory_lot_id;

  update sales
     set status = 'rejected',
         rejected_at = now(),
         response_notes = p_notes
   where id = p_sale_id
   returning * into v_sale;

  return v_sale;
end;
$function$;

-- ─────────────────────────────────────────
-- Section 6: update sales RLS so buyer_org can see incoming sales
-- ─────────────────────────────────────────
drop policy if exists sales_select on sales;

create policy sales_select on sales
for select to authenticated
using (
  is_admin()
  or organization_id = get_my_org_id()
  or buyer_org_id = get_my_org_id()
);

commit;