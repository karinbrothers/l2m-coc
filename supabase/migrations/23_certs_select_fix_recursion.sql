-- Migration 23: fix certs_select recursion that was breaking nested queries
--
-- Migration 22 added a buyer-can-see-OCs-via-chain clause that joined
-- certificates back to itself in a subquery. PostgreSQL's RLS evaluator
-- doesn't gracefully short-circuit that pattern when /sales does a
-- nested certificates select, so the entire sales query returned 0 rows.
--
-- Solution: move the buyer chain check into a SECURITY DEFINER helper.
-- The function bypasses RLS internally; the outer policy stays flat.

begin;

create or replace function public.is_buyer_for_oc_in_chain(p_oc_id uuid)
returns boolean
language sql
security definer
set search_path to 'public'
stable
as $function$
  select exists (
    select 1
    from certificate_origin_links col
    join certificates tc on tc.id = col.transaction_certificate_id
    join sales s on s.id = tc.related_transaction_id
    where col.origin_certificate_id = p_oc_id
      and s.buyer_org_id = get_my_org_id()
  );
$function$;

drop policy if exists certs_select on certificates;

create policy certs_select on certificates
for select to authenticated
using (
  is_admin()
  or exists (
    select 1 from raw_material_purchases p
    where p.id = certificates.related_purchase_id
      and p.organization_id = get_my_org_id()
  )
  or exists (
    select 1 from sales s
    where s.id = certificates.related_transaction_id
      and (s.organization_id = get_my_org_id()
           or s.buyer_org_id = get_my_org_id())
  )
  or public.is_buyer_for_oc_in_chain(certificates.id)
);

commit;