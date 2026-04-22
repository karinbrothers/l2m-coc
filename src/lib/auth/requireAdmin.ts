import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

/**
 * Server-side auth gate for admin-only pages and actions.
 *
 * Redirects to:
 *   /login       if not signed in (defense-in-depth — middleware already does this)
 *   /            if signed in but not an admin
 *
 * Returns the admin's profile row on success, including organization_id which
 * is required for any admin action scoped to their own org (like inviting users).
 */
export async function requireAdmin() {
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
    console.error('[requireAdmin] profile lookup failed', error?.message)
    redirect('/')
  }

  if (profile.role !== 'admin') {
    redirect('/')
  }

  if (!profile.organization_id) {
    // An admin with no org is a misconfiguration — kick them back to home.
    // (This should never happen in practice but makes TypeScript happy downstream.)
    console.error('[requireAdmin] admin has no organization_id', profile.id)
    redirect('/')
  }

  return {
    id: profile.id,
    email: profile.email,
    full_name: profile.full_name,
    role: profile.role as 'admin',
    organization_id: profile.organization_id as string,
  }
}
