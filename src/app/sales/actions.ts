'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/requireUser'
import { createClient } from '@/lib/supabase/server'

export async function generateNextSaleCode(): Promise<string> {
  await requireUser()
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('generate_next_sale_code')
  if (error) {
    console.error('[generateNextSaleCode] error:', error)
    throw new Error('Could not generate sale code')
  }
  return data as string
}

/**
 * Record a sale.
 *
 *   - "external" buyer  → free-text buyer_name, status='accepted' immediately,
 *                          TC auto-issued + linked to OCs (existing flow).
 *   - "platform" buyer  → buyer_org_id from dropdown, status='pending',
 *                          response_deadline = now + N days. TC NOT issued yet
 *                          (will be issued when buyer accepts in /inbox).
 */
export async function createSale(formData: FormData) {
  await requireUser()
  const supabase = await createClient()

  const inventoryLotId = String(formData.get('inventory_lot_id') ?? '').trim()
  const buyerType = String(formData.get('buyer_type') ?? 'external').trim()
  const volumeRaw = String(formData.get('volume') ?? '').trim()
  const saleDate =
    String(formData.get('sale_date') ?? '').trim() ||
    new Date().toISOString().slice(0, 10)
  const notes = String(formData.get('notes') ?? '').trim() || null

  // Buyer-type-specific fields
  const buyerNameRaw = String(formData.get('buyer_name') ?? '').trim()
  const buyerOrgIdRaw = String(formData.get('buyer_org_id') ?? '').trim()
  const responseDaysRaw = String(formData.get('response_days') ?? '14').trim()

  if (!inventoryLotId) redirect('/sales/new?error=missing_source')

  const volume = Number(volumeRaw)
  if (!Number.isFinite(volume) || volume <= 0) {
    redirect('/sales/new?error=invalid_volume')
  }

  let buyerName: string
  let buyerOrgId: string | null
  let responseDays: number

  if (buyerType === 'platform') {
    if (!buyerOrgIdRaw) redirect('/sales/new?error=missing_buyer_org')
    // Look up the org's name to use as buyer_name (NOT NULL column)
    const { data: org } = await supabase
      .from('organizations')
      .select('name')
      .eq('id', buyerOrgIdRaw)
      .maybeSingle()
    if (!org) redirect('/sales/new?error=invalid_buyer_org')
    buyerName = org.name
    buyerOrgId = buyerOrgIdRaw
    responseDays = Number(responseDaysRaw)
    if (!Number.isFinite(responseDays) || responseDays <= 0) responseDays = 14
  } else {
    if (!buyerNameRaw) redirect('/sales/new?error=missing_buyer')
    buyerName = buyerNameRaw
    buyerOrgId = null
    responseDays = 14 // unused for external; passed for completeness
  }

  const code = await generateNextSaleCode()

  const { data: rpcData, error: rpcErr } = await supabase.rpc('record_sale', {
    p_code: code,
    p_inventory_lot_id: inventoryLotId,
    p_buyer_name: buyerName,
    p_buyer_org_id: buyerOrgId,
    p_volume: volume,
    p_sale_date: saleDate,
    p_notes: notes,
    p_response_days: responseDays,
  })

  if (rpcErr) {
    console.error('[createSale] record_sale error:', rpcErr)
    if (rpcErr.message?.includes('insufficient_volume')) {
      redirect('/sales/new?error=insufficient_volume')
    }
    if (rpcErr.message?.includes('lot_not_found')) {
      redirect('/sales/new?error=lot_not_found')
    }
    if (rpcErr.message?.includes('no_organization')) {
      redirect('/sales/new?error=no_organization')
    }
    redirect('/sales/new?error=unknown')
  }

  const sale = rpcData as {
    id: string
    code: string
    organization_id: string
    inventory_lot_id: string
    buyer_name: string
    buyer_org_id: string | null
    volume: number
    sale_date: string
    status: 'pending' | 'accepted' | 'rejected' | 'expired'
  } | null

  if (!sale) {
    console.error('[createSale] record_sale returned no data')
    revalidatePath('/sales')
    redirect('/sales')
  }

  // Only auto-issue TC if the sale was immediately accepted (external buyer).
  // For platform buyers, the TC is issued when the buyer accepts.
  if (sale.status === 'accepted') {
    await issueTransactionCertificate(supabase, sale)
  }

  revalidatePath('/sales')
  revalidatePath('/certificates')
  revalidatePath('/inventory')
  redirect('/sales')
}

