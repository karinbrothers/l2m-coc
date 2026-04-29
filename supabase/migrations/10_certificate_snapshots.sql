-- ─────────────────────────────────────────
-- 10. Certificate snapshot columns + backfill
-- ─────────────────────────────────────────
-- Day 11: certificates capture the state of the related purchase and
-- landbase at issue time, so the cert remains a faithful record even
-- if the underlying data changes later.
--
-- Step 1: add the snapshot columns (idempotent — safe to re-run)
-- Step 2: backfill existing origin certs from their related purchase + landbase
-- Note: this brings prod in line with staging, where these columns were
-- already added ad-hoc but never captured in a migration.

ALTER TABLE certificates
  ADD COLUMN IF NOT EXISTS landbase_id UUID REFERENCES landbases(id),
  ADD COLUMN IF NOT EXISTS landbase_eligibility_report_id UUID,
  ADD COLUMN IF NOT EXISTS landbase_name_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS country_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS eligibility_status_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS expiration_date_snapshot DATE,
  ADD COLUMN IF NOT EXISTS monitoring_date_snapshot DATE,
  ADD COLUMN IF NOT EXISTS verification_date_snapshot DATE,
  ADD COLUMN IF NOT EXISTS eligibility_report_url_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS purchase_code TEXT,
  ADD COLUMN IF NOT EXISTS volume NUMERIC,
  ADD COLUMN IF NOT EXISTS volume_unit TEXT,
  ADD COLUMN IF NOT EXISTS commodity_type TEXT,
  ADD COLUMN IF NOT EXISTS purchase_date DATE,
  ADD COLUMN IF NOT EXISTS clip_year_snapshot INTEGER,
  ADD COLUMN IF NOT EXISTS report_year_used INTEGER;

UPDATE certificates c
SET
  landbase_id = lb.id,
  landbase_name_snapshot = lb.name,
  country_snapshot = lb.country,
  eligibility_status_snapshot = lb.eligibility_status::text,
  expiration_date_snapshot = lb.expiration_date,
  monitoring_date_snapshot = lb.monitoring_date,
  verification_date_snapshot = lb.verification_date,
  eligibility_report_url_snapshot = lb.eligibility_report_url,
  purchase_code = p.code,
  volume = p.volume,
  volume_unit = p.volume_unit,
  commodity_type = p.commodity_type::text,
  purchase_date = p.purchase_date,
  clip_year_snapshot = p.year_of_clip,
  report_year_used = EXTRACT(YEAR FROM c.issued_at)::int
FROM raw_material_purchases p
JOIN landbases lb ON lb.id = p.landbase_id
WHERE c.related_purchase_id = p.id
  AND c.type = 'origin'
  AND c.landbase_name_snapshot IS NULL;
