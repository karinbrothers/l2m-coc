-- Migration 16: allow admins to invite users into any organization
--
-- Previously, all three invitations policies required the admin's
-- organization_id to match invitations.organization_id. That blocks an
-- L2M platform admin from onboarding partners into Kering, Atkins Ranch,
-- etc. Loosen the org-match clause; admins can now invite/view/revoke
-- for any org. Non-admins still have no access (no other policy exists).

drop policy if exists invitations_insert_admin on invitations;
drop policy if exists invitations_select_admin on invitations;
drop policy if exists invitations_update_admin on invitations;

create policy invitations_insert_admin on invitations
for insert to authenticated
with check (
  exists (
    select 1 from profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  )
);

create policy invitations_select_admin on invitations
for select to authenticated
using (
  exists (
    select 1 from profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  )
);

create policy invitations_update_admin on invitations
for update to authenticated
using (
  exists (
    select 1 from profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  )
);