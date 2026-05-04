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


  ### Day 13 — Processing workflow (raw → processed → sale)

**Goal:** Partners can no longer sell directly from raw purchases. New flow:
raw purchase → processing batch (with yield loss) → inventory lot → sale.
Transaction certificates trace back through the batch chain to ALL
contributing origin certificates with proportional volume attribution.

**Schema migration:**
- `14_processing_workflow.sql`:
  - Clean slate: deleted 4 test sales + their TCs + origin links
  - Reset `raw_material_purchases.volume_remaining = volume`
  - Switched `sales.source_purchase_id → sales.inventory_lot_id`
  - `record_processing_batch` RPC — atomic: validates each input has
    enough remaining, decrements raw `volume_remaining`, inserts the
    batch + `processing_batch_inputs` rows + the resulting `inventory_lot`
  - Updated `record_sale` RPC to draw from `inventory_lots`
  - Day-1 schema already had `processing_batches`,
    `processing_batch_inputs`, `inventory_lots` tables with RLS — Day 13
    just wired them up

**Code changes:**
- `src/app/processing/actions.ts` (new) — `generateNextLotCode`,
  `createProcessingBatch`
- `src/app/processing/page.tsx` (new) — list view with summary cards
  (batches, volume processed, yield %)
- `src/app/processing/new/page.tsx` (new) — multi-input form: each raw
  purchase shows as a row with a per-row volume input, plus output
  product/volume/method/date/subcontractors
- `src/app/sales/actions.ts` — `createSale` now walks
  `inventory_lot → processing_batch → batch_inputs → raw_purchases →
  origin certificates`, attributes volume proportionally to each linked OC
- `src/app/sales/new/page.tsx` — source dropdown shows inventory lots
  instead of raw purchases
- `src/app/sales/page.tsx` — "From" column shows lot code + product name
- `src/app/inventory/page.tsx` — two sections: Unprocessed raw + Processed
  lots, with summary totals
- `src/app/layout.tsx` — added Processing nav entry; reordered so the
  flow reads Landbases → Purchases → Inventory → Processing → Sales →
  Certificates

**Volume attribution math:**
For each input source in the batch, the TC links to that source's origin
cert with `volume_attributed = (input_volume_used / batch_input_total) ×
sale_volume`. So a batch built from 3t of Purchase A and 2t of Purchase B
(input_total = 5t), used to sell 2t to a customer, results in:
- TC → OC-A linked with 1.2t attributed
- TC → OC-B linked with 0.8t attributed

