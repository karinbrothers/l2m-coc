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

## Day 10 — Supply group scoping

**Goal:** partners log in and see only the landbases linked to their organization's supply groups, while admins keep the full bird's-eye view. Salesforce already models this: an `Account` has `Supply_Group__c` records, each of which is linked to landbases through a `Landbase_Association__c` junction object. The job for Day 10 was to mirror that shape into Postgres and let RLS enforce the visibility.

### Block 1 — schema migration

Added `brand_partner_status`, `supply_chain_partner_status`, `l2m_retailer_status` columns on `organizations` (we'll use them later for filtering and badging). Replaced the placeholder flat `supply_groups` table with a proper entity table (`id`, `salesforce_id`, `name`, `organization_id`) and added a `supply_group_landbases` junction (`supply_group_id`, `landbase_id`, `association_status`, `salesforce_id`). Both new tables get authenticated SELECT under RLS so the landbases policy can join through them; writes are service-role only.

The interesting piece is the rewritten `landbases` SELECT policy: admins see everything, partners see only landbases whose `supply_group_landbases` row points at a supply group whose `organization_id` matches their `profiles.organization_id`. Two `EXISTS` subqueries OR'd together — easy to read, easy to reason about, no recursion.

### Block 2 — extending the Salesforce sync

Day 9's sync only knew about landbases. Day 10 grew it to four passes, run in FK-dependency order: `organizations` → `landbases` → `supply_groups` → `supply_group_landbases`. Each pass uses the same paginated SOQL helper plus the same chunked existence-map pattern (`Map<salesforce_id, local_uuid>`) plus bulk-insert-then-sequential-update — kept it consistent with the landbases pass so there's only one shape to reason about.

The Account filter is the gate that decides which orgs make it into our database in the first place: `Brand_Partner_Status__c = 'Active Brand Partner' OR Supply_Chain_Partner_Status__c IN ('Active Supply Chain Partner', 'Non-Partner Supply Chain Actor') OR L2M_Retailer_Status__c = 'Active Retailer'`. Supply groups whose Account doesn't pass that filter are skipped (logged as `skipped: N` per pass), as are junction rows whose supply group or landbase isn't local. New org rows default to `type='brand'`; existing rows have their name and status fields refreshed but `type` is never overwritten, so the admin org keeps `type='admin'`.

### Block 3 — verifying the RLS works

Created an Atkins Ranch–scoped partner test user (`kbrothers+partner@savory.global`, using RFC 5233 plus-aliasing so the magic link still lands in my real inbox), assigned them `role='partner'` and `organization_id` for Atkins Ranch (99 linked landbases per the SF data). Logged in, opened the dashboard, saw exactly 99 rows. Spot-checked three of them against the SF UI to confirm they were the right ones.

### Wrap — production rollout

Applied migration 08 to the production Supabase project. Hit "Sync now" on production. Result lined up with staging:

| table | staging | production |
| --- | --- | --- |
| organizations | 120 | 116 |
| landbases | 1,426 | 1,421 |
| supply_groups | 37 | 37 |
| supply_group_landbases | 1,344 | 1,344 |

Small-but-spicy problems again:

- **`handle_new_user` trigger still inserts `role='member'`**, but the `user_role` enum on production is `{admin, partner, retailer}`. Same fix as Day 9: `ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'member'`. Logged as tech debt — the proper fix is changing the trigger to insert `'partner'` (the new default for invite-based signups), not patching the enum.
- **`01_schema.sql` no longer matches the live enum state.** It was edited last week to claim `('admin', 'partner')`, but both production and staging have the additional values added incrementally. Flagged for a future schema-snapshot pass; for now the migrations folder is the source of truth, not `01_schema.sql`.
- **The Sync now button has no UI feedback.** The server action runs, completes, and returns silently — the only confirmation is checking row counts in Supabase or function logs in Vercel. Cost me a confused 10 minutes thinking the button wasn't wired up; it was, the action just doesn't surface a toast. UX nit for later.

Result: partners now see a properly scoped slice of the landbase universe, admin still sees everything, and the supply-group structure in our DB tracks Salesforce 1:1. Day 11 onward we can layer purchases and certificates on top of this scoped view without rebuilding the visibility logic.


Day 11 — Origin certificates
Goal: every raw wool purchase entering the chain of custody auto-issues an immutable Origin Certificate that captures a snapshot of the landbase and purchase state at issue time, so the cert remains a faithful record even if the underlying data changes later.
Block 1 — certificate display pages
Built /certificates (an index of every cert visible to the org under RLS) and /certificates/[id] (a detail view with type-aware rendering). Added a CertificateChrome shell component that wraps every cert with the same L2M-branded header (logo, cert number, issue date), main body, and footer with the verified seal. Two render components on top of it: OriginCertificate for purchases, and TransactionCertificate as a stub for sales (Day 12). Added a DownloadButton component for eventual PDF export. Brand assets — three logo variants and three seal variants — went into /public.
Block 2 — auto-generation + snapshot capture
Wired up createPurchase so that every successful raw-material purchase insert is followed by a certificate insert with type='origin', certificate_number = 'OC-' + purchase.code, and related_purchase_id = newPurchase.id. The purchases page picked up the new row immediately because the listing query was extended with a Supabase nested select (certificates!related_purchase_id) and a "View certificate" column rendering a <Link> to /certificates/{cert.id} on every row that has an origin cert.
Migration 09 (09_backfill_origin_certificates.sql) covers the case of purchases that existed before the auto-gen was wired up — idempotent INSERT … LEFT JOIN so re-running it is a no-op once every purchase has its cert.
Wrap — production rollout
Pushed, deployed, applied migrations 09 and 10 to prod. Production was once again the place where the small-but-spicy problems showed up:

TypeScript strict-mode build failure. Local pnpm run dev doesn't typecheck strictly, so the Vercel build was the first time we found out that CertificateChrome was typed certificateNumber: string while Supabase's auto-generated types had certificate_number: string | null (even though the DB column is NOT NULL). The same component was also being passed a description prop it didn't declare. Loosened the type to string | null (with ?? '—' fallback) and added a description?: string slot rendered as an italic intro at the top of <main>.
Schema drift between staging and prod. First cert generated in production rendered with every body field blank. Investigation: prod's certificates table had only 7 columns; staging had 23. Sixteen columns — landbase_id plus the entire snapshot suite (landbase_name_snapshot, country_snapshot, eligibility_status_snapshot, expiration_date_snapshot, monitoring_date_snapshot, verification_date_snapshot, eligibility_report_url_snapshot, purchase_code, volume, volume_unit, commodity_type, purchase_date, clip_year_snapshot, report_year_used) — had been added to staging ad-hoc but never captured in a migration. Fixed with migration 10: idempotent ADD COLUMN IF NOT EXISTS followed by a backfill UPDATE … FROM raw_material_purchases JOIN landbases that derives every snapshot field from the related rows. Updated createPurchase to fetch the full landbase row (one query, not two — folded into the existing eligibility check) and write all snapshot fields into the cert at issue time.
Sign out was missing from the sidebar. Switching between admin and partner accounts required manually clearing cookies. Added an auth lookup to the root layout and a Sign-out form posting to /auth/signout, so the user's email and a Sign out button now render in the top-right of the app shell.
Country missing from landbases. Country__c was never being pulled into Supabase from Salesforce — every landbase was syncing without a country. Added the field to the SOQL select, the SFLandbase type, and the row payload. Same pass also fixed a quietly-broken mapping where the eligibility report URL was being written to the eligibility_report_id column instead of eligibility_report_url. Re-running the sync repopulated country on every landbase that has it set in Salesforce, and put the URLs in the right column so "View certificate" buttons started appearing on rows that had previously shown —.

Result: production has end-to-end origin certificates working. Every wool purchase auto-issues a verified, immutable cert with a faithful snapshot of the landbase and purchase at issue time. The "View certificate" column on /purchases links straight into the cert page. Next up (Day 12): the equivalent flow for transactions — wire record_sale to issue a Transaction Certificate that references the underlying origin certs, so the chain-of-custody trace finally ties end to end.


### Day 12 — Auto-issued transaction certificates with origin lineage

**Goal:** Every sale auto-issues a Transaction Certificate (TC) that
links back to the origin certificate(s) of its source purchase, completing
the chain-of-custody trace.

**Schema migrations:**
- `10b_sales_workflow.sql` (prod catch-up — staging had `sales` table from Day 7
  Studio work that never made it into a migration; prod was still on the legacy
  `sale_transactions` table).
- `11_transaction_certificates.sql` — TC snapshot columns (`sale_code`,
  `buyer_name_snapshot`, `seller_org_name_snapshot`, `sale_date_snapshot`),
  new `certificate_origin_links` table with RLS, FK repair on
  `certificates.related_transaction_id → sales(id)`, and a backfill block
  for existing TCs.
- `12_certificate_more_snapshots.sql` — added `commodity_type_snapshot`,
  `volume_snapshot`, `volume_unit_snapshot`, `source_purchase_code_snapshot`
  to `certificates` (forgotten in 11).
- `13_origin_links_insert_policy.sql` — INSERT policy on
  `certificate_origin_links` (only a SELECT policy existed, so all inserts
  were 42501-blocked even for admins).

**Code changes:**
- `src/app/sales/actions.ts` — `createSale` now generates the sale code
  internally, calls `record_sale`, then in parallel looks up the source
  purchase, seller org, and origin certificate via direct queries (not
  PostgREST nested selects, which silently lose the origin cert due to FK
  disambiguation). Inserts the TC with both mirror columns
  (`volume`, `commodity_type`, `purchase_code`, `volume_unit`) the UI reads
  from and `*_snapshot` columns for chain-of-custody. Then inserts the
  TC→OC link. Validation errors redirect with `?error=<code>` so the form
  can render friendly messages.
- `src/components/certificates/TransactionCertificate.tsx` — rewritten to
  display TC fields and source-material lineage.
- `src/app/sales/page.tsx` — added "View certificate" column.
- `src/app/certificates/[id]/page.tsx` — type-dispatching renderer (origin
  vs transaction).

**Bugs hit and resolved:**
- Schema drift: prod still on legacy `sale_transactions` while staging
  had `sales` (resolved with catch-up migration 10b).
- Profiles RLS qualifier: `where user_id = auth.uid()` corrected to
  `where id = auth.uid()` — profiles uses `id` as the FK to `auth.users`.
- `issued_by` column referenced in earlier code drafts but doesn't exist
  on `certificates` — removed.
- PostgREST nested-select FK disambiguation silently dropped origin cert
  on production; replaced with a direct `eq('related_purchase_id', ...)
  .eq('type', 'origin')` query.
- Missing INSERT policy on `certificate_origin_links` blocked link inserts
  with `42501` even for admins — fixed in migration 13.

**Open / deferred to Day 13:**
- Duplicate `WOOL-2026-0001` purchase code across two orgs on staging
  (Purchase B left dormant — needs a real fix).
- Processing step: partners should not be able to sell directly from raw
  purchases. Need an unprocessed → processed inventory split (sales draw
  from processed only).