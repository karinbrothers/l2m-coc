'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/requireUser'
import { createClient } from '@/lib/supabase/server'

async function generateNextPurchaseCode(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
): Promise<string> {
  const year = new Date().getFullYear()
  const prefix = `WOOL-${year}-`

  const { data, error } = await supabase
    .from('raw_material_purchases')
    .select('code')
    .eq('organization_id', organizationId)
    .like('code', `${prefix}%`)
    .order('code', { ascending: false })
    .limit(1)

  if (error) {
    console.error('[generateNextPurchaseCode]', error.message)
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

export async function createPurchase(formData: FormData) {
  const user = await requireUser()
  const supabase = await createClient()

  const landbaseId = String(formData.get('landbase_id') ?? '').trim()
  const volumeRaw = String(formData.get('volume') ?? '').trim()
  const fibreRaw = String(formData.get('fibre_diameter') ?? '').trim()
  const yearRaw = String(formData.get('year_of_clip') ?? '').trim()
  const batchNumber = String(formData.get('batch_number') ?? '').trim() || null
  const purchaseDate = String(formData.get('purchase_date') ?? '').trim() || null

  if (!landbaseId) {
    redirect('/purchases/new?error=missing_landbase')
  }
  const volume = Number(volumeRaw)
  if (!volumeRaw || !Number.isFinite(volume) || volume <= 0) {
    redirect('/purchases/new?error=invalid_volume')
  }
  const fibreDiameter = fibreRaw ? Number(fibreRaw) : null
  if (fibreRaw && (!Number.isFinite(fibreDiameter as number) || (fibreDiameter as number) <= 0)) {
    redirect('/purchases/new?error=invalid_fibre')
  }
  const yearOfClip = yearRaw ? parseInt(yearRaw, 10) : null
  if (yearRaw && (!Number.isFinite(yearOfClip as number) || (yearOfClip as number) < 1900)) {
    redirect('/purchases/new?error=invalid_year')
  }

  const { data: lb, error: lbErr } = await supabase
    .from('landbases')
    .select('id, eligibility_status')
    .eq('id', landbaseId)
    .single()

  if (lbErr || !lb) {
    redirect('/purchases/new?error=landbase_not_found')
  }
  if (lb.eligibility_status !== 'eligible') {
    redirect('/purchases/new?error=landbase_not_eligible')
  }

  const code = await generateNextPurchaseCode(supabase, user.organization_id)

  // Insert the purchase and ask Postgres to return the new id so we can
  // chain an origin-certificate insert against it.
  const { data: newPurchase, error: insertErr } = await supabase
    .from('raw_material_purchases')
    .insert({
      code,
      organization_id: user.organization_id,
      landbase_id: landbaseId,
      volume,
      volume_remaining: volume,
      volume_unit: 'tonnes',
      commodity_type: 'wool',
      fibre_diameter: fibreDiameter,
      year_of_clip: yearOfClip,
      batch_number: batchNumber,
      purchase_date: purchaseDate,
    })
    .select('id, code')
    .single()

  if (insertErr || !newPurchase) {
    console.error('[createPurchase]', insertErr?.message)
    if (insertErr?.code === '23505') {
      redirect('/purchases/new?error=code_conflict')
    }
    redirect(
      `/purchases/new?error=${encodeURIComponent(insertErr?.message ?? 'insert_failed')}`,
    )
  }

  // Auto-generate the origin certificate for this purchase.
  // Number format mirrors the purchase code, e.g. WOOL-2026-0001 -> OC-WOOL-2026-0001.
  // issued_at defaults to now() in the certificates table.
  const certificateNumber = `OC-${newPurchase.code}`
  const { error: certErr } = await supabase.from('certificates').insert({
    certificate_number: certificateNumber,
    type: 'origin',
    related_purchase_id: newPurchase.id,
  })

  if (certErr) {
    // The purchase already exists; we don't want to fail the whole flow
    // just because the cert insert tripped. Log and let the user re-issue
    // the cert later.
    console.error('[createPurchase] origin cert creation failed:', certErr.message)
  }

  revalidatePath('/purchases')
  revalidatePath('/inventory')
  revalidatePath('/certificates')
  redirect(`/purchases?created=${encodeURIComponent(code)}`)
}
