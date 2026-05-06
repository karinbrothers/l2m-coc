-- ============================================================
-- Migration 31: Onboarding tour state
-- ============================================================
-- Adds a flag on profiles so we can show a one-time welcome
-- walkthrough on first dashboard load. Defaults to false; the
-- modal flips it to true via the mark_onboarding_complete RPC.
-- ============================================================

-- 1. Column ---------------------------------------------------
alter table public.profiles
  add column if not exists has_completed_onboarding boolean
    not null default false;

-- 2. RPC: mark complete --------------------------------------
-- Called by the welcome modal's "Get started" button. Uses
-- auth.uid() so a user can only flip their own flag.
create or replace function public.mark_onboarding_complete()
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles
     set has_completed_onboarding = true
   where id = auth.uid();
$$;

revoke all on function public.mark_onboarding_complete() from public;
grant  execute on function public.mark_onboarding_complete() to authenticated;

-- 3. RPC: reset (for QA / "show me the tour again") ----------
create or replace function public.reset_onboarding()
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles
     set has_completed_onboarding = false
   where id = auth.uid();
$$;

revoke all on function public.reset_onboarding() from public;
grant  execute on function public.reset_onboarding() to authenticated;

-- 4. Existing users: leave defaults --------------------------
-- New users get the tour automatically (default false). Existing
-- users *also* get the tour next time they log in since the
-- column defaulted to false on backfill. That's intentional --
-- it lets you, Engraw, Ituzaingó, Tessilbiella, and Kering all
-- experience it once. If you'd rather skip them, run:
--
--   update public.profiles
--      set has_completed_onboarding = true
--    where created_at < now() - interval '1 hour';
--
-- after deploying.