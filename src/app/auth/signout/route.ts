import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Sign-out handler. Clears the Supabase session cookie and sends the user
 * back to the login page.
 *
 * Uses POST to avoid accidental sign-outs from prefetchers crawling links.
 */
export async function POST(request: Request) {
  const supabase = await createClient()
  await supabase.auth.signOut()

  const url = new URL('/login', request.url)
  return NextResponse.redirect(url, { status: 303 })
}
