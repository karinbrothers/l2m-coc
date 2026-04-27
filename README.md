# l2m-coc
Land to Market Chain of Custody application
# L2M CoC

Land to Market Chain of Custody application.

## Stack
- Next.js 14 (App Router) + TypeScript
- Supabase (Postgres, Auth, Storage, RLS)
- Tailwind CSS + shadcn/ui
- Vercel (hosting)
- Resend (transactional email)
- @react-pdf/renderer (certificates)
- jsforce (Salesforce sync)

## Local setup
1. Install Node 20+ and pnpm
2. Copy `.env.local.example` to `.env.local` and fill in real values
3. `pnpm install`
4. `pnpm dev` — runs at http://localhost:3000

## Links
- Supabase: https://supabase.com/dashboard/project/[id]
- Vercel: https://vercel.com/karinbrothers/l2m-coc
- GitHub: https://github.com/karinbrothers/l2m-coc

## Deployment

**Live (development):** https://l2m-coc.vercel.app

Auto-deploys to Vercel on push to `main`.


## Progress log

### Day 6 — Purchases & Inventory (Apr 23, 2026)
- Built `/purchases` list view: RLS-filtered, admin sees every org, member sees only their own. Summary cards for count / total volume / remaining.
- Built `/purchases/new` form: landbase picker filtered to `eligible` only, auto-generated purchase codes in `WOOL-YYYY-NNNN` format, wool-only commodity for MVP.
- Server action handles validation, defense-in-depth eligibility check, and the unique-constraint race case.
- Built `/inventory` with two sections: Raw materials (purchases with `volume_remaining > 0`, with fill-percentage bars) and Finished goods (placeholder until processing is built).
- Deployed to Vercel, verified live on `https://l2m-coc.vercel.app`.

**Next:** Day 7 — Sales page + mass-balance check (can't sell more than you have on hand).


### Day 7 — Sales + mass balance (2026-04-23)

- `sales` table with org-scoped codes (SALE-YYYY-NNNN) and FK to source purchase.
- `record_sale()` Postgres function: row-locks source purchase, validates volume, decrements `volume_remaining`, inserts sale — all atomic. Raises `insufficient_volume` / `source_not_found` / `no_organization` on errors.
- Sales list page with summary cards (count, volume sold, unique buyers) and nested join to show source purchase code + landbase.
- New sale form with source-purchase picker (only shows purchases with `volume_remaining > 0`).
- Verified mass balance end-to-end: sold 3t from WOOL-2026-0001, inventory dropped 10 → 7.

### Day 8 — Traceability & role rename

- Added `get_trace_by_sale_code()` security-definer SQL function that returns the full chain-of-custody (landbase → purchase → sale) as JSON for any sale code.
- New `/trace/[code]` page renders three stacked cards showing landbase, source purchase, and sale, with a "Verified by Land to Market" attestation.
- Layout shell now renders a minimal navy header on `/trace/*` routes (no admin sidebar), so the provenance viewer feels separate from the internal app.
- Gated `/trace/*` behind auth for now. Public access will open up once retail partner accounts ship (Day 12+).
- Renamed `user_role` enum value `member` → `partner` across the database, all TypeScript, UI, and docs. Added `retailer` enum value to reserve it for retail partner accounts.


Day 9 — Salesforce sync
Goal: pull the authoritative list of landbases (and their certification status) from Salesforce into the app automatically, so partners, inventory, and certificates can all reference a single source of truth for "is this ranch currently L2M-verified."
Block 1 — schema additions
Added the fields we need on landbases to mirror the Salesforce side: salesforce_id, name, eligibility, eligibility_report_url, report_expiration_date, latest_verification_effective_date. Added a salesforce_credentials table (organization_id, instance_url, refresh_token, connected_by, connected_at, last_sync_at, last_sync_status, last_sync_error) so one admin OAuth session powers the whole org's syncs. Added a UNIQUE constraint on landbases.salesforce_id so re-syncs don't duplicate rows.
Block 2 — Connected App + OAuth
Built a Salesforce External Client App with PKCE OAuth, scoped to the custom Land_Base__c object. Wired up /admin/salesforce/connect to run the code-for-token exchange and write the refresh token to salesforce_credentials. Added green/red banner UI driven by query params so success and failure states are visible without opening devtools.
Block 3 — sync function + button + cron
Wrote src/lib/salesforce/sync.ts. First attempt used jsforce and hung for 80 seconds on 1,421 records — turned out the library was doing one Supabase round trip per row. Rewrote with a direct fetch() to the SF REST API for both token refresh and SOQL, then a bulk insert for new rows plus a sequential update for existing rows. Final time: ~3 seconds for 1,421 landbases. Added /admin/salesforce/sync with a "Sync now" button and a nightly Vercel cron at /api/cron/salesforce-sync guarded by CRON_SECRET.
Wrap — production rollout
Committed, pushed, and deployed to l2m-coc.vercel.app. Applied migrations 06 and 07 to the production Supabase project. Added the six Salesforce + Supabase env vars to Vercel. Updated the Connected App's callback URL to include the production domain.
Production brought its own set of small-but-spicy problems:

NEXT_PUBLIC_SUPABASE_URL had a trailing /rest/v1/, which the Supabase JS client appends to anyway. The double path showed up as "Invalid API key" from PostgREST. Stripped it down to the bare https://<project>.supabase.co and the sign-in flow started working.
user_role enum was missing the 'member' value on production, so the handle_new_user trigger aborted every auth.users insert with "Database error creating new user." Fixed with ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'member'.
First admin user needed manual org assignment. The profile auto-create trigger populates the user with role=null, organization_id=null, which is correct for invite-based partner signups but means the initial admin has to be linked manually. Inserted an organizations row of type 'admin' named "Land to Market," then UPDATE profiles SET organization_id=..., role='admin' WHERE email=....
SOQL gotcha: the custom object's API name is Land_Base__c (underscore), not Landbase__c. The field API names on it, however, use L2M_Landbase_ with no underscore. Learned the hard way.

Result: end-to-end production pipeline is live. Salesforce → Vercel → Supabase, 1,421 landbases in about three seconds. Nightly cron armed. Admin sign-in working. Next up (Day 10): supply-group scoping so partners only see the landbases relevant to their supply group.