/**
 * Issue a Transaction Certificate for a sale and link it to all origin
 * certificates in the lot's processing chain (proportionally attributed).
 *
 * Called from:
 *   - createSale (external-buyer path, immediate)
 *   - acceptSale  (platform-buyer path, after buyer accepts)
 */
export async function issueTransactionCertificate(
  supabase: Awaited<ReturnType<typeof createClient>>,
  sale: {
    id: string
    code: string
    organization_id: string
    inventory_lot_id: string
    buyer_name: string
    volume: number
    sale_date: string
  },
) {
  const [lotRes, orgRes] = await Promise.all([
    supabase
      .from('inventory_lots')
      .select('code, product_name, processing_batch_id')
      .eq('id', sale.inventory_lot_id)
      .maybeSingle(),
    supabase
      .from('organizations')
      .select('name')
      .eq('id', sale.organization_id)
      .maybeSingle(),
  ])

  const lot = lotRes.data
  const sellerOrg = orgRes.data
  if (lotRes.error)
    console.error('[issueTC] lot lookup error:', lotRes.error)
  if (orgRes.error)
    console.error('[issueTC] org lookup error:', orgRes.error)

  // Walk the chain: batch_inputs → raw purchases → origin certs.
  const originAttributions: Array<{
    origin_certificate_id: string
    volume_attributed: number
  }> = []

  if (lot?.processing_batch_id) {
    const { data: inputs } = await supabase
      .from('processing_batch_inputs')
      .select('source_id, volume_used')
      .eq('processing_batch_id', lot.processing_batch_id)
      .eq('source_type', 'raw_purchase')

    if (inputs && inputs.length > 0) {
      const inputTotal = inputs.reduce(
        (s, i) => s + Number(i.volume_used),
        0,
      )
      const purchaseIds = inputs.map((i) => i.source_id)

      const { data: ocs } = await supabase
        .from('certificates')
        .select('id, related_purchase_id')
        .in('related_purchase_id', purchaseIds)
        .eq('type', 'origin')

      if (ocs && ocs.length > 0 && inputTotal > 0) {
        for (const oc of ocs) {
          const matchingInput = inputs.find(
            (i) => i.source_id === oc.related_purchase_id,
          )
          if (!matchingInput) continue
          const attributed =
            (Number(matchingInput.volume_used) / inputTotal) * sale.volume
          originAttributions.push({
            origin_certificate_id: oc.id,
            volume_attributed: attributed,
          })
        }
      }
    }
  }

  const tcNumber = `TC-${sale.code}`

  const { data: tcData, error: tcErr } = await supabase
    .from('certificates')
    .insert({
      certificate_number: tcNumber,
      type: 'transaction',
      related_transaction_id: sale.id,
      volume: sale.volume,
      volume_unit: 'tonnes',
      commodity_type: lot?.product_name ?? null,
      purchase_code: lot?.code ?? null,
      sale_code: sale.code,
      buyer_name_snapshot: sale.buyer_name,
      seller_org_name_snapshot: sellerOrg?.name ?? null,
      sale_date_snapshot: sale.sale_date,
      commodity_type_snapshot: lot?.product_name ?? null,
      volume_snapshot: sale.volume,
      volume_unit_snapshot: 'tonnes',
      source_purchase_code_snapshot: lot?.code ?? null,
    })
    .select('id')
    .single()

  if (tcErr) {
    console.error('[issueTC] TC insert error:', tcErr)
    return
  }
  if (tcData && originAttributions.length > 0) {
    const linkRows = originAttributions.map((a) => ({
      transaction_certificate_id: tcData.id,
      origin_certificate_id: a.origin_certificate_id,
      volume_attributed: a.volume_attributed,
    }))
    const { error: linkErr } = await supabase
      .from('certificate_origin_links')
      .insert(linkRows)
    if (linkErr) {
      console.error('[issueTC] origin link insert error:', linkErr)
    }
  } else if (tcData && originAttributions.length === 0) {
    console.warn(
      `[issueTC] TC ${tcNumber} created but no origin certs found in batch chain`,
    )
  }
}