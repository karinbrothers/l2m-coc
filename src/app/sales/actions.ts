'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/requireUser'
import { createClient } from '@/lib/supabase/server'

export async function generateNextSaleCode(): Promise<string> {
  await requireUser()
  const supabase = await createClient()
  const year = new Date().getFullYear()
  const prefix = `SALE-${year}-`
  const { data, error } = await supabase
    .from('sales')
    .select('code')
    .like('code', `${prefix}%`)
    .order('code', { ascending: false })
    .limit(1)
  if (error) {
    console.error('[generateNextSaleCode] error:', error)
    throw new Error('Could not generate sale code')
  }
  let nextNum = 1
  if (data && data.length > 0) {
    const tail = (data[0].code as string).slice(prefix.length)
    const parsed = parseInt(tail, 10)
    if (!Number.isNaN(parsed)) nextNum = parsed + 1
  }
  return `${prefix}${String(nextNum).padStart(4, '0')}`
}

/**
 * Record a sale drawn from a processed inventory lot. Auto-issues a
 * Transaction Certificate that links back to ALL origin certificates
 * in the lot's processing chain, with proportional volume_attributed.
 */
export async function createSale(formData: FormData) {
  await requireUser()
  const supabase = await createClient()

  const inventoryLotId = String(formData.get('inventory_lot_id') ?? '').trim()
  const buyerName = String(formData.get('buyer_name') ?? '').trim()
  const volumeRaw = String(formData.get('volume') ?? '').trim()
  const saleDate =
    String(formData.get('sale_date') ?? '').trim() ||
    new Date().toISOString().slice(0, 10)
  const notes = String(formData.get('notes') ?? '').trim() || null

  if (!inventoryLotId) redirect('/sales/new?error=missing_source')
  if (!buyerName) redirect('/sales/new?error=missing_buyer')
  const volume = Number(volumeRaw)
  if (!Number.isFinite(volume) || volume <= 0) {
    redirect('/sales/new?error=invalid_volume')
  }

  const code = await generateNextSaleCode()

  const { data: rpcData, error: rpcErr } = await supabase.rpc('record_sale', {
    p_code: code,
    p_inventory_lot_id: inventoryLotId,
    p_buyer_name: buyerName,
    p_volume: volume,
    p_sale_date: saleDate,
    p_notes: notes,
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
    volume: number
    sale_date: string
  } | null

  if (!sale) {
    console.error('[createSale] record_sale returned no data')
    revalidatePath('/sales')
    redirect('/sales')
  }

  // ---- Auto-issue Transaction Certificate -----------------------------
  // Look up the lot (for product name + batch_id) and seller org in parallel.
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
    console.error('[createSale] lot lookup error:', lotRes.error)
  if (orgRes.error)
    console.error('[createSale] org lookup error:', orgRes.error)

  // Walk the chain: batch_inputs → raw purchases → origin certs.
  // Allocate volume_attributed proportionally:
  //   (input_volume_used / batch_input_total) * sale_volume
  const originAttributions: Array<{
    origin_certificate_id: string
    volume_attributed: number
  }> = []

  if (lot?.processing_batch_id) {
    const { data: inputs, error: inputsErr } = await supabase
      .from('processing_batch_inputs')
      .select('source_id, volume_used')
      .eq('processing_batch_id', lot.processing_batch_id)
      .eq('source_type', 'raw_purchase')

    if (inputsErr) {
      console.error('[createSale] batch_inputs lookup error:', inputsErr)
    } else if (inputs && inputs.length > 0) {
      const inputTotal = inputs.reduce(
        (s, i) => s + Number(i.volume_used),
        0,
      )
      const purchaseIds = inputs.map((i) => i.source_id)

      const { data: ocs, error: ocsErr } = await supabase
        .from('certificates')
        .select('id, related_purchase_id')
        .in('related_purchase_id', purchaseIds)
        .eq('type', 'origin')

      if (ocsErr) {
        console.error('[createSale] origin cert lookup error:', ocsErr)
      } else if (ocs && ocs.length > 0 && inputTotal > 0) {
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
      // Mirror columns the UI reads from
      volume: sale.volume,
      volume_unit: 'tonnes',
      commodity_type: lot?.product_name ?? null,
      purchase_code: lot?.code ?? null,
      // Snapshot fields
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
    console.error('[createSale] TC insert error:', tcErr)
  } else if (tcData && originAttributions.length > 0) {
    const linkRows = originAttributions.map((a) => ({
      transaction_certificate_id: tcData.id,
      origin_certificate_id: a.origin_certificate_id,
      volume_attributed: a.volume_attributed,
    }))
    const { error: linkErr } = await supabase
      .from('certificate_origin_links')
      .insert(linkRows)
    if (linkErr) {
      console.error('[createSale] origin link insert error:', linkErr)
    }
  } else if (tcData && originAttributions.length === 0) {
    console.warn(
      `[createSale] TC ${tcNumber} created but no origin certs found in batch chain`,
    )
  }

  revalidatePath('/sales')
  revalidatePath('/certificates')
  revalidatePath('/inventory')
  redirect('/sales')
}