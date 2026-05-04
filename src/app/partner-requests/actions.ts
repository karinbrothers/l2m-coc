'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/requireUser'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { createClient } from '@/lib/supabase/server'

export async function createPartnerRequest(formData: FormData) {
  const user = await requireUser()
  const supabase = await createClient()

  const companyName = String(formData.get('company_name') ?? '').trim()
  const contactName = String(formData.get('contact_name') ?? '').trim() || null
  const contactEmail = String(formData.get('contact_email') ?? '').trim() || null
  const country = String(formData.get('country') ?? '').trim() || null
  const notes = String(formData.get('notes') ?? '').trim() || null

  if (!companyName) {
    redirect('/partner-requests/new?error=missing_company_name')
  }

  const { error } = await supabase.from('partner_requests').insert({
    requested_by_user_id: user.id,
    requested_by_org_id: user.organization_id,
    company_name: companyName,
    contact_name: contactName,
    contact_email: contactEmail,
    country,
    notes,
  })

  if (error) {
    console.error('[createPartnerRequest]', error)
    redirect(
      `/partner-requests/new?error=${encodeURIComponent(error.message)}`,
    )
  }

  revalidatePath('/partner-requests')
  redirect('/partner-requests?submitted=1')
}

export async function approvePartnerRequest(formData: FormData) {
  await requireAdmin()
  const supabase = await createClient()

  const requestId = String(formData.get('request_id') ?? '').trim()
  const adminNotes = String(formData.get('admin_notes') ?? '').trim() || null
  const resolvedOrgId =
    String(formData.get('resolved_org_id') ?? '').trim() || null

  if (!requestId) {
    redirect('/partner-requests?error=missing_id')
  }

  const { error } = await supabase
    .from('partner_requests')
    .update({
      status: 'approved',
      admin_notes: adminNotes,
      resolved_org_id: resolvedOrgId,
      resolved_at: new Date().toISOString(),
    })
    .eq('id', requestId)
    .eq('status', 'pending')

  if (error) {
    redirect(`/partner-requests?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath('/partner-requests')
  redirect('/partner-requests?approved=1')
}

export async function rejectPartnerRequest(formData: FormData) {
  await requireAdmin()
  const supabase = await createClient()

  const requestId = String(formData.get('request_id') ?? '').trim()
  const adminNotes = String(formData.get('admin_notes') ?? '').trim() || null

  if (!requestId) {
    redirect('/partner-requests?error=missing_id')
  }

  const { error } = await supabase
    .from('partner_requests')
    .update({
      status: 'rejected',
      admin_notes: adminNotes,
      resolved_at: new Date().toISOString(),
    })
    .eq('id', requestId)
    .eq('status', 'pending')

  if (error) {
    redirect(`/partner-requests?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath('/partner-requests')
  redirect('/partner-requests?rejected=1')
}