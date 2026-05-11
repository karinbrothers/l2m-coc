// src/app/admin/purchases/actions.ts
//
// Server actions for admin purchase operations.

'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function editPurchaseAction(
  purchaseId: string,
  fields: {
    volume: string
    fibre_diameter: string
    year_of_clip: string
    purchase_date: string
    batch_number: string
  },
): Promise<{ error: string | null }> {
  const supabase = await createClient()

  const volume = fields.volume.trim() ? Number(fields.volume) : null
  if (volume != null && (!Number.isFinite(volume) || volume <= 0)) {
    return { error: 'Volume must be a positive number.' }
  }

  const fibreDiameter = fields.fibre_diameter.trim()
    ? Number(fields.fibre_diameter)
    : null
  if (
    fibreDiameter != null &&
    (!Number.isFinite(fibreDiameter) || fibreDiameter <= 0)
  ) {
    return { error: 'Fibre diameter must be a positive number.' }
  }

  const yearOfClip = fields.year_of_clip.trim()
    ? parseInt(fields.year_of_clip, 10)
    : null
  if (yearOfClip != null && (!Number.isFinite(yearOfClip) || yearOfClip < 1900)) {
    return { error: 'Year of clip looks invalid.' }
  }

  const purchaseDate = fields.purchase_date.trim() || null

  const { error } = await supabase.rpc('admin_update_purchase', {
    p_purchase_id: purchaseId,
    p_volume: volume,
    p_fibre_diameter: fibreDiameter,
    p_year_of_clip: yearOfClip,
    p_purchase_date: purchaseDate,
    p_batch_number: fields.batch_number,
  })

  if (error) {
    console.error('[editPurchase]', error)
    if (error.message?.includes('admin_only')) {
      return { error: 'Admin only.' }
    }
    if (error.message?.includes('purchase_not_found')) {
      return { error: 'Purchase not found.' }
    }
    if (error.message?.includes('volume_below_used')) {
      return {
        error:
          "Can't reduce volume below what's already been drawn into a batch. Reduce the batch first, or set the new volume to at least the used amount.",
      }
    }
    if (error.message?.includes('invalid_volume')) {
      return { error: 'Volume must be greater than zero.' }
    }
    return { error: error.message }
  }

  revalidatePath('/admin/purchases')
  revalidatePath('/admin/activity')
  revalidatePath('/purchases')
  revalidatePath('/inventory')
  // Trace pages read the purchase row live, so any open trace
  // reflects the new values on next refresh.
  revalidatePath('/trace', 'layout')
  return { error: null }
}