-- ============================================================
-- LAND TO MARKET — Chain of Custody Database Schema
-- Run this in Supabase SQL Editor (paste the whole thing and click "Run")
-- ============================================================

-- ─────────────────────────────────────────
-- 1. ENUMS
-- ─────────────────────────────────────────
CREATE TYPE org_type AS ENUM ('fsp', 'processor', 'brand', 'admin');
CREATE TYPE eligibility_status AS ENUM ('eligible', 'expired', 'suspended');
CREATE TYPE commodity_type AS ENUM ('wool', 'meat', 'leather', 'dairy', 'olives', 'grapes');
CREATE TYPE transaction_status AS ENUM ('pending', 'accepted', 'rejected', 'non_l2m');
CREATE TYPE certificate_type AS ENUM ('origin', 'transaction', 'product_verification');
CREATE TYPE user_role AS ENUM ('admin', 'member');

-- ─────────────────────────────────────────
-- 2. ORGANIZATIONS
-- ─────────────────────────────────────────
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type org_type NOT NULL,
  address TEXT,
  country TEXT,
  salesforce_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ─────────────────────────────────────────
-- 3. PROFILES (linked to Supabase Auth)
-- ─────────────────────────────────────────
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id),
  full_name TEXT,
  email TEXT,
  role user_role DEFAULT 'member',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ─────────────────────────────────────────
-- 4. LANDBASES
-- ─────────────────────────────────────────
CREATE TABLE landbases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  address TEXT,
  country TEXT,
  eligibility_status eligibility_status DEFAULT 'eligible',
  eligibility_report_id TEXT,
  monitoring_date DATE,
  verification_date DATE,
  expiration_date DATE,
  hub_name TEXT,
  salesforce_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ─────────────────────────────────────────
-- 5. SUPPLY GROUPS (which orgs can buy from which landbases)
-- ─────────────────────────────────────────
CREATE TABLE supply_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  landbase_id UUID NOT NULL REFERENCES landbases(id) ON DELETE CASCADE,
  UNIQUE(organization_id, landbase_id)
);

-- ─────────────────────────────────────────
-- 6. RAW MATERIAL PURCHASES
-- ─────────────────────────────────────────
CREATE TABLE raw_material_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  landbase_id UUID NOT NULL REFERENCES landbases(id),
  volume DECIMAL(12,3) NOT NULL CHECK (volume > 0),
  volume_remaining DECIMAL(12,3) NOT NULL CHECK (volume_remaining >= 0),
  volume_unit TEXT NOT NULL DEFAULT 'tonnes',
  commodity_type commodity_type NOT NULL DEFAULT 'wool',
  fibre_diameter DECIMAL(6,2),
  year_of_clip INTEGER,
  batch_number TEXT,
  purchase_date DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(organization_id, code)
);

-- ─────────────────────────────────────────
-- 7. PROCESSING BATCHES
-- ─────────────────────────────────────────
CREATE TABLE processing_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  input_total_volume DECIMAL(12,3) NOT NULL,
  output_volume DECIMAL(12,3) NOT NULL CHECK (output_volume > 0),
  output_product TEXT NOT NULL,
  processing_method TEXT,
  subcontractors TEXT,
  processing_date DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ─────────────────────────────────────────
-- 8. PROCESSING BATCH INPUTS (junction table)
-- ─────────────────────────────────────────
CREATE TABLE processing_batch_inputs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  processing_batch_id UUID NOT NULL REFERENCES processing_batches(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN ('raw_purchase', 'inventory_lot')),
  source_id UUID NOT NULL,
  volume_used DECIMAL(12,3) NOT NULL CHECK (volume_used > 0)
);

-- ─────────────────────────────────────────
-- 9. INVENTORY LOTS (processed material available for sale)
-- ─────────────────────────────────────────
CREATE TABLE inventory_lots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  processing_batch_id UUID REFERENCES processing_batches(id),
  product_name TEXT NOT NULL,
  total_volume DECIMAL(12,3) NOT NULL CHECK (total_volume > 0),
  volume_remaining DECIMAL(12,3) NOT NULL CHECK (volume_remaining >= 0),
  volume_unit TEXT NOT NULL DEFAULT 'tonnes',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(organization_id, code)
);

