-- Migration 59: extend eligibility_status enum
-- ============================================================
-- The Salesforce L2M_Landbase_Eligibility__c picklist has values
-- "Eligible", "Ineligible", and "Pending". Our existing enum only
-- accepted eligible/expired/suspended, so the sync was rejecting
-- the ~610 Ineligible landbases with "invalid input value for
-- enum eligibility_status".
--
-- Add the two missing values. IF NOT EXISTS makes this safe to
-- re-run.

ALTER TYPE public.eligibility_status ADD VALUE IF NOT EXISTS 'ineligible';
ALTER TYPE public.eligibility_status ADD VALUE IF NOT EXISTS 'pending';