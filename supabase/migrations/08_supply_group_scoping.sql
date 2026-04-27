-- Migration 08: Supply group scoping
--
-- - Adds Salesforce Account status columns to organizations.
-- - Replaces the flat supply_groups join table with a proper Supply Group entity
--   plus a supply_group_landbases junction (mirroring Salesforce's Landbase_Association__c).
-- - Updates the landbases RLS policy so partners only see landbases linked via a
--   supply group their organization owns; admins still see everything.

BEGIN;

-- 1. organizations: Salesforce Account status fields + ensure salesforce_id is unique
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS brand_partner_status text,
  ADD COLUMN IF NOT EXISTS supply_chain_partner_status text,
  ADD COLUMN IF NOT EXISTS l2m_retailer_status text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'organizations'::regclass
      AND conname  = 'organizations_salesforce_id_key'
  ) THEN
    ALTER TABLE organizations
      ADD CONSTRAINT organizations_salesforce_id_key UNIQUE (salesforce_id);
  END IF;
END $$;

-- 2. Drop the old flat supply_groups table (nothing reads from it yet)
DROP TABLE IF EXISTS supply_groups CASCADE;

-- 3. New supply_groups entity table — one row per Salesforce Supply_Group__c
CREATE TABLE supply_groups (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  salesforce_id   text NOT NULL UNIQUE,
  name            text NOT NULL,
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX supply_groups_organization_id_idx ON supply_groups(organization_id);

-- 4. Junction: maps supply groups to landbases (mirrors Landbase_Association__c)
CREATE TABLE supply_group_landbases (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  salesforce_id      text NOT NULL UNIQUE,
  supply_group_id    uuid NOT NULL REFERENCES supply_groups(id) ON DELETE CASCADE,
  landbase_id        uuid NOT NULL REFERENCES landbases(id)     ON DELETE CASCADE,
  association_status text,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX supply_group_landbases_supply_group_id_idx ON supply_group_landbases(supply_group_id);
CREATE INDEX supply_group_landbases_landbase_id_idx     ON supply_group_landbases(landbase_id);

-- 5. RLS on the new tables: authenticated users can read so the landbases policy
--    can join through them. Writes are server-side only (service role).
ALTER TABLE supply_groups            ENABLE ROW LEVEL SECURITY;
ALTER TABLE supply_group_landbases   ENABLE ROW LEVEL SECURITY;

CREATE POLICY supply_groups_authenticated_read
  ON supply_groups
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY supply_group_landbases_authenticated_read
  ON supply_group_landbases
  FOR SELECT TO authenticated
  USING (true);

-- 6. Replace the landbases SELECT policy with the supply-group-scoped version
--    (drops any existing SELECT policy on landbases, regardless of name)
DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'landbases'
      AND cmd        = 'SELECT'
  LOOP
    EXECUTE format('DROP POLICY %I ON landbases', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY landbases_visible_via_supply_group
  ON landbases
  FOR SELECT
  USING (
    -- Admins see everything
    EXISTS (
      SELECT 1
      FROM profiles p
      WHERE p.id   = auth.uid()
        AND p.role = 'admin'
    )
    OR
    -- Partners see only landbases linked to a supply group their org owns
    EXISTS (
      SELECT 1
      FROM supply_group_landbases sgl
      JOIN supply_groups sg ON sg.id = sgl.supply_group_id
      JOIN profiles p       ON p.organization_id = sg.organization_id
      WHERE sgl.landbase_id = landbases.id
        AND p.id            = auth.uid()
    )
  );

COMMIT;