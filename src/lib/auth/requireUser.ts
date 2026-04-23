import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

/**
 * Server-side auth gate for any authenticated page or action that needs an
 * org-scoped profile. This is the "member-or-admin" counterpart to
 * requireAdmin().
 */
export async function requireUser() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id, email, full_name, role, organization_id')
    .eq('id', user.id)
    .single()

  if (error || !profile) {
    console.error('[requireUser] profile lookup failed', error?.message)
    redirect('/')
  }

  if (!profile.organization_id) {
    redirect('/')
  }

  return {
    id: profile.id,
    email: profile.email,
    full_name: profile.full_name,
    role: profile.role as 'admin' | 'member',
    organization_id: profile.organization_id as string,
  }
}
