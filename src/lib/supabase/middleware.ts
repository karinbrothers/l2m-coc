import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Refreshes the Supabase auth session on every request AND enforces
 * authentication on protected routes. Called from the root `src/middleware.ts`.
 *
 * Behaviour:
 *  - Unauthenticated user on any route except /login, /auth/*, or /trace/* → redirect to /login
 *  - Authenticated user on /login → redirect to / (already signed in)
 *  - Everyone else → pass through, session cookie refreshed
 *
 * Also forwards the request pathname to server components via an
 * `x-pathname` header, so the root layout can render a minimal shell
 * (no sidebar, no sign-out) on public /trace pages.
 */
export async function updateSession(request: NextRequest) {
  // Forward the pathname to server components via a request header.
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-pathname', request.nextUrl.pathname)

  let supabaseResponse = NextResponse.next({
    request: { headers: requestHeaders },
  })

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
          supabaseResponse = NextResponse.next({
            request: { headers: requestHeaders },
          })
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

  // Not signed in and not on an auth route → send to /login.
  // Note: /trace routes require auth for now (we'll open them up to
  // authenticated retail partners once partner accounts exist).
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
