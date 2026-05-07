'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/requireUser'
import { createClient } from '@/lib/supabase/server'
import { notifySaleArrived } from '@/lib/email/notifications'

const DEFAULT_RESPONSE_DAYS = 14

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
 * Record a sale to a platform partner. Sale starts in 'pending' status;
 * the buyer accepts or rejects from /inbox. TC issues on acceptance.
 * Buyer org gets a transactional email notification.
 */
export async function createSale(formData: FormData) {
  const user = await requireUser()
  const supabase = await createClient()

  const inventoryLotId = String(formData.get('inventory_lot_id') ?? '').trim()
  const buyerOrgId = String(formData.get('buyer_org_id') ?? '').trim()
  const volumeRaw = String(formData.get('volume') ?? '').trim()
  const saleDate =
    String(formData.get('sale_date') ?? '').trim() ||
    new Date().toISOString().slice(0, 10)
  const notes = String(formData.get('notes') ?? '').trim() || null
  const shippingNumber =
    String(formData.get('shipping_number') ?? '').trim() || null

  if (!inventoryLotId) redirect('/sales/new?error=missing_source')
  if (!buyerOrgId) redirect('/sales/new?error=missing_buyer_org')

  const volume = Number(volumeRaw)
  if (!Number.isFinite(volume) || volume <= 0) {
    redirect('/sales/new?error=invalid_volume')
  }

  // Look up the buyer org's name for buyer_name (NOT NULL column)
  const { data: org } = await supabase
    .from('organizations')
    .select('name')
    .eq('id', buyerOrgId)
    .maybeSingle()
  if (!org) redirect('/sales/new?error=invalid_buyer_org')

  const code = await generateNextSaleCode()

  const { error: rpcErr } = await supabase.rpc('record_sale', {
    p_code: code,
    p_inventory_lot_id: inventoryLotId,
    p_buyer_name: org.name,
    p_buyer_org_id: buyerOrgId,
    p_volume: volume,
    p_sale_date: saleDate,
    p_notes: notes,
    p_response_days: DEFAULT_RESPONSE_DAYS,
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

  // record_sale doesn't accept shipping_number — set it via a
  // SECURITY DEFINER RPC since direct UPDATE is blocked by RLS
  // (sellers don't have a broad UPDATE policy on sales).
  if (shippingNumber) {
    const { data: createdSale } = await supabase
      .from('sales')
      .select('id')
      .eq('code', code)
      .maybeSingle()

    if (createdSale?.id) {
      const { error: setErr } = await supabase.rpc(
        'set_sale_shipping_number',
        {
          p_sale_id: createdSale.id,
          p_shipping_number: shippingNumber,
        },
      )
      if (setErr) {
        console.error(
          '[createSale] set_sale_shipping_number error:',
          setErr,
        )
        // Non-fatal — the sale exists, only the optional field
        // is missing. Surface in logs for follow-up.
      }
    }
  }

  // TC is NOT issued here — it's issued when the buyer accepts the sale
  // in /inbox. See acceptSale in src/app/inbox/actions.ts.

  // Notify the buyer org via email
  const [sellerOrgRes, lotRes] = await Promise.all([
    supabase
      .from('organizations')
      .select('name')
      .eq('id', user.organization_id)
      .maybeSingle(),
    supabase
      .from('inventory_lots')
      .select('product_name')
      .eq('id', inventoryLotId)
      .maybeSingle(),
  ])

  await notifySaleArrived(supabase, {
    saleCode: code,
    sellerOrgName: sellerOrgRes.data?.name ?? 'a partner',
    buyerOrgId: buyerOrgId,
    volume,
    productName: lotRes.data?.product_name ?? null,
  })

  revalidatePath('/sales')
  revalidatePath('/inventory')
  redirect('/sales')
}

/**
 * Issue a Transaction Certificate for an accepted sale. Called from the
 * inbox accept flow. Walks: lot → batch → batch_inputs → raw_purchases →
 * origin certs, attributes volume proportionally, inserts TC + links.
 *
 * NOTE: As of migration 22, TC issuance is handled server-side inside
 * the accept_sale SECURITY DEFINER RPC (issue_tc_for_sale). This JS
 * function is preserved for backwards compatibility but no longer the
 * primary path.
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