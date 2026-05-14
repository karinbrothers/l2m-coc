-- Migration 51: OC buyer-org snapshot
-- ============================================================
-- Origin certificates had every snapshot field except the org
-- that made the purchase. TC has seller_org_name_snapshot;
-- OC didn't have an equivalent, so OC Box 2 ("First Stage
-- Processor / Buyer") rendered blank because the joined org
-- was blocked by RLS when chain participants viewed the cert.
--
-- Add the column, backfill from raw_material_purchases ↔ orgs,
-- and createPurchase will populate it for new OCs.

alter table public.certificates
  add column if not exists buyer_org_name_snapshot text;

-- Backfill existing OCs
update public.certificates c
   set buyer_org_name_snapshot = o.name
  from public.raw_material_purchases p
  join public.organizations o on o.id = p.organization_id
 where c.type = 'origin'
   and c.related_purchase_id = p.id
   and c.buyer_org_name_snapshot is null;