'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth/requireAdmin'

/**
 * Admin-only: create a pending invitation and email a magic link.
 *
 * Flow:
 *   1. Verify the caller is an admin (requireAdmin)
 *   2. Insert an invitations row for (email, caller's org, role)
 *   3. Call signInWithOtp so Supabase emails the invitee a magic link
 *   4. When they click the link, handle_new_user (migration 05) stamps
 *      their profile with the invitation's org_id + role and marks the
 *      invitation accepted.
 *
 * Errors bubble back to the page via ?error=<message> in the redirect.
 */
export async function createInvitation(formData: FormData) {
  const admin = await requireAdmin()

  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const role = String(formData.get('role') ?? 'partner')

  if (!email) {
    redirect('/admin/invitations?error=missing_email')
  }

  if (role !== 'admin' && role !== 'partner') {
    redirect('/admin/invitations?error=invalid_role')
  }

  const supabase = await createClient()

  // 1. Insert the invitation row. Unique index on (lower(email), org) WHERE
  //    status = 'pending' will reject duplicates with a constraint error.
  const { error: insertError } = await supabase
    .from('invitations')
    .insert({
      email,
      organization_id: admin.organization_id,
      role,
      invited_by: admin.id,
    })

  if (insertError) {
    const msg = insertError.code === '23505'
      ? 'already_invited'
      : insertError.message
    redirect(`/admin/invitations?error=${encodeURIComponent(msg)}`)
  }

  // 2. Send the magic link. The invitee clicks it, hits /auth/callback,
  //    handle_new_user fires and stamps their profile from the invite row.
  const headerList = await headers()
  const host =
    headerList.get('x-forwarded-host') ?? headerList.get('host') ?? 'localhost:3000'
  const proto = headerList.get('x-forwarded-proto') ?? 'https'
  const origin = `${proto}://${host}`

  const { error: otpError } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true, // create the auth.users row on click-through
      emailRedirectTo: `${origin}/auth/callback?next=/`,
    },
  })

  if (otpError) {
    // The invitation row was already inserted — leave it. Admin can see it in
    // the pending list and retry send manually later.
    console.error('[createInvitation] signInWithOtp failed', otpError.message)
    redirect(
      `/admin/invitations?error=${encodeURIComponent('email_send_failed:' + otpError.message)}`,
    )
  }

  revalidatePath('/admin/invitations')
  redirect(`/admin/invitations?sent=1&email=${encodeURIComponent(email)}`)
}

/**
 * Admin-only: revoke a still-pending invitation.
 * Marks status = 'revoked' rather than deleting, to preserve audit trail.
 */
export async function revokeInvitation(formData: FormData) {
  const admin = await requireAdmin()
  const invitationId = String(formData.get('invitation_id') ?? '')

  if (!invitationId) {
    redirect('/admin/invitations?error=missing_id')
  }

  const supabase = await createClient()

  const { error } = await supabase
    .from('invitations')
    .update({ status: 'revoked' })
    .eq('id', invitationId)
    .eq('organization_id', admin.organization_id) // defense in depth; RLS also enforces
    .eq('status', 'pending')

  if (error) {
    redirect(`/admin/invitations?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath('/admin/invitations')
  redirect('/admin/invitations?revoked=1')
}
