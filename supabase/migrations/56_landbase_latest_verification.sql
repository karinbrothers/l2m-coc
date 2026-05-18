-- Migration 56: latest verification effective date
-- ============================================================
-- Mirrors the Salesforce field
-- Latest_Verification_Effective_Date__c on the Landbase object.
-- The existing verification_date column holds something else —
-- this new column captures the effective start of the landbase's
-- most recent verification window, used in the landbases table
-- and (eventually) for eligibility checks.

alter table public.landbases
  add column if not exists latest_verification_effective_date date;