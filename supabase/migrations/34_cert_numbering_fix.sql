-- Migration 34: Fix generate_certificate_number type cast
-- ============================================================
-- Migration 33 introduced a bug: it compares
--   certificates.type   (enum certificate_type)
-- to
--   cert_type           (text parameter)
-- which Postgres won't auto-cast across, resulting in:
--   "operator does not exist: certificate_type = text"
-- when accepting a sale (which calls this function via
-- issue_tc_for_sale).
--
-- Fix: cast the column to text inside the WHERE clause so the
-- comparison works regardless of how the enum is named.

create or replace function public.generate_certificate_number(cert_type text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  prefix   text;
  year_str text;
  next_num int;
begin
  year_str := extract(year from now())::text;

  if cert_type = 'origin' then
    prefix := 'L2M-OC';
  elsif cert_type = 'transaction' then
    prefix := 'L2M-TC';
  elsif cert_type = 'product_verification' then
    prefix := 'L2M-PV';
  else
    prefix := 'L2M-XX';
  end if;

  select coalesce(
    max(
      substring(certificate_number from '\d+$')::int
    ),
    0
  ) + 1
    into next_num
    from certificates
    where type::text = cert_type
      and certificate_number like prefix || '-' || year_str || '-%';

  return prefix || '-' || year_str || '-' || lpad(next_num::text, 4, '0');
end;
$$;