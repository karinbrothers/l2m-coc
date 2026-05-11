// src/app/admin/sales/actions.ts
//
// Server actions for admin sale operations. Each wraps a
// SECURITY DEFINER RPC and does light error mapping for the UI.

'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function cancelPendingSaleAction(
  saleId: string,
  reason: string,
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('cancel_pending_sale_admin', {
    p_sale_id: saleId,
    p_reason: reason.trim() || null,
  })

  if (error) {
    console.error('[cancelPendingSale]', error)
    if (error.message?.includes('admin_only')) {
      return { error: 'Admin only.' }
    }
    if (error.message?.includes('sale_not_pending')) {
      return {
        error:
          'This sale is no longer pending. Cancellation only works on pending sales.',
      }
    }
    if (error.message?.includes('sale_not_found')) {
      return { error: 'Sale not found.' }
    }
    return { error: error.message }
  }

  revalidatePath('/admin/sales')
  revalidatePath('/admin/activity')
  revalidatePath('/inbox')
  revalidatePath('/sales')
  return { error: null }
}

export async function editSaleMetadataAction(
  saleId: string,
  fields: {
    shipping_number: string
    country_of_dispatch: string
    notes: string
  },
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('admin_update_sale_metadata', {
    p_sale_id: saleId,
    p_shipping_number: fields.shipping_number,
    p_country_of_dispatch: fields.country_of_dispatch,
    p_notes: fields.notes,
  })

  if (error) {
    console.error('[editSaleMetadata]', error)
    if (error.message?.includes('admin_only')) {
      return { error: 'Admin only.' }
    }
    if (error.message?.includes('sale_not_found')) {
      return { error: 'Sale not found.' }
    }
    return { error: error.message }
  }

  revalidatePath('/admin/sales')
  revalidatePath('/admin/activity')
  // Cert pages pull these fields live from the sale row, so any
  // open TC will show the new values on next refresh.
  revalidatePath('/certificates', 'layout')
  return { error: null }
}