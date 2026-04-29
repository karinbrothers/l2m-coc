-- ============================================================================
-- Migration 11: Transaction Certificates
-- - Repair FK on certificates.related_transaction_id (was pointing at the
--   legacy sale_transactions table; should point at sales)
-- - Add snapshot columns on certificates for transaction certificates
-- - Add certificate_origin_links join table for chain-of-custody lineage
-- - Backfill: origin certs for purchases, TCs for sales, links for TCs
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 0. Repair FK: certificates.related_transaction_id -> sales(id)
-- ----------------------------------------------------------------------------
alter table public.certificates
  drop constraint if exists certificates_related_transaction_id_fkey;

alter table public.certificates
  add constraint certificates_related_transaction_id_fkey
  foreign key (related_transaction_id)
  references public.sales(id)
  on delete set null;


-- ----------------------------------------------------------------------------
-- 1. Snapshot columns on certificates (populated when a TC is issued)
-- ----------------------------------------------------------------------------
alter table public.certificates
  add column if not exists sale_code text,
  add column if not exists buyer_name_snapshot text,
  add column if not exists seller_org_name_snapshot text,
  add column if not exists sale_date_snapshot date;


-- ----------------------------------------------------------------------------
-- 2. certificate_origin_links — joins a TC to one or more origin certs
-- ----------------------------------------------------------------------------
create table if not exists public.certificate_origin_links (
  id uuid primary key default gen_random_uuid(),
  transaction_certificate_id uuid not null
    references public.certificates(id) on delete cascade,
  origin_certificate_id uuid not null
    references public.certificates(id) on delete restrict,
  volume_attributed numeric(12,3),
  created_at timestamptz not null default now(),
  unique (transaction_certificate_id, origin_certificate_id)
);

create index if not exists certificate_origin_links_tc_idx
  on public.certificate_origin_links(transaction_certificate_id);

create index if not exists certificate_origin_links_oc_idx
  on public.certificate_origin_links(origin_certificate_id);

alter table public.certificate_origin_links enable row level security;

-- A user can read a link if they can see the underlying sale's organization
-- (admins see everything).
drop policy if exists "read_links_by_org" on public.certificate_origin_links;
create policy "read_links_by_org"
  on public.certificate_origin_links
  for select
  using (
    exists (
      select 1
      from public.certificates tc
      join public.sales s on s.id = tc.related_transaction_id
      where tc.id = transaction_certificate_id
        and (
          s.organization_id = (
            select organization_id from public.profiles where id = auth.uid()
          )
          or (
            select role from public.profiles where id = auth.uid()
          ) = 'admin'
        )
    )
  );


-- ----------------------------------------------------------------------------
-- 3. Backfill — three resilient steps, each independently safe to re-run.
--    Any step that conflicts with existing rows simply skips them.
-- ----------------------------------------------------------------------------

-- 3a. Origin certs: one OC per purchase that doesn't have one yet.
insert into public.certificates (
  certificate_number,
  type,
  related_purchase_id,
  purchase_code,
  purchase_date,
  landbase_name_snapshot,
  country_snapshot,
  commodity_type,
  volume,
  volume_unit
)
select
  'OC-' || p.code,
  'origin',
  p.id,
  p.code,
  p.purchase_date,
  l.name,
  l.country,
  p.commodity_type,
  p.volume,
  p.volume_unit
from public.raw_material_purchases p
left join public.landbases l on l.id = p.landbase_id
where not exists (
  select 1
  from public.certificates c
  where c.related_purchase_id = p.id
    and c.type = 'origin'
)
on conflict (certificate_number) do nothing;

-- 3b. Transaction certs: one TC per sale that doesn't have one yet.
insert into public.certificates (
  certificate_number,
  type,
  related_transaction_id,
  sale_code,
  buyer_name_snapshot,
  seller_org_name_snapshot,
  sale_date_snapshot,
  volume,
  volume_unit,
  commodity_type,
  purchase_code,
  purchase_date
)
select
  'TC-' || s.code,
  'transaction',
  s.id,
  s.code,
  s.buyer_name,
  o.name,
  s.sale_date,
  s.volume,
  s.volume_unit,
  p.commodity_type,
  p.code,
  p.purchase_date
from public.sales s
join public.raw_material_purchases p on p.id = s.source_purchase_id
join public.organizations o on o.id = s.organization_id
where not exists (
  select 1
  from public.certificates c
  where c.related_transaction_id = s.id
    and c.type = 'transaction'
)
on conflict (certificate_number) do nothing;

-- 3c. Links: each TC -> the origin cert of its source purchase.
insert into public.certificate_origin_links (
  transaction_certificate_id,
  origin_certificate_id,
  volume_attributed
)
select
  tc.id,
  oc.id,
  s.volume
from public.certificates tc
join public.sales s on s.id = tc.related_transaction_id
join public.certificates oc
  on oc.related_purchase_id = s.source_purchase_id
  and oc.type = 'origin'
where tc.type = 'transaction'
on conflict (transaction_certificate_id, origin_certificate_id) do nothing;