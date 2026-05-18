-- Migration 61: drop the broken organizations stage-flags trigger
-- ============================================================
-- An old trigger `organizations_sync_stage_flags` fires BEFORE
-- INSERT/UPDATE on public.organizations and calls the function
-- public.sync_org_stage_flags(). The function was meant to derive
-- is_first_stage_processor and is_final_brand from
-- supply_chain_stage, but its current implementation overwrites
-- those columns with NULL — which then violates the NOT NULL
-- constraint and aborts every upsert. We discovered this when
-- the Salesforce sync started bulk-upserting orgs.
--
-- The Salesforce sync code (src/lib/salesforce/sync.ts) now
-- derives both flags in JavaScript before writing, so the trigger
-- is redundant. Drop it.
--
-- If anyone later wants a server-side guarantee that these flags
-- stay in sync with supply_chain_stage, we should rewrite the
-- function correctly (using LOWER(NEW.supply_chain_stage) IN
-- ('first_stage_processor', 'first stage processor') etc.) and
-- re-add the trigger via a future migration.

DROP TRIGGER IF EXISTS organizations_sync_stage_flags
  ON public.organizations;

DROP FUNCTION IF EXISTS public.sync_org_stage_flags();