'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/requireUser'
import { createClient } from '@/lib/supabase/server'

async function generateNextSaleCode(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
): Promise<string> {
  const year = new Date().getFullYear()
  const prefix = `SALE-${year}-`

  const { data, error } = await supabase
    .from('sales')
    .select('code')
    .eq('organization_id', organizationId)
    .like('code', `${prefix}%`)
    .order('code', { ascending: false })
    .limit(1)

  if (error) {
    console.error('[generateNextSaleCode]', error.message)
  }

  let nextSeq = 1
  const last = data?.[0]?.code
  if (last) {
    const match = last.match(/-(\d+)$/)
    if (match) {
      nextSeq = parseInt(match[1], 10) + 1
    }
  }

  return `${prefix}${String(nextSeq).padStart(4, '0')}`
}

export async function createSale(formData: FormData) {
  const user = await requireUser()
  const supabase = await createClient()

  const sourcePurchaseId = String(formData.get('source_purchase_id') ?? '').trim()
  const buyerName = String(formData.get('buyer_name') ?? '').trim()
  const volumeRaw = String(formData.get('volume') ?? '').trim()
  const saleDate = String(formData.get('sale_date') ?? '').trim() || null
  const notes = String(formData.get('notes') ?? '').trim() || null

  if (!sourcePurchaseId) redirect('/sales/new?error=missing_source')
  if (!buyerName) redirect('/sales/new?error=missing_buyer')
  const volume = Number(volumeRaw)
  if (!volumeRaw || !Number.isFinite(volume) || volume <= 0) {
    redirect('/sales/new?error=invalid_volume')
  }

  const code = await generateNextSaleCode(supabase, user.organization_id)

  const { error: rpcErr } = await supabase.rpc('record_sale', {
    p_code: code,
    p_source_purchase_id: sourcePurchaseId,
    p_buyer_name: buyerName,
    p_volume: volume,
    p_sale_date: saleDate,
    p_notes: notes,
  })

  if (rpcErr) {
    console.error('[createSale]', rpcErr.message)
    const msg = rpcErr.message ?? ''
    if (msg.includes('insufficient_volume')) {
      redirect('/sales/new?error=insufficient_volume')
    }
    if (msg.includes('source_not_found')) {
      redirect('/sales/new?error=source_not_found')
    }
    if (msg.includes('no_organization')) {
      redirect('/sales/new?error=no_organization')
    }
    redirect(`/sales/new?error=${encodeURIComponent(msg)}`)
  }

  revalidatePath('/sales')
  revalidatePath('/inventory')
  revalidatePath('/purchases')
  redirect(`/sales?created=${encodeURIComponent(code)}`)
}
