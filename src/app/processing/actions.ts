'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/requireUser'
import { createClient } from '@/lib/supabase/server'

/**
 * Generate the next inventory lot code, scoped to year. Format: LOT-YYYY-NNNN
 */
export async function generateNextLotCode(): Promise<string> {
  await requireUser()
  const supabase = await createClient()

  const year = new Date().getFullYear()
  const prefix = `LOT-${year}-`

  const { data, error } = await supabase
    .from('inventory_lots')
    .select('code')
    .like('code', `${prefix}%`)
    .order('code', { ascending: false })
    .limit(1)

  if (error) {
    console.error('[generateNextLotCode] error:', error)
    throw new Error('Could not generate lot code')
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
 * Record a processing batch: convert one or more raw purchases into a single
 * inventory lot. Atomic via record_processing_batch RPC.
 *
 * Form fields parsed:
 *  - volume[<raw_purchase_id>]   numeric per available raw purchase (0 = skip)
 *  - output_product              text (required)
 *  - output_volume               numeric (required, > 0)
 *  - output_micron_diameter      numeric (optional)
 *  - processing_method           text (optional)
 *  - processing_date             date (defaults to today)
 *  - subcontractors              text (optional)
 *
 * Microns are stored on the inventory_lot via a separate
 * set_lot_micron RPC after the batch RPC succeeds. The batch
 * RPC doesn't accept it directly to keep its signature stable.
 */
export async function createProcessingBatch(formData: FormData) {
  const user = await requireUser()
  const supabase = await createClient()

  const attested = String(formData.get('attest') ?? '').trim() === 'on'
  if (!attested) {
    redirect('/processing/new?error=attestation_required')
  }

  const outputProduct = String(formData.get('output_product') ?? '').trim()
  const outputVolumeRaw = String(formData.get('output_volume') ?? '').trim()
  const outputMicronRaw = String(
    formData.get('output_micron_diameter') ?? '',
  ).trim()
  const processingMethod =
    String(formData.get('processing_method') ?? '').trim() || null
  const subcontractors =
    String(formData.get('subcontractors') ?? '').trim() || null
  const processingDate =
    String(formData.get('processing_date') ?? '').trim() ||
    new Date().toISOString().slice(0, 10)

  if (!outputProduct) {
    redirect('/processing/new?error=missing_output_product')
  }

  const outputVolume = Number(outputVolumeRaw)
  if (!Number.isFinite(outputVolume) || outputVolume <= 0) {
    redirect('/processing/new?error=invalid_output_volume')
  }

  // Microns are optional; validate only if provided.
  const outputMicron = outputMicronRaw ? Number(outputMicronRaw) : null
  if (
    outputMicron != null &&
    (!Number.isFinite(outputMicron) || outputMicron <= 0)
  ) {
    redirect('/processing/new?error=invalid_micron')
  }

  // Collect inputs from form: keys like "volume[<purchase_id>]"
  const inputs: Array<{ raw_purchase_id: string; volume_used: number }> = []
  for (const [key, value] of formData.entries()) {
    const match = key.match(/^volume\[([^\]]+)\]$/)
    if (!match) continue
    const purchaseId = match[1]
    const vol = Number(String(value).trim())
    if (Number.isFinite(vol) && vol > 0) {
      inputs.push({ raw_purchase_id: purchaseId, volume_used: vol })
    }
  }

  if (inputs.length === 0) {
    redirect('/processing/new?error=no_inputs')
  }

  const lotCode = await generateNextLotCode()

  const { error: rpcErr } = await supabase.rpc('record_processing_batch', {
    p_lot_code: lotCode,
    p_inputs: inputs,
    p_output_product: outputProduct,
    p_output_volume: outputVolume,
    p_processing_method: processingMethod,
    p_processing_date: processingDate,
    p_subcontractors: subcontractors,
  })

  if (rpcErr) {
    console.error('[createProcessingBatch] rpc error:', rpcErr)
    if (rpcErr.message?.includes('insufficient_input_volume')) {
      redirect('/processing/new?error=insufficient_input_volume')
    }
    if (rpcErr.message?.includes('input_not_found')) {
      redirect('/processing/new?error=input_not_found')
    }
    if (rpcErr.message?.includes('no_organization')) {
      redirect('/processing/new?error=no_organization')
    }
    if (rpcErr.message?.includes('invalid_input_volume')) {
      redirect('/processing/new?error=invalid_input_volume')
    }
    redirect('/processing/new?error=unknown')
  }

  // If user provided output microns, attach them to the lot we
  // just created. Direct UPDATE would be blocked by RLS, so use
  // the security-definer set_lot_micron RPC.
  if (outputMicron != null) {
    const { data: lot } = await supabase
      .from('inventory_lots')
      .select('id')
      .eq('code', lotCode)
      .maybeSingle()

    if (lot?.id) {
      const { error: micErr } = await supabase.rpc('set_lot_micron', {
        p_lot_id: lot.id,
        p_micron: outputMicron,
      })
      if (micErr) {
        console.error('[createProcessingBatch] set_lot_micron failed:', micErr)
        // Non-fatal — the batch + lot are created, only the
        // optional micron field is missing.
      }
    }
  }

  // Stamp attestation on the processing batch we just created.
  // Look it up by inventory_lot.code → inventory_lot_id.
  try {
    const { data: lot } = await supabase
      .from('inventory_lots')
      .select('id')
      .eq('code', lotCode)
      .maybeSingle()
    if (lot?.id) {
      await supabase
        .from('processing_batches')
        .update({
          attested_at: new Date().toISOString(),
          attested_by: user.id,
          attested_by_email: user.email ?? null,
        })
        .eq('inventory_lot_id', lot.id)
    }
  } catch (e) {
    console.error('[createProcessingBatch] attestation stamp failed:', e)
  }

  revalidatePath('/processing')
  revalidatePath('/inventory')
  revalidatePath('/sales')
  redirect('/processing')
}