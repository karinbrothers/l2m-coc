-- Migration 12: add remaining snapshot columns to certificates
-- Required by TC auto-issue in src/app/sales/actions.ts

alter table certificates
  add column if not exists commodity_type_snapshot text,
  add column if not exists volume_snapshot numeric,
  add column if not exists volume_unit_snapshot text,
  add column if not exists source_purchase_code_snapshot text;

-- Backfill existing transaction certs from their related sale + purchase
update certificates c
set
  volume_snapshot = s.volume,
  volume_unit_snapshot = coalesce(s.volume_unit, 'tonnes'),
  source_purchase_code_snapshot = p.code,
  commodity_type_snapshot = p.commodity_type::text
from sales s
join raw_material_purchases p on p.id = s.source_purchase_id
where c.related_transaction_id = s.id
  and c.type = 'transaction'
  and (
    c.commodity_type_snapshot is null
    or c.volume_snapshot is null
    or c.volume_unit_snapshot is null
    or c.source_purchase_code_snapshot is null
  );