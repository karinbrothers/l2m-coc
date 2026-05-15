'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/requireUser'
import { createClient } from '@/lib/supabase/server'

// ---------------------------------------------------------------
// Code generators
// ---------------------------------------------------------------

async function generateNextPurchaseCode(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<string> {
  const { data, error } = await supabase.rpc('next_purchase_code')
  if (error || !data) {
    console.error('[next_purchase_code]', error?.message)
    throw new Error('Could not generate purchase code')
  }
  return data as string
}

// Inline lot code generator for the no-processing passthrough
// flow. Uses LOT-YYYY-NNNN format and MAX+1 lookup.
async function generatePassthroughLotCode(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<string> {
  const year = new Date().getFullYear()
  const prefix = `LOT-${year}-`

  const { data } = await supabase
    .from('inventory_lots')
    .select('code')
    .like('code', `${prefix}%`)
    .order('code', { ascending: false })
    .limit(1)

  let nextNum = 1
  if (data && data.length > 0) {
    const tail = (data[0].code as string).slice(prefix.length)
    const parsed = parseInt(tail, 10)
    if (!Number.isNaN(parsed)) nextNum = parsed + 1
  }
  return `${prefix}${String(nextNum).padStart(4, '0')}`
}

// ---------------------------------------------------------------
// createPurchase
// ---------------------------------------------------------------

export async function createPurchase(formData: FormData) {
  const user = await requireUser()
  const supabase = await createClient()

  const landbaseId = String(formData.get('landbase_id') ?? '').trim()
  const volumeRaw = String(formData.get('volume') ?? '').trim()
  const fibreRaw = String(formData.get('fibre_diameter') ?? '').trim()
  const yearRaw = String(formData.get('year_of_clip') ?? '').trim()
  const batchNumber = String(formData.get('batch_number') ?? '').trim() || null
  const purchaseDate =
    String(formData.get('purchase_date') ?? '').trim() || null
  const shearingDate =
    String(formData.get('shearing_date') ?? '').trim() || null
  const productName = String(formData.get('product_name') ?? '').trim() || null
  const willProcess =
    String(formData.get('will_process') ?? 'yes').trim().toLowerCase() ===
    'yes'
  const attested = String(formData.get('attest') ?? '').trim() === 'on'

  if (!landbaseId) {
    redirect('/purchases/new?error=missing_landbase')
  }
  if (!shearingDate) {
    redirect('/purchases/new?error=missing_shearing_date')
  }
  if (!productName) {
    redirect('/purchases/new?error=missing_product_name')
  }
  if (!attested) {
    redirect('/purchases/new?error=attestation_required')
  }

  const volume = Number(volumeRaw)
  if (!volumeRaw || !Number.isFinite(volume) || volume <= 0) {
    redirect('/purchases/new?error=invalid_volume')
  }
  const fibreDiameter = fibreRaw ? Number(fibreRaw) : null
  if (
    fibreRaw &&
    (!Number.isFinite(fibreDiameter as number) ||
      (fibreDiameter as number) <= 0)
  ) {
    redirect('/purchases/new?error=invalid_fibre')
  }
  const yearOfClip = yearRaw ? parseInt(yearRaw, 10) : null
  if (
    yearRaw &&
    (!Number.isFinite(yearOfClip as number) || (yearOfClip as number) < 1900)
  ) {
    redirect('/purchases/new?error=invalid_year')
  }

  // Fetch the user's display name + org name once, so we can
  // snapshot them on the purchase + OC for the attestation footer.
  const [{ data: profile }, { data: orgRow }, { data: lb, error: lbErr }] =
    await Promise.all([
      supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .maybeSingle(),
      supabase
        .from('organizations')
        .select('name')
        .eq('id', user.organization_id)
        .maybeSingle(),
      supabase
        .from('landbases')
        .select(
          'id, name, country, eligibility_status, expiration_date, monitoring_date, verification_date, eligibility_report_url',
        )
        .eq('id', landbaseId)
        .single(),
    ])

  const attestorName = profile?.full_name ?? null
  const attestorOrgName = orgRow?.name ?? null

  if (lbErr || !lb) {
    redirect('/purchases/new?error=landbase_not_found')
  }

  // Eligibility window is judged against the SHEARING date, not
  // the purchase date. A landbase is valid for this purchase if
  // it was eligible when the wool was sheared.
  if (!lb.verification_date || !lb.expiration_date) {
    redirect('/purchases/new?error=landbase_missing_verification')
  }
  if (
    shearingDate < lb.verification_date ||
    shearingDate > lb.expiration_date
  ) {
    redirect('/purchases/new?error=landbase_not_eligible_on_date')
  }

  const code = await generateNextPurchaseCode(supabase)

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
      product_name: productName,
      shearing_date: shearingDate,
      fibre_diameter: fibreDiameter,
      year_of_clip: yearOfClip,
      batch_number: batchNumber,
      purchase_date: purchaseDate,
      attested_at: new Date().toISOString(),
      attested_by: user.id,
      attested_by_email: user.email ?? null,
      attested_by_name: attestorName,
      attested_by_org_name: attestorOrgName,
    })
    .select('id, code')
    .single()

  if (insertErr || !newPurchase) {
    console.error('[createPurchase]', insertErr?.message)
    redirect(
      `/purchases/new?error=${encodeURIComponent(insertErr?.message ?? 'insert_failed')}`,
    )
  }

  // Mint OC number atomically via SQL function
  const { data: certNumberData, error: certNumberErr } = await supabase.rpc(
    'generate_certificate_number',
    { cert_type: 'origin' },
  )
  if (certNumberErr || !certNumberData) {
    console.error(
      '[createPurchase] generate_certificate_number failed:',
      certNumberErr?.message,
    )
  }
  const certificateNumber =
    (certNumberData as string | null) ?? `OC-${newPurchase.code}`

  // Issue OC. attestorOrgName is the buyer org's name — also used
  // to populate the OC's Box 2 ("First Stage Processor / Buyer of
  // Raw Material") snapshot.
  const { error: certErr } = await supabase.from('certificates').insert({
    certificate_number: certificateNumber,
    type: 'origin',
    related_purchase_id: newPurchase.id,
    landbase_id: lb.id,
    landbase_name_snapshot: lb.name,
    country_snapshot: lb.country,
    eligibility_status_snapshot: lb.eligibility_status,
    expiration_date_snapshot: lb.expiration_date,
    monitoring_date_snapshot: lb.monitoring_date,
    verification_date_snapshot: lb.verification_date,
    eligibility_report_url_snapshot: lb.eligibility_report_url,
    purchase_code: newPurchase.code,
    fibre_diameter_snapshot: fibreDiameter,
    volume,
    volume_unit: 'tonnes',
    commodity_type: 'wool',
    purchase_date: purchaseDate,
    clip_year_snapshot: yearOfClip,
    report_year_used: new Date().getFullYear(),
    buyer_org_name_snapshot: attestorOrgName,
  })
  if (certErr) {
    console.error('[createPurchase] origin cert creation failed:', certErr.message)
  }

  // If the FSP isn't going to process this material themselves
  // (e.g., they're an auction house selling greasy wool on),
  // create a passthrough processing batch + inventory lot so the
  // material is ready to sell as-is. Volume in = volume out, no
  // method. The chain-of-custody logic treats it like any other
  // batch from here on.
  if (!willProcess) {
    try {
      const lotCode = await generatePassthroughLotCode(supabase)
      const { error: passErr } = await supabase.rpc(
        'record_processing_batch',
        {
          p_lot_code: lotCode,
          p_inputs: [
            { raw_purchase_id: newPurchase.id, volume_used: volume },
          ],
          p_output_product: productName,
          p_output_volume: volume,
          p_processing_method: 'No processing — ready to sell as-is',
          p_processing_date: shearingDate ?? purchaseDate ?? new Date().toISOString().slice(0, 10),
          p_subcontractors: null,
        },
      )
      if (passErr) {
        console.error(
          '[createPurchase] passthrough batch failed:',
          passErr.message,
        )
        // Non-fatal — purchase + OC are still created. User can
        // manually create a processing batch later if needed.
      }
    } catch (e) {
      console.error('[createPurchase] passthrough wrap failed:', e)
    }
  }

  revalidatePath('/purchases')
  revalidatePath('/inventory')
  revalidatePath('/certificates')
  revalidatePath('/sales')
  redirect(`/purchases?created=${encodeURIComponent(code)}`)
}