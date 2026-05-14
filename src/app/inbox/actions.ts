'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/requireUser'
import { createClient } from '@/lib/supabase/server'
import {
  notifySaleAccepted,
  notifySaleRejected,
  notifyCertificateIssued,
} from '@/lib/email/notifications'

type SaleRow = {
  id: string
  code: string
  organization_id: string
  inventory_lot_id: string
  buyer_name: string
  volume: number
  sale_date: string
  status: 'pending' | 'accepted' | 'rejected' | 'expired'
}

// Helper: inline lot code generator for the passthrough path
// (same shape as the one in purchases/actions.ts).
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

export async function acceptSale(formData: FormData) {
  const user = await requireUser()
  const supabase = await createClient()

  const saleId = String(formData.get('sale_id') ?? '').trim()
  const responseNotes =
    String(formData.get('response_notes') ?? '').trim() || null
  const willProcess =
    String(formData.get('will_process') ?? 'yes').trim().toLowerCase() ===
    'yes'
  const attested = String(formData.get('attest') ?? '').trim() === 'on'

  if (!saleId) {
    redirect('/inbox?error=missing_id')
  }
  if (!attested) {
    redirect('/inbox?error=attestation_required')
  }

  const { data, error: rpcErr } = await supabase.rpc('accept_sale', {
    p_sale_id: saleId,
    p_notes: responseNotes,
  })

  if (rpcErr) {
    console.error('[acceptSale]', rpcErr)
    redirect(`/inbox?error=${encodeURIComponent(rpcErr.message)}`)
  }

  const sale = data as SaleRow | null

  if (sale) {
    // Stamp acceptance attestation on the sale via SECURITY DEFINER
    // RPC (direct UPDATE is blocked by RLS).
    const { error: attErr } = await supabase.rpc(
      'set_sale_acceptance_attestation',
      {
        p_sale_id: sale.id,
        p_attested_by: user.id,
      },
    )
    if (attErr) {
      console.error('[acceptSale] attestation stamp failed:', attErr.message)
    }

    const [{ data: buyerOrg }, { data: sellerOrg }, { data: tc }] =
      await Promise.all([
        supabase
          .from('organizations')
          .select('name')
          .eq('id', user.organization_id)
          .maybeSingle(),
        supabase
          .from('organizations')
          .select('name')
          .eq('id', sale.organization_id)
          .maybeSingle(),
        supabase
          .from('certificates')
          .select('id, certificate_number')
          .eq('related_transaction_id', sale.id)
          .eq('type', 'transaction')
          .maybeSingle(),
      ])

    const buyerOrgName = buyerOrg?.name ?? 'a partner'
    const sellerOrgName = sellerOrg?.name ?? 'a partner'

    await notifySaleAccepted(supabase, {
      saleCode: sale.code,
      buyerOrgName,
      sellerOrgId: sale.organization_id,
      volume: sale.volume,
      notes: responseNotes,
    })

    if (tc) {
      await notifyCertificateIssued(supabase, {
        certId: tc.id,
        certNumber: tc.certificate_number,
        saleCode: sale.code,
        sellerOrgName,
        buyerOrgId: user.organization_id,
        volume: sale.volume,
      })
    }

    // accept_sale creates a received purchase for the buyer
    // (organization_id = us, source_sale_id = this sale, no
    // landbase_id). Always stamp our attestation on it.
    try {
      const { data: receivedPurchase } = await supabase
        .from('raw_material_purchases')
        .select('id, volume, volume_unit, product_name')
        .eq('source_sale_id', sale.id)
        .eq('organization_id', user.organization_id)
        .maybeSingle()

      if (receivedPurchase) {
        const { error: attRpErr } = await supabase.rpc(
          'set_received_purchase_attestation',
          {
            p_purchase_id: receivedPurchase.id,
            p_attested_by: user.id,
          },
        )
        if (attRpErr) {
          console.error(
            '[acceptSale] received-purchase attestation failed:',
            attRpErr.message,
          )
        }

        // No-process path: auto-create a passthrough lot from it
        // so it's ready to sell immediately.
        if (!willProcess) {
          const lotCode = await generatePassthroughLotCode(supabase)
          const { error: passErr } = await supabase.rpc(
            'record_processing_batch',
            {
              p_lot_code: lotCode,
              p_inputs: [
                {
                  raw_purchase_id: receivedPurchase.id,
                  volume_used: receivedPurchase.volume,
                },
              ],
              p_output_product: receivedPurchase.product_name ?? 'Wool',
              p_output_volume: receivedPurchase.volume,
              p_processing_method:
                'No further processing — ready to sell as-is',
              p_processing_date: new Date().toISOString().slice(0, 10),
              p_subcontractors: null,
            },
          )
          if (passErr) {
            console.error(
              '[acceptSale] passthrough batch failed:',
              passErr.message,
            )
            // Non-fatal — the acceptance + TC are still good.
          }
        }
      }
    } catch (e) {
      console.error('[acceptSale] received-purchase wrap failed:', e)
    }
  }

  revalidatePath('/inbox')
  revalidatePath('/sales')
  revalidatePath('/certificates')
  revalidatePath('/inventory')
  revalidatePath('/purchases')
  revalidatePath('/traceability')
  redirect('/inbox?accepted=1')
}

export async function rejectSale(formData: FormData) {
  const user = await requireUser()
  const supabase = await createClient()

  const saleId = String(formData.get('sale_id') ?? '').trim()
  const responseNotes =
    String(formData.get('response_notes') ?? '').trim() || null

  if (!saleId) {
    redirect('/inbox?error=missing_id')
  }

  const { data, error: rpcErr } = await supabase.rpc('reject_sale', {
    p_sale_id: saleId,
    p_notes: responseNotes,
  })

  if (rpcErr) {
    console.error('[rejectSale]', rpcErr)
    redirect(`/inbox?error=${encodeURIComponent(rpcErr.message)}`)
  }

  const sale = data as SaleRow | null

  if (sale) {
    const { data: buyerOrg } = await supabase
      .from('organizations')
      .select('name')
      .eq('id', user.organization_id)
      .maybeSingle()

    await notifySaleRejected(supabase, {
      saleCode: sale.code,
      buyerOrgName: buyerOrg?.name ?? 'a partner',
      sellerOrgId: sale.organization_id,
      volume: sale.volume,
      notes: responseNotes,
    })
  }

  revalidatePath('/inbox')
  revalidatePath('/sales')
  revalidatePath('/inventory')
  redirect('/inbox?rejected=1')
}