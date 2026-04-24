-- ════════════════════════════════════════════════════════════════════════════
-- 05 — Invitations: admin-controlled user onboarding into organizations
--
-- Day 5 replaces Day 4's open-signup defaults with a real invite flow:
--
--   1. An admin creates an `invitations` row for (email, org_id, role).
--   2. The invite flow calls signInWithOtp(email, { shouldCreateUser: true })
--      which sends the invitee a magic link.
--   3. When the invitee clicks the link, a new auth.users row is created,
--      which fires our handle_new_user trigger. The trigger now checks for
--      a matching pending invitation FIRST, and if found, stamps the profile
--      with the invite's organization_id + role (instead of NULL/member).
--      It also marks the invitation as accepted.
--   4. If no invitation exists (dev-only signup, or legacy flow), the trigger
--      falls back to the Day 4 default: organization_id = NULL, role = 'partner'.
--
-- RLS: admins can CRUD invitations scoped to THEIR OWN organization only.
--
-- Idempotent — safe to re-run.
-- ════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────
-- 1. Enum: invitation_status
-- ─────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'invitation_status') THEN
    CREATE TYPE invitation_status AS ENUM ('pending', 'accepted', 'expired', 'revoked');
  END IF;
END$$;

-- ─────────────────────────────────────────
-- 2. Table: invitations
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.invitations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           TEXT NOT NULL,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role            user_role NOT NULL DEFAULT 'partner',
  invited_by      UUID REFERENCES profiles(id) ON DELETE SET NULL,
  status          invitation_status NOT NULL DEFAULT 'pending',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at     TIMESTAMPTZ
);

COMMENT ON TABLE public.invitations IS
  'Pending admin-issued invitations. Consumed by handle_new_user trigger when invitee signs up.';

-- Only one pending invitation per (email, org) at a time.
CREATE UNIQUE INDEX IF NOT EXISTS invitations_pending_unique
  ON public.invitations (lower(email), organization_id)
  WHERE status = 'pending';

-- Fast lookup for the trigger's per-signup query.
CREATE INDEX IF NOT EXISTS invitations_email_pending_idx
  ON public.invitations (lower(email))
  WHERE status = 'pending';

-- ─────────────────────────────────────────
-- 3. RLS: admins manage invites for their own org
-- ─────────────────────────────────────────
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS invitations_select_admin ON public.invitations;
CREATE POLICY invitations_select_admin
  ON public.invitations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'admin'
        AND p.organization_id = invitations.organization_id
    )
  );

DROP POLICY IF EXISTS invitations_insert_admin ON public.invitations;
CREATE POLICY invitations_insert_admin
  ON public.invitations
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'admin'
        AND p.organization_id = invitations.organization_id
    )
  );

DROP POLICY IF EXISTS invitations_update_admin ON public.invitations;
CREATE POLICY invitations_update_admin
  ON public.invitations
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'admin'
        AND p.organization_id = invitations.organization_id
    )
  );

-- No DELETE policy — admins revoke by UPDATEing status, not by deleting rows.
-- This preserves an audit trail of who was invited and when.

-- ─────────────────────────────────────────
-- 4. Update handle_new_user to consume invitations
-- ─────────────────────────────────────────
-- Same contract as Day 4: insert a profile row for the new auth user.
-- NEW behaviour: if a matching pending invitation exists, use its org_id
-- and role instead of the NULL/'partner' defaults, and mark it accepted.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite public.invitations%ROWTYPE;
BEGIN
  -- Look for the newest pending, non-expired invitation for this email.
  SELECT *
  INTO v_invite
  FROM public.invitations
  WHERE lower(email) = lower(NEW.email)
    AND status = 'pending'
    AND expires_at > now()
  ORDER BY created_at DESC
  LIMIT 1;

  -- Create the profile row. If an invitation was found, use its org + role;
  -- otherwise fall back to NULL org + 'partner' (Day 4 default).
  INSERT INTO public.profiles (id, email, full_name, organization_id, role)
  VALUES (
    NEW.id,
    NEW.email,
    NULLIF(NEW.raw_user_meta_data->>'full_name', ''),
    v_invite.organization_id,                   -- NULL if no invite
    COALESCE(v_invite.role, 'partner'::user_role)
  )
  ON CONFLICT (id) DO NOTHING;

  -- Mark the invitation accepted so it can't be consumed twice.
  IF v_invite.id IS NOT NULL THEN
    UPDATE public.invitations
    SET status      = 'accepted',
        accepted_at = now()
    WHERE id = v_invite.id;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_new_user() IS
  'Inserts a profiles row when a new auth.users row is created. Consumes a matching pending invitation if one exists.';

-- Trigger itself was created in 04_auth_trigger.sql and does not need recreation —
-- replacing the function above is enough, the trigger keeps firing.

-- ─────────────────────────────────────────
-- 5. Verify
-- ─────────────────────────────────────────
-- Uncomment to sanity-check after applying:
--
--   -- Confirm the table exists and is empty
--   SELECT count(*) FROM public.invitations;
--
--   -- Confirm RLS is on
--   SELECT tablename, rowsecurity FROM pg_tables WHERE tablename = 'invitations';
--
--   -- Confirm the function was replaced (should reference 'v_invite' now)
--   SELECT pg_get_functiondef('public.handle_new_user()'::regprocedure);
