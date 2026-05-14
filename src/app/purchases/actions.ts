'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/requireUser'
import { createClient } from '@/lib/supabase/server'

async function generateNextPurchaseCode(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<string> {
  // Atomic via Postgres sequence — see migration 43.
  const { data, error } = await supabase.rpc('next_purchase_code')
  if (error || !data) {
    console.error('[next_purchase_code]', error?.message)
    throw new Error('Could not generate purchase code')
  }
  return data as string
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

  // Pull every landbase field that ends up snapshotted onto the cert,
  // so we only hit the DB once for both validation and snapshot capture.
  const { data: lb, error: lbErr } = await supabase
    .from('landbases')
    .select(
      'id, name, country, eligibility_status, expiration_date, monitoring_date, verification_date, eligibility_report_url',
    )
    .eq('id', landbaseId)
    .single()

  if (lbErr || !lb) {
    redirect('/purchases/new?error=landbase_not_found')
  }

  // Eligibility is judged against the purchase date, not the
  // current status — a partner can record a purchase made on a
  // date when the landbase WAS eligible, even if it's lapsed
  // since. Requires verification_date and expiration_date to be
  // set (otherwise we have no window to verify against).
  if (!lb.verification_date || !lb.expiration_date) {
    redirect('/purchases/new?error=landbase_missing_verification')
  }

  const effectiveDate = purchaseDate ?? new Date().toISOString().slice(0, 10)
  if (
    effectiveDate < lb.verification_date ||
    effectiveDate > lb.expiration_date
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
      fibre_diameter: fibreDiameter,
      year_of_clip: yearOfClip,
      batch_number: batchNumber,
      purchase_date: purchaseDate,
    })
    .select('id, code')
    .single()

  if (insertErr || !newPurchase) {
    console.error('[createPurchase]', insertErr?.message)
    redirect(
      `/purchases/new?error=${encodeURIComponent(insertErr?.message ?? 'insert_failed')}`,
    )
  }

  // Mint an origin-certificate number via the SQL function so OC numbers
  // follow the L2M-OC-YYYY-NNNN format consistently with TCs (which are
  // numbered by the issue_tc_for_sale function in the database).
  const { data: certNumberData, error: certNumberErr } = await supabase.rpc(
    'generate_certificate_number',
    { cert_type: 'origin' },
  )

  if (certNumberErr || !certNumberData) {
    console.error(
      '[createPurchase] generate_certificate_number failed:',
      certNumberErr?.message,
    )
    // Fall back to the legacy format so we still issue *something*
    // rather than silently dropping the cert.
  }

  const certificateNumber =
    (certNumberData as string | null) ?? `OC-${newPurchase.code}`

  // Fetch the buyer-org name so we can snapshot it onto the OC.
  // Used by OC Box 2 ("First Stage Processor / Buyer of Raw
  // Material") at display time, RLS-independent.
  const { data: buyerOrg } = await supabase
    .from('organizations')
    .select('name')
    .eq('id', user.organization_id)
    .maybeSingle()

  // Auto-generate the origin certificate for this purchase, with a full
  // snapshot of the landbase + purchase fields so the cert remains a faithful
  // record even if the underlying rows change later.
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
    volume,
    volume_unit: 'tonnes',
    commodity_type: 'wool',
    purchase_date: purchaseDate,
    clip_year_snapshot: yearOfClip,
    report_year_used: new Date().getFullYear(),
    buyer_org_name_snapshot: buyerOrg?.name ?? null,
  })

  if (certErr) {
    // Don't block the purchase flow — log and let the user re-issue later.
    console.error('[createPurchase] origin cert creation failed:', certErr.message)
  }

  revalidatePath('/purchases')
  revalidatePath('/inventory')
  revalidatePath('/certificates')
  redirect(`/purchases?created=${encodeURIComponent(code)}`)
}