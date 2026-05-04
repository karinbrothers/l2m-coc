-- Migration 20: partner request flow
--
-- Sellers can submit a request to add a company that's not yet a platform
-- partner. Admins triage the queue, manually add the company to
-- Salesforce, and the next sync pulls it in as an org. Once the org
-- exists, admin marks the request approved and links the new org_id.

begin;

-- ─────────────────────────────────────────
-- Section 1: enum
-- ─────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'partner_request_status' and n.nspname = 'public'
  ) then
    create type public.partner_request_status as enum (
      'pending', 'approved', 'rejected'
    );
  end if;
end $$;

-- ─────────────────────────────────────────
-- Section 2: table
-- ─────────────────────────────────────────
create table if not exists public.partner_requests (
  id uuid primary key default gen_random_uuid(),
  requested_by_user_id uuid references auth.users(id) on delete set null,
  requested_by_org_id  uuid not null references organizations(id) on delete cascade,
  company_name         text not null,
  contact_name         text,
  contact_email        text,
  country              text,
  notes                text,
  status               public.partner_request_status not null default 'pending',
  admin_notes          text,
  resolved_org_id      uuid references organizations(id) on delete set null,
  created_at           timestamptz not null default now(),
  resolved_at          timestamptz
);

create index if not exists idx_partner_requests_org    on partner_requests(requested_by_org_id);
create index if not exists idx_partner_requests_status on partner_requests(status);

-- ─────────────────────────────────────────
-- Section 3: RLS
-- ─────────────────────────────────────────
alter table partner_requests enable row level security;

drop policy if exists partner_requests_select on partner_requests;
drop policy if exists partner_requests_insert on partner_requests;
drop policy if exists partner_requests_update on partner_requests;

create policy partner_requests_select on partner_requests
for select to authenticated
using (
  is_admin()
  or requested_by_org_id = get_my_org_id()
);

create policy partner_requests_insert on partner_requests
for insert to authenticated
with check (
  requested_by_org_id = get_my_org_id()
  and requested_by_user_id = auth.uid()
);

create policy partner_requests_update on partner_requests
for update to authenticated
using (is_admin());

commit;