-- ============================================================
-- LAND TO MARKET — Seed Data for Sandbox Testing
-- Run this in Supabase SQL Editor after 01_schema.sql
-- ============================================================

-- ─────────────────────────────────────────
-- 1. ORGANIZATIONS
-- ─────────────────────────────────────────
INSERT INTO organizations (id, name, type, address, country) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'Land to Market', 'admin', '885 Arapahoe Ave, Boulder, CO 80302', 'United States'),
  ('a0000000-0000-0000-0000-000000000002', 'Southern Wool Traders', 'fsp', 'Montevideo', 'Uruguay'),
  ('a0000000-0000-0000-0000-000000000003', 'Riverside Textiles Ltd', 'processor', 'Milan', 'Italy'),
  ('a0000000-0000-0000-0000-000000000004', 'Alpine Fibre Co', 'processor', 'Munich', 'Germany'),
  ('a0000000-0000-0000-0000-000000000005', 'Maison Étoile', 'brand', 'Paris', 'France');

-- ─────────────────────────────────────────
-- 2. LANDBASES
-- ─────────────────────────────────────────
INSERT INTO landbases (id, name, country, eligibility_status, eligibility_report_id, hub_name, monitoring_date, verification_date, expiration_date) VALUES
  ('b0000000-0000-0000-0000-000000000001', 'Estancia La Esperanza', 'Uruguay', 'eligible', 'LER-2025-0041', 'Ovis XXI', '2025-08-15', '2025-09-01', '2026-09-01'),
  ('b0000000-0000-0000-0000-000000000002', 'West Bijou Ranch', 'United States', 'eligible', 'LER-2025-0087', 'Savory Institute', '2025-07-20', '2025-08-10', '2026-08-10'),
  ('b0000000-0000-0000-0000-000000000003', 'Doñana Pastoral', 'Spain', 'eligible', 'LER-2025-0112', 'AlVelAl', '2025-06-10', '2025-07-01', '2026-07-01'),
  ('b0000000-0000-0000-0000-000000000004', 'Canterbury Downs', 'New Zealand', 'expired', 'LER-2024-0033', 'NZ Hub', '2024-03-15', '2024-04-01', '2025-04-01'),
  ('b0000000-0000-0000-0000-000000000005', 'Karoo Highlands', 'South Africa', 'eligible', 'LER-2025-0156', 'Africa Centre for HM', '2025-09-01', '2025-09-20', '2026-09-20');

-- ─────────────────────────────────────────
-- 3. SUPPLY GROUPS (Southern Wool Traders can buy from these landbases)
-- ─────────────────────────────────────────
INSERT INTO supply_groups (organization_id, landbase_id) VALUES
  ('a0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001'),
  ('a0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000002'),
  ('a0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000003'),
  ('a0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000004'),
  ('a0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000005');

-- ─────────────────────────────────────────
-- 4. RAW MATERIAL PURCHASES (FSP has bought from 4 landbases)
-- ─────────────────────────────────────────
INSERT INTO raw_material_purchases (id, code, organization_id, landbase_id, volume, volume_remaining, volume_unit, commodity_type, fibre_diameter, year_of_clip, batch_number, purchase_date) VALUES
  ('c0000000-0000-0000-0000-000000000001', '001', 'a0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', 10, 6, 'tonnes', 'wool', 17.0, 2025, 'SW-2025-A1', '2026-02-15'),
  ('c0000000-0000-0000-0000-000000000002', '002', 'a0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000002', 20, 10, 'tonnes', 'wool', 20.0, 2025, 'SW-2025-A2', '2026-02-18'),
  ('c0000000-0000-0000-0000-000000000003', '003', 'a0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000003', 15, 5, 'tonnes', 'wool', 22.0, 2025, 'SW-2025-B1', '2026-03-01'),
  ('c0000000-0000-0000-0000-000000000004', '004', 'a0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000005', 5, 0, 'tonnes', 'wool', 13.0, 2025, 'SW-2025-B2', '2026-03-05');

-- ─────────────────────────────────────────
-- 5. PROCESSING BATCH (FSP processed batches 001-004 into wool top)
-- ─────────────────────────────────────────
INSERT INTO processing_batches (id, organization_id, input_total_volume, output_volume, output_product, processing_method, processing_date) VALUES
  ('d0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 29, 15, 'Wool Top 19.3 Micron', 'Scouring, Carding, Combing', '2026-03-20');

-- ─────────────────────────────────────────
-- 6. PROCESSING BATCH INPUTS
-- ─────────────────────────────────────────
INSERT INTO processing_batch_inputs (processing_batch_id, source_type, source_id, volume_used) VALUES
  ('d0000000-0000-0000-0000-000000000001', 'raw_purchase', 'c0000000-0000-0000-0000-000000000001', 4),
  ('d0000000-0000-0000-0000-000000000001', 'raw_purchase', 'c0000000-0000-0000-0000-000000000002', 10),
  ('d0000000-0000-0000-0000-000000000001', 'raw_purchase', 'c0000000-0000-0000-0000-000000000003', 10),
  ('d0000000-0000-0000-0000-000000000001', 'raw_purchase', 'c0000000-0000-0000-0000-000000000004', 5);

-- ─────────────────────────────────────────
-- 7. INVENTORY LOT (result of the processing)
-- ─────────────────────────────────────────
INSERT INTO inventory_lots (id, code, organization_id, processing_batch_id, product_name, total_volume, volume_remaining, volume_unit) VALUES
  ('e0000000-0000-0000-0000-000000000001', 'A1', 'a0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000001', 'Wool Top 19.3 Micron', 15, 15, 'tonnes');

-- ─────────────────────────────────────────
-- 8. ORIGIN CERTIFICATES (for each purchase)
-- ─────────────────────────────────────────
INSERT INTO certificates (id, certificate_number, type, issued_at, related_purchase_id) VALUES
  ('f0000000-0000-0000-0000-000000000001', 'L2M-OC-2026-00001', 'origin', '2026-02-15', 'c0000000-0000-0000-0000-000000000001'),
  ('f0000000-0000-0000-0000-000000000002', 'L2M-OC-2026-00002', 'origin', '2026-02-18', 'c0000000-0000-0000-0000-000000000002'),
  ('f0000000-0000-0000-0000-000000000003', 'L2M-OC-2026-00003', 'origin', '2026-03-01', 'c0000000-0000-0000-0000-000000000003'),
  ('f0000000-0000-0000-0000-000000000004', 'L2M-OC-2026-00004', 'origin', '2026-03-05', 'c0000000-0000-0000-0000-000000000004');

-- Update the certificate sequence to start after our seeded data
SELECT setval('certificate_seq', 10);

-- ============================================================
-- DONE! Your sandbox has test data ready to go.
--
-- You now have:
-- • 5 organizations (L2M admin, 1 FSP, 2 processors, 1 brand)
-- • 5 landbases (4 eligible, 1 expired)
-- • 4 raw material purchases by the FSP
-- • 1 processing batch (29t greasy wool → 15t wool top)
-- • 1 inventory lot ready for sale (15t wool top, code A1)
-- • 4 origin certificates
--
-- The supply chain is ready for the FSP to sell lot A1
-- to Riverside Textiles, who will process and sell onward.
-- ============================================================
