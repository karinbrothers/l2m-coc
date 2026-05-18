-- Migration 60: defaults for organization role flags
-- ============================================================
-- The is_first_stage_processor and is_final_brand columns are
-- NOT NULL but have no default. If anything ever inserts an org
-- row without explicitly setting them — like a bulk upsert that
-- somehow drops false values — the INSERT fails. Defaulting to
-- false matches the semantics ("most orgs aren't FSPs or final
-- brands") and makes the sync resilient.

ALTER TABLE public.organizations
  ALTER COLUMN is_first_stage_processor SET DEFAULT false,
  ALTER COLUMN is_final_brand SET DEFAULT false;