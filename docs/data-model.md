# Data model reference

This document is the "why" behind the database schema — written for a future you who hasn't looked at it in three months and is trying to remember how it all fits together.

## The domain, in one paragraph

Land to Market verifies grazing practices on individual land parcels ("landbases") and wants to track the flow of raw materials (starting with wool) from those verified landbases through the supply chain to a final branded product. At each step — purchase, processing, sale — a certificate is generated that references the upstream certificate(s). This creates an unbroken, verifiable chain of provenance that a brand can show to its customers. The database has to enforce that volumes balance (you can't sell more than you have), that records can't be tampered with after acceptance, and that each organization only sees its own data plus what's been shared with it.

## The three-actor model

There are four organization types but only three roles do substantive work:

- **FSP (Farmer Service Provider)** — the first business to handle raw material after the farm. They buy raw wool from verified landbases, do initial processing (scouring, carding, combing), and sell the resulting processed lots to downstream processors. In the seed data: Southern Wool Traders.
- **Processor** — buys material from an FSP or another processor, does further processing (spinning, weaving, dyeing), sells to a brand or another processor. In the seed data: Riverside Textiles and Alpine Fibre Co.
- **Brand** — the end customer in the L2M system. Receives material, traces it back, builds a marketing story from the chain. In the seed data: Maison Étoile.
- **Admin** — L2M staff who oversee the whole system. Can see everything, override deadlines, manage partners. Not an operational actor in the supply chain itself.

## Dual inventory — the single most important concept

The **inventory_lots** table holds *all* processed material that any org owns. It has a nullable `processing_batch_id` column that encodes a crucial distinction:

- `processing_batch_id` is **NULL** → the lot is **unprocessed**, i.e., this org received it from an incoming transaction and hasn't transformed it yet. Think of this as the "in tray" — material that was bought and is waiting to be processed. It cannot be sold directly; it must be processed first.
- `processing_batch_id` is **set** → the lot is **processed**, i.e., it came out of one of this org's own processing_batches. Think of this as the "ready to ship" shelf. This is the only kind of lot that can be sold.

Why this matters: in the UI, the Inventory page has three tabs — Raw Materials (from `raw_material_purchases`), Unprocessed (NULL), and Processed (set). A user can't sell from the Unprocessed tab. They must create a processing batch first.

An FSP is a special case: their raw material comes in via `raw_material_purchases` (not `inventory_lots`), so their Unprocessed tab is empty — their Inventory page effectively has only two real tabs. Processors see all three tabs.

## Volume accounting

Every entity that represents a stock of material has `volume` and `volume_remaining` columns, both `DECIMAL(12,3)` with a `CHECK (volume_remaining >= 0)` constraint. This is how the system enforces that you can't sell or process more than you have.

The flow is:

1. FSP creates a `raw_material_purchase` with `volume = volume_remaining = 10 tonnes`.
2. FSP creates a `processing_batch` that consumes 4 tonnes from that purchase via `processing_batch_inputs.volume_used`. The purchase's `volume_remaining` decrements to 6.
3. The processing batch produces an `inventory_lot` with `total_volume = volume_remaining = 15 tonnes` (assuming multiple inputs totaling 29t yielded 15t of output — a ~52% yield).
4. FSP creates a `sale_transaction` for 5 tonnes from that lot. The lot's `volume_remaining` drops to 10 *at the moment of sale creation* (not at acceptance — this prevents two pending sales from overselling).
5. If the buyer rejects the sale, we restore `volume_remaining` back to 15. If they accept, the lock trigger fires and the sale can never be modified again.

**Key decision:** volume is decremented on sale creation, not on acceptance. See `/docs/decisions.md` (to be written on Day 8) for why.

## Certificate chain

Three kinds of certificates:

- **Origin (OC)** — issued when a `raw_material_purchase` is recorded. Links to the purchase via `certificates.related_purchase_id`. Format: `L2M-OC-YYYY-NNNNN`.
- **Transaction (TC)** — issued when a `sale_transaction` is accepted. Links to the sale via `certificates.related_transaction_id`. Format: `L2M-TC-YYYY-NNNNN`. Each TC references the upstream certificate that fed it via `sale_transactions.input_certificate_id`. This is the chain.
- **Product Verification (PV)** — issued when a brand receives final material. Format: `L2M-PV-YYYY-NNNNN`. *Not implemented in seed data, but the schema supports it.*

The chain is built by traversing `input_certificate_id` backwards. A brand's TC references the processor's TC, which references the FSP's TC, which references an OC on a raw material purchase, which references a landbase. That's the full provenance.

Certificate numbers are generated by the `generate_certificate_number(cert_type)` SQL function, which uses a shared `certificate_seq` sequence. All cert types draw from the same counter, so they're globally ordered by issuance time.

## Triggers (invisible but load-bearing)

Two triggers on `sale_transactions` do critical work:

1. `trg_set_response_deadline` — BEFORE INSERT. If `response_deadline` is null, sets it to `submitted_at + 14 days`. This is L2M's 14-day acceptance window. Every pending transaction auto-expires if not acted on.

2. `trg_lock_on_accept` — BEFORE UPDATE. When `status` changes from 'pending' to 'accepted', sets `locked = true` and `accepted_at = now()`. If anyone tries to modify a row where `locked = true`, the trigger raises an exception. This is the immutability guarantee — once a transaction is accepted, it's frozen forever.

Neither trigger touches volume math. That happens in application code (API routes), because volume restoration on rejection needs to reference the inventory lot across tables.

## Row-Level Security, in one sentence per table

- **organizations** — everyone can read (for dropdowns), only admins can write.
- **profiles** — everyone can read (for display names), each user can only update their own row.
- **landbases** — everyone can read, only admins can write (landbases are synced from Salesforce).
- **supply_groups** — each FSP sees their own; admins see all.
- **raw_material_purchases** — each org sees/writes their own; admins see all.
- **processing_batches** — each org sees/writes their own; admins see all.
- **processing_batch_inputs** — inherits access from the parent batch.
- **inventory_lots** — each org sees/writes their own; admins see all.
- **sale_transactions** — seller sees outgoing, buyer sees incoming, admins see all.
- **certificates** — visible to the org that owns the related purchase, the seller or buyer of the related transaction, or admins.
- **messages** — visible to both parties on a transaction.
- **audit_log** — admin read-only; anyone can insert (for triggers and app-level audit entries).

The two helper functions `get_my_org_id()` and `is_admin()` do the heavy lifting in these policies. Both are `SECURITY DEFINER` so they run as the function owner, not the calling user — standard pattern for RLS helpers.

## Open questions / things to come back to

These are known soft spots in the current schema that are fine for MVP but worth revisiting:

- **`audit_log` insert is unrestricted.** Anyone can write audit entries. The blast radius is small (only admins can read) but a malicious user could fill the table. Consider tightening to `auth.uid() IS NOT NULL`.
- **`processing_batch_inputs.source_id` is polymorphic** — points to either `raw_material_purchases` or `inventory_lots` based on `source_type`. PostgreSQL can't enforce referential integrity on polymorphic FKs. Application code has to validate on insert.
- **`sale_transactions.certificate_id_number` is TEXT, not a FK to certificates.** Slight looseness. If a certificate is ever deleted (it shouldn't be), this reference becomes dangling.
- **No DELETE policies anywhere.** Intentional — chain of custody records should never be deleted. Good.
- **`profiles.email` is denormalized** — also stored in `auth.users`. Kept in sync via trigger on signup, but if a user changes their auth email the profile email doesn't auto-update.

## Where things live physically

All tables are in the `public` schema. The Supabase-managed `auth` schema holds `auth.users`, which `profiles.id` references. When Salesforce sync is added, we'll likely add a `private` schema for sync state (last run timestamp, error logs) to keep it separate from domain tables.
