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

type SaleReturn = {
  id: string
  code: string
  organization_id: string
  source_purchase_id: string
  buyer_name: string
  volume: number
  volume_unit: string
  sale_date: string | null
  notes: string | null
  created_by: string | null
  created_at: string
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

  const { data: rpcData, error: rpcErr } = await supabase.rpc('record_sale', {
    p_code: code,
    p_source_purchase_id: sourcePurchaseId,
    p_buyer_name: buyerName,
    p_volume: volume,
    p_sale_date: saleDate,
    p_notes: notes,
  })

  if (rpcErr || !rpcData) {
    console.error('[createSale]', rpcErr?.message)
    const msg = rpcErr?.message ?? ''
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

  // record_sale returns a `sales` row. Depending on driver behaviour this may
  // arrive as an object or a single-element array — handle both.
  const sale = (Array.isArray(rpcData) ? rpcData[0] : rpcData) as SaleReturn

  // ---- Auto-issue the transaction certificate ---------------------------------
  // Fetch source purchase + its origin cert, plus the seller org name.
  type SrcCertLite = { id: string; type: string }
  type SrcRow = {
    id: string
    code: string
    purchase_date: string | null
    commodity_type: string | null
    certificates: SrcCertLite[] | null
  }

  const [
    { data: src, error: srcErr },
    { data: org, error: orgErr },
  ] = await Promise.all([
    supabase
      .from('raw_material_purchases')
      .select(
        `
        id,
        code,
        purchase_date,
        commodity_type,
        certificates!related_purchase_id ( id, type )
        `,
      )
      .eq('id', sourcePurchaseId)
      .single<SrcRow>(),
    supabase
      .from('organizations')
      .select('id, name')
      .eq('id', user.organization_id)
      .single<{ id: string; name: string }>(),
  ])

  if (srcErr || !src || orgErr || !org) {
    console.error('[createSale.cert.lookup]', srcErr?.message, orgErr?.message)
    revalidatePath('/sales')
    revalidatePath('/inventory')
    revalidatePath('/purchases')
    redirect(`/sales?created=${encodeURIComponent(sale.code)}`)
  }

  const originCert = src.certificates?.find((c) => c.type === 'origin')

  const { data: tcCert, error: tcErr } = await supabase
    .from('certificates')
    .insert({
      certificate_number: `TC-${sale.code}`,
      type: 'transaction',
      related_transaction_id: sale.id,
      sale_code: sale.code,
      buyer_name_snapshot: buyerName,
      seller_org_name_snapshot: org.name,
      sale_date_snapshot: sale.sale_date,
      volume: sale.volume,
      volume_unit: sale.volume_unit,
      commodity_type: src.commodity_type,
      purchase_code: src.code,
      purchase_date: src.purchase_date,
    })
    .select('id')
    .single()

  if (tcErr || !tcCert) {
    console.error('[createSale.cert.insert]', tcErr?.message)
  } else if (originCert) {
    const { error: linkErr } = await supabase
      .from('certificate_origin_links')
      .insert({
        transaction_certificate_id: tcCert.id,
        origin_certificate_id: originCert.id,
        volume_attributed: sale.volume,
      })
    if (linkErr) console.error('[createSale.cert.link]', linkErr.message)
  }

  revalidatePath('/sales')
  revalidatePath('/inventory')
  revalidatePath('/purchases')
  redirect(`/sales?created=${encodeURIComponent(sale.code)}`)
}