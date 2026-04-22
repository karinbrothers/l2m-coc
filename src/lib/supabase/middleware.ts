import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Refreshes the Supabase auth session on every request AND enforces
 * authentication on protected routes. Called from the root `src/middleware.ts`.
 *
 * Behaviour:
 *  - Unauthenticated user on any route except /login or /auth/* → redirect to /login
 *  - Authenticated user on /login → redirect to / (already signed in)
 *  - Everyone else → pass through, session cookie refreshed
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // IMPORTANT: keep this getUser() call — it refreshes the session cookie.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl
  const isAuthRoute =
    pathname === '/login' || pathname.startsWith('/auth/')

  // Not signed in and not already on an auth route → send to /login
  if (!user && !isAuthRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    // Preserve the intended destination so /auth/callback can bounce back there.
    url.searchParams.set('next', pathname)
    return NextResponse.redirect(url)
  }

  // Already signed in and visiting /login → go to home
  if (user && pathname === '/login') {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    url.search = ''
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