-- ─────────────────────────────────────────
-- 10. SALE TRANSACTIONS
-- ─────────────────────────────────────────
CREATE TABLE sale_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  certificate_id_number TEXT UNIQUE,
  seller_org_id UUID NOT NULL REFERENCES organizations(id),
  buyer_org_id UUID REFERENCES organizations(id),
  inventory_lot_id UUID NOT NULL REFERENCES inventory_lots(id),
  volume DECIMAL(12,3) NOT NULL CHECK (volume > 0),
  status transaction_status NOT NULL DEFAULT 'pending',
  is_non_l2m_sale BOOLEAN DEFAULT false,
  product_name TEXT,
  order_number TEXT,
  input_certificate_id TEXT,
  submitted_at TIMESTAMPTZ DEFAULT now(),
  accepted_at TIMESTAMPTZ,
  response_deadline TIMESTAMPTZ,
  locked BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ─────────────────────────────────────────
-- 11. CERTIFICATES
-- ─────────────────────────────────────────
CREATE TABLE certificates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  certificate_number TEXT UNIQUE NOT NULL,
  type certificate_type NOT NULL,
  pdf_storage_path TEXT,
  issued_at TIMESTAMPTZ DEFAULT now(),
  related_transaction_id UUID REFERENCES sale_transactions(id),
  related_purchase_id UUID REFERENCES raw_material_purchases(id)
);

-- ─────────────────────────────────────────
-- 12. MESSAGES (transaction-specific messaging)
-- ─────────────────────────────────────────
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID REFERENCES sale_transactions(id),
  sender_user_id UUID REFERENCES profiles(id),
  sender_org_id UUID REFERENCES organizations(id),
  body TEXT NOT NULL,
  sent_at TIMESTAMPTZ DEFAULT now()
);

-- ─────────────────────────────────────────
-- 13. AUDIT LOG
-- ─────────────────────────────────────────
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  organization_id UUID,
  action TEXT NOT NULL,
  table_name TEXT,
  record_id UUID,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ─────────────────────────────────────────
-- 14. SEQUENCES (for certificate numbering)
-- ─────────────────────────────────────────
CREATE SEQUENCE certificate_seq START WITH 1;

-- ─────────────────────────────────────────
-- 15. HELPER FUNCTION: Generate certificate number
-- ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION generate_certificate_number(cert_type TEXT)
RETURNS TEXT AS $$
DECLARE
  prefix TEXT;
  seq_val INT;
  year_str TEXT;
BEGIN
  year_str := EXTRACT(YEAR FROM now())::TEXT;
  IF cert_type = 'origin' THEN prefix := 'L2M-OC';
  ELSIF cert_type = 'transaction' THEN prefix := 'L2M-TC';
  ELSIF cert_type = 'product_verification' THEN prefix := 'L2M-PV';
  ELSE prefix := 'L2M-XX';
  END IF;
  seq_val := nextval('certificate_seq');
  RETURN prefix || '-' || year_str || '-' || LPAD(seq_val::TEXT, 5, '0');
END;
$$ LANGUAGE plpgsql;

-- ─────────────────────────────────────────
-- 16. TRIGGER: Auto-set response deadline (14 days from submission)
-- ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_response_deadline()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.response_deadline IS NULL AND NEW.status = 'pending' THEN
    NEW.response_deadline := NEW.submitted_at + INTERVAL '14 days';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_set_response_deadline
  BEFORE INSERT ON sale_transactions
  FOR EACH ROW EXECUTE FUNCTION set_response_deadline();

-- ─────────────────────────────────────────
-- 17. TRIGGER: Lock records on acceptance
-- ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION lock_on_accept()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'accepted' AND OLD.status = 'pending' THEN
    NEW.locked := true;
    NEW.accepted_at := now();
  END IF;
  IF OLD.locked = true THEN
    RAISE EXCEPTION 'This transaction is locked and cannot be modified';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_lock_on_accept
  BEFORE UPDATE ON sale_transactions
  FOR EACH ROW EXECUTE FUNCTION lock_on_accept();

-- ─────────────────────────────────────────
-- 18. INDEXES
-- ─────────────────────────────────────────
CREATE INDEX idx_profiles_org ON profiles(organization_id);
CREATE INDEX idx_raw_purchases_org ON raw_material_purchases(organization_id);
CREATE INDEX idx_processing_batches_org ON processing_batches(organization_id);
CREATE INDEX idx_inventory_lots_org ON inventory_lots(organization_id);
CREATE INDEX idx_sale_transactions_seller ON sale_transactions(seller_org_id);
CREATE INDEX idx_sale_transactions_buyer ON sale_transactions(buyer_org_id);
CREATE INDEX idx_sale_transactions_status ON sale_transactions(status);
CREATE INDEX idx_certificates_type ON certificates(type);
CREATE INDEX idx_messages_transaction ON messages(transaction_id);
CREATE INDEX idx_audit_log_action ON audit_log(action);

-- ============================================================
-- DONE! Your database schema is ready.
-- ============================================================
