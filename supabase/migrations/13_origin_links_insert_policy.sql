-- Migration 13: allow org members + admins to insert into certificate_origin_links
-- Mirrors the existing read_links_by_org SELECT policy.

create policy insert_links_by_org on certificate_origin_links
for insert to authenticated
with check (
  is_admin()
  or exists (
    select 1
    from certificates tc
    join sales s on s.id = tc.related_transaction_id
    where tc.id = certificate_origin_links.transaction_certificate_id
      and s.organization_id = get_my_org_id()
  )
);