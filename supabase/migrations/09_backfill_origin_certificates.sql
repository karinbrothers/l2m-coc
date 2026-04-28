-- ─────────────────────────────────────────
-- 09. Backfill origin certificates
-- ─────────────────────────────────────────
-- Day 11: every raw_material_purchase now auto-generates an origin
-- certificate at creation time (see src/app/purchases/actions.ts).
-- This migration backfills existing purchases that pre-date the change.
-- Idempotent: the LEFT JOIN guard skips purchases that already have one.

INSERT INTO certificates (certificate_number, type, related_purchase_id)
SELECT
  'OC-' || p.code,
  'origin'::certificate_type,
  p.id
FROM raw_material_purchases p
LEFT JOIN certificates c
  ON c.related_purchase_id = p.id AND c.type = 'origin'
WHERE c.id IS NULL;
