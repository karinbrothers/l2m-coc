-- ================================================================
-- Land to Market — Chain of Custody
-- 03: Row-Level Security (RLS) Policies
-- ================================================================
-- Run this in the Supabase SQL Editor (clear previous, paste, Run)
-- ================================================================

-- ----------------------------------------------------------------
-- Helper: get the current user's organization_id from profiles
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_org_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT organization_id FROM public.profiles WHERE id = auth.uid();
$$;

-- Helper: check if current user is an admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    JOIN public.organizations o ON o.id = p.organization_id
    WHERE p.id = auth.uid()
      AND o.type = 'admin'
  );
$$;

-- ================================================================
-- ORGANIZATIONS
-- Everyone can read (needed for dropdowns/lookups).
-- Only admins can insert/update.
-- ================================================================
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "orgs_select_all"
  ON public.organizations FOR SELECT
  USING (true);

CREATE POLICY "orgs_admin_insert"
  ON public.organizations FOR INSERT
  WITH CHECK (public.is_admin());

CREATE POLICY "orgs_admin_update"
  ON public.organizations FOR UPDATE
  USING (public.is_admin());

-- ================================================================
-- PROFILES
-- Users can read all profiles (for messaging, display names).
-- Users can only update their own profile.
-- ================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select_all"
  ON public.profiles FOR SELECT
  USING (true);

CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  USING (id = auth.uid());

CREATE POLICY "profiles_insert_own"
  ON public.profiles FOR INSERT
  WITH CHECK (id = auth.uid());

-- ================================================================
-- LANDBASES
-- Everyone can read (FSPs select them, brands see origin info).
-- Only admins can insert/update (synced from Salesforce).
-- ================================================================
ALTER TABLE public.landbases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "landbases_select_all"
  ON public.landbases FOR SELECT
  USING (true);

CREATE POLICY "landbases_admin_insert"
  ON public.landbases FOR INSERT
  WITH CHECK (public.is_admin());

CREATE POLICY "landbases_admin_update"
  ON public.landbases FOR UPDATE
  USING (public.is_admin());

-- ================================================================
-- SUPPLY GROUPS
-- FSPs can see their own supply groups. Admins see all.
-- ================================================================
ALTER TABLE public.supply_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "supply_groups_select"
  ON public.supply_groups FOR SELECT
  USING (
    organization_id = public.get_my_org_id()
    OR public.is_admin()
  );

CREATE POLICY "supply_groups_admin_insert"
  ON public.supply_groups FOR INSERT
  WITH CHECK (public.is_admin());

CREATE POLICY "supply_groups_admin_update"
  ON public.supply_groups FOR UPDATE
  USING (public.is_admin());

-- ================================================================
-- RAW MATERIAL PURCHASES
-- Owning org can SELECT and INSERT. Admins see all.
-- ================================================================
ALTER TABLE public.raw_material_purchases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "purchases_select"
  ON public.raw_material_purchases FOR SELECT
  USING (
    organization_id = public.get_my_org_id()
    OR public.is_admin()
  );

CREATE POLICY "purchases_insert"
  ON public.raw_material_purchases FOR INSERT
  WITH CHECK (
    organization_id = public.get_my_org_id()
    OR public.is_admin()
  );

CREATE POLICY "purchases_update"
  ON public.raw_material_purchases FOR UPDATE
  USING (
    organization_id = public.get_my_org_id()
    OR public.is_admin()
  );

-- ================================================================
-- PROCESSING BATCHES
-- Owning org can SELECT and INSERT. Admins see all.
-- ================================================================
ALTER TABLE public.processing_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "batches_select"
  ON public.processing_batches FOR SELECT
  USING (
    organization_id = public.get_my_org_id()
    OR public.is_admin()
  );

CREATE POLICY "batches_insert"
  ON public.processing_batches FOR INSERT
  WITH CHECK (
    organization_id = public.get_my_org_id()
    OR public.is_admin()
  );

CREATE POLICY "batches_update"
  ON public.processing_batches FOR UPDATE
  USING (
    organization_id = public.get_my_org_id()
    OR public.is_admin()
  );

-- ================================================================
-- PROCESSING BATCH INPUTS
-- Same access as the parent batch.
-- ================================================================
ALTER TABLE public.processing_batch_inputs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "batch_inputs_select"
  ON public.processing_batch_inputs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.processing_batches b
      WHERE b.id = processing_batch_id
        AND (b.organization_id = public.get_my_org_id() OR public.is_admin())
    )
  );

