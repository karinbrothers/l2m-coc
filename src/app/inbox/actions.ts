'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/requireUser'
import { createClient } from '@/lib/supabase/server'
import {
  notifySaleAccepted,
  notifySaleRejected,
} from '@/lib/email/notifications'

type SaleRow = {
  id: string
  code: string
  organization_id: string
  inventory_lot_id: string
  buyer_name: string
  volume: number
  sale_date: string
  status: 'pending' | 'accepted' | 'rejected' | 'expired'
}

export async function acceptSale(formData: FormData) {
  const user = await requireUser()
  const supabase = await createClient()

  const saleId = String(formData.get('sale_id') ?? '').trim()
  const responseNotes =
    String(formData.get('response_notes') ?? '').trim() || null

  if (!saleId) {
    redirect('/inbox?error=missing_id')
  }

  const { data, error: rpcErr } = await supabase.rpc('accept_sale', {
    p_sale_id: saleId,
    p_notes: responseNotes,
  })

  if (rpcErr) {
    console.error('[acceptSale]', rpcErr)
    redirect(`/inbox?error=${encodeURIComponent(rpcErr.message)}`)
  }

  // accept_sale RPC also issues the TC server-side and creates the
  // buyer's received raw_material_purchases row.

  const sale = data as SaleRow | null

  // Notify the seller org
  if (sale) {
    const { data: buyerOrg } = await supabase
      .from('organizations')
      .select('name')
      .eq('id', user.organization_id)
      .maybeSingle()

    await notifySaleAccepted(supabase, {
      saleCode: sale.code,
      buyerOrgName: buyerOrg?.name ?? 'a partner',
      sellerOrgId: sale.organization_id,
      volume: sale.volume,
      notes: responseNotes,
    })
  }

  revalidatePath('/inbox')
  revalidatePath('/sales')
  revalidatePath('/certificates')
  revalidatePath('/inventory')
  revalidatePath('/purchases')
  redirect('/inbox?accepted=1')
}

export async function rejectSale(formData: FormData) {
  const user = await requireUser()
  const supabase = await createClient()

  const saleId = String(formData.get('sale_id') ?? '').trim()
  const responseNotes =
    String(formData.get('response_notes') ?? '').trim() || null

  if (!saleId) {
    redirect('/inbox?error=missing_id')
  }

  const { data, error: rpcErr } = await supabase.rpc('reject_sale', {
    p_sale_id: saleId,
    p_notes: responseNotes,
  })

  if (rpcErr) {
    console.error('[rejectSale]', rpcErr)
    redirect(`/inbox?error=${encodeURIComponent(rpcErr.message)}`)
  }

  const sale = data as SaleRow | null

  // Notify the seller org
  if (sale) {
    const { data: buyerOrg } = await supabase
      .from('organizations')
      .select('name')
      .eq('id', user.organization_id)
      .maybeSingle()

    await notifySaleRejected(supabase, {
      saleCode: sale.code,
      buyerOrgName: buyerOrg?.name ?? 'a partner',
      sellerOrgId: sale.organization_id,
      volume: sale.volume,
      notes: responseNotes,
    })
  }

  revalidatePath('/inbox')
  revalidatePath('/sales')
  revalidatePath('/inventory')
  redirect('/inbox?rejected=1')
}