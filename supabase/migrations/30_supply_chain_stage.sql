-- Migration 30: supply chain stage from Salesforce
--
-- Salesforce now has Supply_Chain_Stage__c on Account with four values:
--   First Stage Processor
--   Middle Stage Processor
--   Final Stage Processor
--   Final Brand
--
-- We add supply_chain_stage as the source of truth on organizations,
-- and keep the existing booleans (is_first_stage_processor,
-- is_final_brand) as derived columns so existing UI code keeps working
-- without changes.

begin;

-- ─────────────────────────────────────────
-- Section 1: stage column with check constraint
-- ─────────────────────────────────────────
alter table organizations
  add column if not exists supply_chain_stage text;

-- Allow only the four canonical values (or null for not-yet-classified)
alter table organizations
  drop constraint if exists organizations_supply_chain_stage_check;

alter table organizations
  add constraint organizations_supply_chain_stage_check
  check (
    supply_chain_stage is null
    or supply_chain_stage in (
      'First Stage Processor',
      'Middle Stage Processor',
      'Final Stage Processor',
      'Final Brand'
    )
  );

-- ─────────────────────────────────────────
-- Section 2: backfill from existing booleans
-- ─────────────────────────────────────────
update organizations
  set supply_chain_stage = 'First Stage Processor'
  where is_first_stage_processor = true
    and supply_chain_stage is null;

update organizations
  set supply_chain_stage = 'Final Brand'
  where is_final_brand = true
    and supply_chain_stage is null;

-- ─────────────────────────────────────────
-- Section 3: trigger to keep booleans in sync with stage
-- ─────────────────────────────────────────
create or replace function public.sync_org_stage_flags()
returns trigger
language plpgsql
as $function$
begin
  new.is_first_stage_processor := (new.supply_chain_stage = 'First Stage Processor');
  new.is_final_brand           := (new.supply_chain_stage = 'Final Brand');
  return new;
end;
$function$;

drop trigger if exists organizations_sync_stage_flags on organizations;

create trigger organizations_sync_stage_flags
  before insert or update of supply_chain_stage on organizations
  for each row
  execute function public.sync_org_stage_flags();

-- Run the trigger logic once over existing data so flags reflect stage
update organizations
  set supply_chain_stage = supply_chain_stage  -- no-op write to fire trigger
  where supply_chain_stage is not null;

commit;