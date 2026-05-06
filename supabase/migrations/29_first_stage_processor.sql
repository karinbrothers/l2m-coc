-- Migration 29: org-stage flags (first-stage processor + final brand)
--
-- - is_first_stage_processor: only these orgs can record direct purchases
--   from landbases via /purchases/new.
-- - is_final_brand: brands at the end of the chain (e.g. Kering) — they
--   accept incoming sales but cannot sell onward. /sales/new is hidden
--   for them.
--
-- Both flags admin-managed for now (Salesforce-sync mapping deferred to
-- Day 20+).

alter table organizations
  add column if not exists is_first_stage_processor boolean not null default false,
  add column if not exists is_final_brand           boolean not null default false;

update organizations set is_first_stage_processor = true where name = 'Engraw';
update organizations set is_final_brand           = true where name = 'Kering';