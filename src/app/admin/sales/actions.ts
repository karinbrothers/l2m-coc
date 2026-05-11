// src/app/admin/sales/actions.ts
//
// Server actions for admin sale operations. Each wraps a
// SECURITY DEFINER RPC and does light error mapping for the UI.

'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { notifySaleRejected } from '@/lib/email/notifications'

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

  // Notify the seller that their pending sale was cancelled by
  // an admin. Reuses the existing rejected-sale email template
  // since cancel/reject look the same to the seller.
  const { data: sale } = await supabase
    .from('sales')
    .select(
      'code, volume, organization_id, buyer_org_id, buyer_name, response_notes, organizations:buyer_org_id(name)',
    )
    .eq('id', saleId)
    .maybeSingle()

  if (sale) {
    const buyerName =
      (sale.organizations as unknown as { name: string } | null)?.name ??
      sale.buyer_name ??
      'a buyer'
    await notifySaleRejected(supabase, {
      saleCode: sale.code,
      buyerOrgName: buyerName,
      sellerOrgId: sale.organization_id,
      volume: Number(sale.volume),
      notes: sale.response_notes,
    })
  }

  revalidatePath('/admin/sales')
  revalidatePath('/admin/activity')
  revalidatePath('/inbox')
  revalidatePath('/sales')
  return { error: null }
}

export async function editSaleAction(
  saleId: string,
  fields: {
    volume: string
    sale_date: string
    shipping_number: string
    country_of_dispatch: string
    notes: string
  },
): Promise<{ error: string | null }> {
  const supabase = await createClient()

  // Parse / coerce. Empty volume / sale_date means "don't change".
  const volume = fields.volume.trim()
    ? Number(fields.volume)
    : null
  if (volume != null && (!Number.isFinite(volume) || volume <= 0)) {
    return { error: 'Volume must be a positive number.' }
  }
  const saleDate = fields.sale_date.trim() || null

  const { error } = await supabase.rpc('admin_update_sale', {
    p_sale_id: saleId,
    p_volume: volume,
    p_sale_date: saleDate,
    p_shipping_number: fields.shipping_number,
    p_country_of_dispatch: fields.country_of_dispatch,
    p_notes: fields.notes,
  })

  if (error) {
    console.error('[editSale]', error)
    if (error.message?.includes('admin_only')) {
      return { error: 'Admin only.' }
    }
    if (error.message?.includes('sale_not_found')) {
      return { error: 'Sale not found.' }
    }
    if (error.message?.includes('insufficient_lot_volume')) {
      return {
        error:
          'Not enough remaining volume on the source lot to support that increase. Reduce the new volume or free up the lot first.',
      }
    }
    if (error.message?.includes('invalid_volume')) {
      return { error: 'Volume must be greater than zero.' }
    }
    return { error: error.message }
  }

  revalidatePath('/admin/sales')
  revalidatePath('/admin/activity')
  revalidatePath('/certificates', 'layout')
  revalidatePath('/inbox')
  revalidatePath('/sales')
  return { error: null }
}