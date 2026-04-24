-- Salesforce sync: add URL + bookkeeping columns to landbases,
-- create credentials table for storing OAuth refresh token, and
-- add an eligibility helper used later by origin cert generation.

-- 1. Add sync columns to landbases
alter table public.landbases
  add column if not exists eligibility_report_url text,
  add column if not exists last_synced_at timestamptz,
  add column if not exists sync_source text
    default 'manual'
    check (sync_source in ('manual', 'salesforce'));

-- 2. Enforce uniqueness of the Salesforce record ID when set
create unique index if not exists landbases_salesforce_id_unique
  on public.landbases (salesforce_id)
  where salesforce_id is not null;

-- 3. Credentials table: one row per org holds the SF refresh token + instance URL
create table if not exists public.salesforce_credentials (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  instance_url text not null,
  refresh_token text not null,
  connected_by uuid references public.profiles(id) on delete set null,
  connected_at timestamptz not null default now(),
  last_sync_at timestamptz,
  last_sync_status text check (last_sync_status in ('success', 'failure')),
  last_sync_error text,
  unique (organization_id)
);

-- 4. RLS — only admins of the owning org can read or modify credentials
alter table public.salesforce_credentials enable row level security;

create policy "sf_creds_admin_select"
  on public.salesforce_credentials
  for select to authenticated
  using (organization_id = public.get_my_org_id() and public.is_admin());

create policy "sf_creds_admin_insert"
  on public.salesforce_credentials
  for insert to authenticated
  with check (organization_id = public.get_my_org_id() and public.is_admin());

create policy "sf_creds_admin_update"
  on public.salesforce_credentials
  for update to authenticated
  using (organization_id = public.get_my_org_id() and public.is_admin())
  with check (organization_id = public.get_my_org_id() and public.is_admin());

create policy "sf_creds_admin_delete"
  on public.salesforce_credentials
  for delete to authenticated
  using (organization_id = public.get_my_org_id() and public.is_admin());

-- 5. Helper: is this landbase currently eligible on a given date?
--    Gate used by origin cert generation on Day 10.
create or replace function public.landbase_is_eligible_on(
  p_landbase_id uuid,
  p_date date
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    eligibility_status = 'eligible'
    and (expiration_date is null or expiration_date >= p_date)
  from public.landbases
  where id = p_landbase_id;
$$;

grant execute on function public.landbase_is_eligible_on(uuid, date) to authenticated;