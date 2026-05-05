'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/requireUser'
import { createClient } from '@/lib/supabase/server'
import { issueTransactionCertificate } from '../sales/actions'

type AcceptedSale = {
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
  await requireUser()
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

  const sale = data as AcceptedSale | null

  if (sale && sale.status === 'accepted') {
    await issueTransactionCertificate(supabase, sale)
  }

  revalidatePath('/inbox')
  revalidatePath('/sales')
  revalidatePath('/certificates')
  revalidatePath('/inventory')
  redirect('/inbox?accepted=1')
}

export async function rejectSale(formData: FormData) {
  await requireUser()
  const supabase = await createClient()

  const saleId = String(formData.get('sale_id') ?? '').trim()
  const responseNotes =
    String(formData.get('response_notes') ?? '').trim() || null

  if (!saleId) {
    redirect('/inbox?error=missing_id')
  }

  const { error: rpcErr } = await supabase.rpc('reject_sale', {
    p_sale_id: saleId,
    p_notes: responseNotes,
  })

  if (rpcErr) {
    console.error('[rejectSale]', rpcErr)
    redirect(`/inbox?error=${encodeURIComponent(rpcErr.message)}`)
  }

  revalidatePath('/inbox')
  revalidatePath('/sales')
  revalidatePath('/inventory')
  redirect('/inbox?rejected=1')
}