**Bug hit during migration:** Postgres won't let `CREATE OR REPLACE
FUNCTION` change parameter names. Solved by `DROP FUNCTION IF EXISTS
record_sale(text, uuid, text, numeric, date, text)` before the new
`CREATE`.

**Open / deferred:**
- Inventory lots can technically serve as input to further processing
  (`source_type = 'inventory_lot'` supported in `processing_batch_inputs`),
  but the UI only exposes raw purchases as inputs.
- `record_processing_batch` doesn't enforce that batch inputs are the
  same commodity type — partner is responsible for not mixing wool and
  cotton in one batch.
- Duplicate `WOOL-2026-0001` purchase code across two orgs on staging
  (still dormant from Day 12) — needs a real fix.


  ### Day 14 — Chain-of-custody storytelling: trace + TC display

**Goal:** Bring the customer-facing provenance views into line with the
new processing chain. The `/trace/[code]` page and Transaction
Certificate display had been written for the old direct raw→sale model
and silently rendered missing fields after Day 13's schema change.

**Schema migration:**
- `15_trace_function_v2.sql` — rewrote `get_trace_by_sale_code(text)` to
  walk the new chain: `sale → inventory_lot → processing_batch →
  processing_batch_inputs → raw_purchases → landbase + origin certificate`.
  Returns a richer JSON with:
  - `sale` (code, buyer, volume, date)
  - `lot` (code, product name, total/remaining volume)
  - `batch` (input total, output volume, output product, method,
    subcontractors, processing date, yield %)
  - `inputs[]` — one entry per raw-purchase input, each with the raw
    purchase metadata, landbase + eligibility, origin certificate, and
    a proportional `volume_attributed` calculated as
    `(volume_used / batch_input_total) × sale_volume`
  - `organization` (seller name)

**Code changes:**
- `src/app/trace/[code]/page.tsx` — full redesign with a 4-step layout
  (Sale → Inventory Lot → Processing → Source landbases). Each source
  landbase renders as its own card with eligibility badge, raw-purchase
  metadata (year of clip, fibre diameter, batch number), per-input
  volume attribution, and a link to the origin certificate. Verification
  banner reflects whether *all* sources are eligible.
- `src/app/certificates/[id]/page.tsx` — extended the supabase select
  to nested-fetch the sale's inventory lot and processing batch alongside
  the existing origin links.
- `src/components/certificates/TransactionCertificate.tsx` — added a
  Processing section (output product, lot code, processing date, method,
  input/output volumes, yield, subcontractors) and a "View full
  provenance trace" link at the bottom that deep-links to
  `/trace/[sale_code]`. New `ProcessingBatchLite` and extended
  `TransactionCertificateData` types are backwards-compatible so older
  TCs without the chain still render cleanly.

**Open / deferred:**
- PDF generation for transaction certs (origin certs got it on Day 11).
- Partner-role experience hasn't been tested end-to-end as a non-admin
  user.
- Buyer-side acceptance flow (sale_transactions has `status`,
  `accepted_at`, `response_deadline` columns from Day 1 that aren't
  wired up).
- Inventory lots as input to further processing (schema supports it via
  `processing_batch_inputs.source_type = 'inventory_lot'`, UI doesn't
  expose it).

  ### Day 15 — Partner-experience audit + cross-cutting fixes

**Goal:** Test the full L2M flow end-to-end as a real partner (non-admin
in a non-LtM org) for the first time, then fix every gap that surfaced.
This was the day the codebase had only ever been driven by an admin
account, and a lot of latent bugs only show up under partner-role
constraints.

**Test setup:**
- Picked **Kering** (185 landbases via Salesforce sync, no other data) as
  a realistic cold-start partner.
- Created a partner test user `kbrothers+keringtest@savory.global` via
  the existing admin invite UI.

**Findings + fixes:**

1. **Invite UI was missing from sidebar nav.** The `/admin/invitations`
   page existed but no nav entry pointed to it. → Added an admin-gated
   `<Link href="/admin/invitations">Invitations</Link>` in `layout.tsx`,
   conditional on the user's profile role.

2. **Invite UI had no organization selector.** Admins could only invite
   into their own org, so an L2M platform admin couldn't onboard partners
   into Kering / Atkins Ranch / etc. → Added an Organization dropdown to
   `/admin/invitations` populated with all orgs (admin's own org floats
   to the top with `(your org)` tag); the action defaults to the admin's
   own org if none selected. Updated invitation list view to show the
   org column and span all orgs.

3. **Invitations RLS blocked cross-org inserts** (migration 16). The
   `invitations_insert_admin` / `invitations_select_admin` /
   `invitations_update_admin` policies all required
   `p.organization_id = invitations.organization_id`. Loosened to just
   `is_admin()` so admins can invite/view/revoke for any org.

4. **Sale codes collided across orgs** (migration 17). `generateNextSaleCode`
   queried the sales table through RLS, so a partner with no sales saw
   "next is 0001" even when LtM already had `SALE-2026-0001`. Two-org
   collision actually happened during the test. Fix: renamed Kering's
   `SALE-2026-0001` to `SALE-2026-0002`, added unique index on
   `sales.code`, replaced the JS code-gen with a SECURITY DEFINER RPC
   `generate_next_sale_code()` that bypasses RLS.

5. **Cross-org trace exposure** (migration 17). `get_trace_by_sale_code`
   was SECURITY DEFINER (rightly) but had no authz check, so a Kering
   partner navigating to `/trace/SALE-2026-0001` could see Land to
   Market's full chain. Fix: added an authz check inside the function:
   admins see any trace, partners only see traces whose sale belongs to
   their org. Returns null otherwise (page renders the "Trace not found"
   state).

6. **Certificates RLS broke partner inserts and selects** (migration 17).
   Two problems in the same file:
   - `certs_insert` was `is_admin()` only — every TC and OC insert
     attempted by a partner silently failed. (No errors thrown; the
     actions log-and-continue on cert failures, by design.)
   - `certs_select` still referenced the obsolete `sale_transactions`
     table from the Day-1 schema (with `seller_org_id`/`buyer_org_id`),
     never updated when Day 13 swapped to the `sales` table. So even
     when partner certs *did* exist, RLS hid them.
   Fix: rewrote both policies to allow admins, plus org members of
   either the related raw purchase OR the related sale.

7. **Purchase codes collided globally on certificate_number**
   (migration 18). Same root pattern as sales codes — purchase codes
   are per-org but `certificates.certificate_number = OC-{purchase_code}`
   is globally unique. Two orgs with `WOOL-2026-0001` → `OC-WOOL-2026-0001`
   collision. Fix: idempotent rename of any duplicate codes (keep
   oldest, renumber newer to next-free), unique index on
   `raw_material_purchases.code`, SECURITY DEFINER RPC
   `generate_next_purchase_code()`.

8. **Origin certs had never been auto-created for the partner.** Same
   underlying cause as #6 (admin-only certs_insert). Once #6 was fixed,
   future purchases got their OCs automatically. Backfilled missing OCs
   with an idempotent SQL block that creates an OC for any
   `raw_material_purchases` row currently missing one.

**Side quest — Print-to-PDF download:**
- Added a `PrintButton` client component (calls `window.print()`).
- Wired into `OriginCertificate` and `TransactionCertificate`.
- Added `print:hidden` Tailwind classes to the sidebar (`<aside>`),
  the back link in the certificate detail page, the Print button itself,
  and the "View full provenance trace" link — so the printed page is
  just the certificate.

**Verification:**
- Walked the full partner flow as Kering on prod: record purchase →
  process batch → record sale → view certificate → view full provenance
  trace. All four steps now work, OCs auto-issue, TCs auto-issue and
  auto-link to OCs with proportional volume attribution.
- Confirmed `/trace/SALE-2026-0002` (Land to Market's renamed sale)
  returns "Trace not found" for the Kering partner. Cross-org isolation
  holds.
- Sidebar Invitations link correctly hidden for the partner.

**Open / deferred:**
- Email signups remain disabled at the Supabase auth level (admin-invite
  only). Documented behavior; no code change.
- Buyer-side acceptance flow (`sale_transactions.status` /
  `accepted_at` / `response_deadline` from the Day-1 schema) still
  unwired.
- Partner-facing public/shareable trace URLs (so a buyer who isn't an
  L2M user can verify a sale) — currently auth-gated only.
- `@page` CSS rules to clean up browser-injected headers/footers on the
  printed PDF.