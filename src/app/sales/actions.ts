'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/requireUser'
import { createClient } from '@/lib/supabase/server'

/**
 * Generate the next sale code for the current org, scoped to year.
 * Format: SALE-YYYY-NNNN
 */
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
    const lastCode = data[0].code as string
    const tail = lastCode.slice(prefix.length)
    const parsed = parseInt(tail, 10)
    if (!Number.isNaN(parsed)) nextNum = parsed + 1
  }

  return `${prefix}${String(nextNum).padStart(4, '0')}`
}

/**
 * Record a sale, decrement source purchase volume, and auto-issue a
 * Transaction Certificate that links back to the origin certificate of
 * the source purchase.
 *
 * Validation errors redirect back to /sales/new with ?error=<code>
 * so the form can render a friendly message.
 */
export async function createSale(formData: FormData) {
  await requireUser()
  const supabase = await createClient()

  // ---- 1. Validate form input --------------------------------------------
  const sourcePurchaseId = String(
    formData.get('source_purchase_id') ?? '',
  ).trim()
  const buyerName = String(formData.get('buyer_name') ?? '').trim()
  const volumeRaw = String(formData.get('volume') ?? '').trim()
  const saleDate =
    String(formData.get('sale_date') ?? '').trim() ||
    new Date().toISOString().slice(0, 10)
  const notes = String(formData.get('notes') ?? '').trim() || null

  if (!sourcePurchaseId) redirect('/sales/new?error=missing_source')
  if (!buyerName) redirect('/sales/new?error=missing_buyer')

  const volume = Number(volumeRaw)
  if (!Number.isFinite(volume) || volume <= 0) {
    redirect('/sales/new?error=invalid_volume')
  }

  // ---- 2. Generate sale code internally ----------------------------------
  const code = await generateNextSaleCode()

  // ---- 3. Record the sale via SECURITY DEFINER RPC -----------------------
  const { data: rpcData, error: rpcErr } = await supabase.rpc('record_sale', {
    p_code: code,
    p_source_purchase_id: sourcePurchaseId,
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
    if (rpcErr.message?.includes('source_not_found')) {
      redirect('/sales/new?error=source_not_found')
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
    source_purchase_id: string
    buyer_name: string
    volume: number
    sale_date: string
  } | null

  if (!sale) {
    console.error('[createSale] record_sale returned no data')
    revalidatePath('/sales')
    redirect('/sales')
  }

  // ---- 4. Auto-issue Transaction Certificate -----------------------------
  // Look up snapshot data IN PARALLEL: source purchase, seller org, origin cert
  // Direct OC query avoids PostgREST nested-select FK disambiguation bugs.
  const [purchaseRes, orgRes, originCertRes] = await Promise.all([
    supabase
      .from('raw_material_purchases')
      .select('code, commodity_type')
      .eq('id', sale.source_purchase_id)
      .maybeSingle(),
    supabase
      .from('organizations')
      .select('name')
      .eq('id', sale.organization_id)
      .maybeSingle(),
    supabase
      .from('certificates')
      .select('id, certificate_number')
      .eq('related_purchase_id', sale.source_purchase_id)
      .eq('type', 'origin')
      .maybeSingle(),
  ])

  const purchase = purchaseRes.data
  const sellerOrg = orgRes.data
  const originCert = originCertRes.data ?? null

  if (purchaseRes.error) {
    console.error('[createSale] purchase lookup error:', purchaseRes.error)
  }
  if (orgRes.error) {
    console.error('[createSale] org lookup error:', orgRes.error)
  }
  if (originCertRes.error) {
    console.error('[createSale] origin cert lookup error:', originCertRes.error)
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
      commodity_type: purchase?.commodity_type ?? null,
      purchase_code: purchase?.code ?? null,
      // Snapshot fields
      sale_code: sale.code,
      buyer_name_snapshot: sale.buyer_name,
      seller_org_name_snapshot: sellerOrg?.name ?? null,
      sale_date_snapshot: sale.sale_date,
      commodity_type_snapshot: purchase?.commodity_type ?? null,
      volume_snapshot: sale.volume,
      volume_unit_snapshot: 'tonnes',
      source_purchase_code_snapshot: purchase?.code ?? null,
    })
    .select('id')
    .single()

  if (tcErr) {
    console.error('[createSale] TC insert error:', tcErr)
    // Don't block the sale on TC failure — log and continue
  } else if (tcData && originCert) {
    // ---- 5. Link TC -> OC -----------------------------------------------
    const { error: linkErr } = await supabase
      .from('certificate_origin_links')
      .insert({
        transaction_certificate_id: tcData.id,
        origin_certificate_id: originCert.id,
        volume_attributed: sale.volume,
      })

    if (linkErr) {
      console.error('[createSale] origin link insert error:', linkErr)
    }
  } else if (tcData && !originCert) {
    console.warn(
      `[createSale] TC ${tcNumber} created but no origin cert found for purchase ${sale.source_purchase_id}`,
    )
  }

  // ---- 6. Done -----------------------------------------------------------
  revalidatePath('/sales')
  revalidatePath('/certificates')
  redirect('/sales')
}