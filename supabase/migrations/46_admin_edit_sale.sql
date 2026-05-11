-- Migration 46: admin edit sale metadata
-- ============================================================
-- Lets an admin update three "safe" metadata fields on any sale
-- (pending or accepted):
--   - shipping_number
--   - country_of_dispatch
--   - notes
--
-- These fields don't affect volume tracking or chain of custody,
-- so editing them after acceptance is fine. The TC reads them
-- live from the sale row, so changes appear on the cert
-- immediately.
--
-- Form semantics: any field passed as an empty string ('') will
-- clear that field to NULL. A field passed as NULL (omitted) is
-- left unchanged.

create or replace function public.admin_update_sale_metadata(
  p_sale_id             uuid,
  p_shipping_number     text default null,
  p_country_of_dispatch text default null,
  p_notes               text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'admin_only';
  end if;

  if not exists (select 1 from sales where id = p_sale_id) then
    raise exception 'sale_not_found';
  end if;

  update sales set
    shipping_number = case
      when p_shipping_number is null then shipping_number
      else nullif(trim(p_shipping_number), '')
    end,
    country_of_dispatch = case
      when p_country_of_dispatch is null then country_of_dispatch
      else nullif(trim(p_country_of_dispatch), '')
    end,
    notes = case
      when p_notes is null then notes
      else nullif(trim(p_notes), '')
    end
  where id = p_sale_id;
end;
$$;

revoke all on function public.admin_update_sale_metadata(uuid, text, text, text) from public;
grant  execute on function public.admin_update_sale_metadata(uuid, text, text, text) to authenticated;