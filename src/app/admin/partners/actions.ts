// src/app/admin/partners/actions.ts
//
// Server action: generate a one-time magic-link sign-in URL for
// any user, callable only by admins. Uses the service-role
// admin client (bypasses RLS / requires no session for the
// target user).
//
// Returns the URL to the calling client component, which
// displays it for the admin to copy + open in an incognito
// window. We deliberately don't auto-open it — that would set
// the partner's session cookie on the admin's browser and clobber
// the admin session.

'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function generateImpersonationLink(
  email: string,
): Promise<{ link: string | null; error: string | null }> {
  // Verify caller is an admin before doing anything privileged.
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { link: null, error: 'Not signed in.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  if (profile?.role !== 'admin') {
    return { link: null, error: 'Admin only.' }
  }

  const targetEmail = email.trim().toLowerCase()
  if (!targetEmail || !targetEmail.includes('@')) {
    return { link: null, error: 'Invalid email.' }
  }

  const admin = createAdminClient()
  const { data, error } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: targetEmail,
  })

  if (error) {
    console.error('[generateImpersonationLink]', error)
    return { link: null, error: error.message }
  }

  const actionLink = data?.properties?.action_link ?? null
  if (!actionLink) {
    return { link: null, error: 'No link returned by Supabase.' }
  }

  return { link: actionLink, error: null }
}