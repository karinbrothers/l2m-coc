-- ════════════════════════════════════════════════════════════════════════════
-- 04 — Auth user trigger: auto-create profile rows
--
-- When a new row is inserted into auth.users (magic link signup, email+password
-- signup, OAuth, whatever), automatically insert a matching row into
-- public.profiles so the rest of the app can rely on profile existence for
-- every authenticated user.
--
-- The new profile starts with:
--   organization_id = NULL  (set by the invite flow on Day 5)
--   role            = 'member'
--   full_name       = whatever was provided in raw_user_meta_data (or NULL)
--
-- SECURITY DEFINER is required because the trigger fires in the auth schema
-- context, where the new user does not yet have any app-level permissions
-- and cannot insert into public.profiles on their own.
--
-- Idempotent — safe to re-run. Also backfills profiles for any auth.users
-- rows that were created before this migration existed (e.g. Karin's own
-- account from Day 4 Block 1 testing).
-- ════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────
-- 1. Function: handle_new_user
-- ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, organization_id, role)
  VALUES (
    NEW.id,
    NEW.email,
    NULLIF(NEW.raw_user_meta_data->>'full_name', ''),
    NULL,      -- organization_id is set by the invite flow (Day 5)
    'member'   -- default role; admins are promoted manually for MVP
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_new_user() IS
  'Inserts a profiles row when a new auth.users row is created. Called by the on_auth_user_created trigger.';

-- ─────────────────────────────────────────
-- 2. Trigger: on_auth_user_created
-- ─────────────────────────────────────────
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ─────────────────────────────────────────
-- 3. Backfill: profile rows for existing auth.users
-- ─────────────────────────────────────────
-- Anyone who already signed up before this migration (i.e. the dev account
-- created on Day 4 Block 1 while testing magic link) gets a profile now.
INSERT INTO public.profiles (id, email, full_name, organization_id, role)
SELECT
  u.id,
  u.email,
  NULLIF(u.raw_user_meta_data->>'full_name', ''),
  NULL,
  'member'
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL;

-- ─────────────────────────────────────────
-- 4. Verify
-- ─────────────────────────────────────────
-- Uncomment and run this after applying the migration to confirm:
--
--   SELECT id, email, organization_id, role, created_at FROM public.profiles;
--
-- On Staging you should see at least one row (Karin's dev account).
-- On Production you should see zero rows (no real users yet).
