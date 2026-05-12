// src/app/certificates/[id]/actions.ts
//
// Admin-only server actions for voiding / un-voiding a cert.

'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function voidCertificateAction(
  certId: string,
  reason: string,
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('admin_void_certificate', {
    p_cert_id: certId,
    p_reason: reason,
  })

  if (error) {
    console.error('[voidCertificate]', error)
    if (error.message?.includes('admin_only')) {
      return { error: 'Admin only.' }
    }
    if (error.message?.includes('reason_required')) {
      return { error: 'A reason is required to void a certificate.' }
    }
    if (error.message?.includes('cert_not_found')) {
      return { error: 'Certificate not found.' }
    }
    return { error: error.message }
  }

  revalidatePath('/certificates')
  revalidatePath('/certificates', 'layout')
  revalidatePath('/admin/sales')
  revalidatePath('/admin/activity')
  return { error: null }
}

export async function unvoidCertificateAction(
  certId: string,
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('admin_unvoid_certificate', {
    p_cert_id: certId,
  })
  if (error) {
    console.error('[unvoidCertificate]', error)
    if (error.message?.includes('admin_only')) {
      return { error: 'Admin only.' }
    }
    return { error: error.message }
  }
  revalidatePath('/certificates')
  revalidatePath('/certificates', 'layout')
  revalidatePath('/admin/sales')
  revalidatePath('/admin/activity')
  return { error: null }
}