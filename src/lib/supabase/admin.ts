// src/lib/supabase/admin.ts
//
// Server-side Supabase client using the service-role key. Use
// only inside server actions / route handlers — NEVER inside
// client components or anywhere the bundle ships to the browser.
// The service role key bypasses Row-Level Security and lets you
// call admin auth APIs (generateLink, deleteUser, etc.).

import { createClient } from '@supabase/supabase-js'

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    throw new Error(
      'Missing Supabase admin credentials (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)',
    )
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}