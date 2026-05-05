-- Migration 26: helper RPC for fetching all email addresses in an org.
-- Used by transactional email notifications. SECURITY DEFINER bypasses
-- RLS so the calling user (e.g. seller sending a sale) can look up
-- buyer-org emails.

create or replace function public.get_org_user_emails(p_org_id uuid)
returns table(email text)
language sql
security definer
set search_path to 'public'
stable
as $function$
  select p.email
  from profiles p
  where p.organization_id = p_org_id
    and p.email is not null;
$function$;

grant execute on function public.get_org_user_emails(uuid) to authenticated;