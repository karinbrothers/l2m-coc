'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

/**
 * Server action invoked by the login form.
 * Sends a magic link to the given email and redirects to a "check your inbox" state.
 */
export async function sendMagicLink(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim()
  const next = String(formData.get('next') ?? '/')

  if (!email) {
    redirect('/login?error=missing_email')
  }

  const supabase = await createClient()
  const headerList = await headers()

  // Prefer the forwarded host (Vercel / proxies); fall back to host header.
  const host =
    headerList.get('x-forwarded-host') ?? headerList.get('host') ?? 'localhost:3000'
  const proto = headerList.get('x-forwarded-proto') ?? 'https'
  const origin = `${proto}://${host}`

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      // Invite-only as of Day 5. Unknown emails get a "Signups not allowed"
      // error from Supabase, which we surface on the login page. Admins use
      // /admin/invitations (which calls signInWithOtp with shouldCreateUser:
      // true) to onboard new users.
      shouldCreateUser: false,
      emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  })

  if (error) {
    console.error('[sendMagicLink]', error.message)
    redirect(`/login?error=${encodeURIComponent(error.message)}`)
  }

  redirect(`/login?sent=1&email=${encodeURIComponent(email)}`)
}
