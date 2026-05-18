-- Migration 57: drop unused latest_verification_effective_date column
-- ============================================================
-- Migration 56 added this column expecting we'd need it to mirror
-- the Salesforce Latest_Verification_Effective_Date__c field. We
-- later realised the existing landbases.verification_date column
-- already holds exactly that data (the sync was already mapping
-- Latest_Verification_Effective_Date__c → verification_date), so
-- this new column is redundant and was never populated.
--
-- Drop it to keep the schema clean.

alter table public.landbases
  drop column if exists latest_verification_effective_date;