CREATE POLICY "batch_inputs_insert"
  ON public.processing_batch_inputs FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.processing_batches b
      WHERE b.id = processing_batch_id
        AND (b.organization_id = public.get_my_org_id() OR public.is_admin())
    )
  );

-- ================================================================
-- INVENTORY LOTS
-- Owning org can SELECT, INSERT, UPDATE. Admins see all.
-- ================================================================
ALTER TABLE public.inventory_lots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lots_select"
  ON public.inventory_lots FOR SELECT
  USING (
    organization_id = public.get_my_org_id()
    OR public.is_admin()
  );

CREATE POLICY "lots_insert"
  ON public.inventory_lots FOR INSERT
  WITH CHECK (
    organization_id = public.get_my_org_id()
    OR public.is_admin()
  );

CREATE POLICY "lots_update"
  ON public.inventory_lots FOR UPDATE
  USING (
    organization_id = public.get_my_org_id()
    OR public.is_admin()
  );

-- ================================================================
-- SALE TRANSACTIONS
-- Seller sees outgoing, buyer sees incoming. Admins see all.
-- ================================================================
ALTER TABLE public.sale_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sales_select"
  ON public.sale_transactions FOR SELECT
  USING (
    seller_org_id = public.get_my_org_id()
    OR buyer_org_id = public.get_my_org_id()
    OR public.is_admin()
  );

CREATE POLICY "sales_insert"
  ON public.sale_transactions FOR INSERT
  WITH CHECK (
    seller_org_id = public.get_my_org_id()
    OR public.is_admin()
  );

CREATE POLICY "sales_update"
  ON public.sale_transactions FOR UPDATE
  USING (
    seller_org_id = public.get_my_org_id()
    OR buyer_org_id = public.get_my_org_id()
    OR public.is_admin()
  );

-- ================================================================
-- CERTIFICATES
-- Accessible to the org that created the related purchase,
-- the seller/buyer of the related transaction, or admins.
-- ================================================================
ALTER TABLE public.certificates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "certs_select"
  ON public.certificates FOR SELECT
  USING (
    public.is_admin()
    -- Origin certs: visible to the org that made the purchase
    OR EXISTS (
      SELECT 1 FROM public.raw_material_purchases p
      WHERE p.id = related_purchase_id
        AND p.organization_id = public.get_my_org_id()
    )
    -- Transaction certs: visible to seller or buyer
    OR EXISTS (
      SELECT 1 FROM public.sale_transactions s
      WHERE s.id = related_transaction_id
        AND (s.seller_org_id = public.get_my_org_id()
             OR s.buyer_org_id = public.get_my_org_id())
    )
  );

CREATE POLICY "certs_insert"
  ON public.certificates FOR INSERT
  WITH CHECK (public.is_admin());

CREATE POLICY "certs_admin_update"
  ON public.certificates FOR UPDATE
  USING (public.is_admin());

-- ================================================================
-- MESSAGES
-- Sender can see messages they sent.
-- Other party on the transaction can also see messages.
-- Admins see all.
-- ================================================================
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "messages_select"
  ON public.messages FOR SELECT
  USING (
    sender_org_id = public.get_my_org_id()
    OR public.is_admin()
    -- Also allow the other party on the transaction to see messages
    OR EXISTS (
      SELECT 1 FROM public.sale_transactions s
      WHERE s.id = transaction_id
        AND (s.seller_org_id = public.get_my_org_id()
             OR s.buyer_org_id = public.get_my_org_id())
    )
  );

CREATE POLICY "messages_insert"
  ON public.messages FOR INSERT
  WITH CHECK (
    sender_org_id = public.get_my_org_id()
    OR public.is_admin()
  );

-- ================================================================
-- AUDIT LOG
-- Only admins can read. Inserts allowed for triggers.
-- ================================================================
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_admin_select"
  ON public.audit_log FOR SELECT
  USING (public.is_admin());

CREATE POLICY "audit_insert"
  ON public.audit_log FOR INSERT
  WITH CHECK (true);

-- ================================================================
-- Done! Every table now has RLS enabled.
--
-- Summary:
--   • Admins (L2M staff) can see and manage everything
--   • FSPs see only their own purchases, batches, inventory, sales
--   • Processors see incoming transactions addressed to them
--   • Brands see certificates linked to their purchases
--   • Messages are visible to both parties on a transaction
--   • Audit log is admin-only
--   • Landbases and organizations readable by all (reference data)
-- ================================================================
