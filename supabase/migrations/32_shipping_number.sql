-- Migration 32: Shipping number on sales
-- ============================================================
-- Adds a free-text shipping number / waybill / tracking number
-- column on sales, surfaced in TC Box 6 (Product and Shipping
-- Information). Optional — sellers can leave it blank if not
-- yet known at the time of sale creation.

alter table public.sales
  add column if not exists shipping_number text;