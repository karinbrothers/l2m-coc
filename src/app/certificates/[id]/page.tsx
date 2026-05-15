// src/app/certificates/[id]/page.tsx
//
// Loads a certificate plus the joined data each cert type needs.
// Renders a VOIDED banner if the cert has been marked invalid.
// Shows a void/un-void admin button to admins above the chrome.

import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { OriginCertificate } from '@/components/certificates/OriginCertificate'
import {
  TransactionCertificate,
  type ImmediateInput,
} from '@/components/certificates/TransactionCertificate'
import VoidedBanner from '@/components/certificates/VoidedBanner'
import VoidCertButton from './VoidCertButton'

export const dynamic = 'force-dynamic'

export default async function CertificateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  // Determine if the current user is an admin (gates the void
  // button). Cert visibility itself goes through the existing
  // user_can_see_cert RLS.
  let isAdmin = false
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle()
    isAdmin = profile?.role === 'admin'
  }

  const { data: cert, error } = await supabase
    .from('certificates')
    .select(
      `
      *,
      certificate_origin_links!transaction_certificate_id (
        id,
        volume_attributed,
        origin_certificate:origin_certificate_id (
          id,
          certificate_number,
          purchase_code,
          landbase_name_snapshot,
          country_snapshot
        )
      ),
      related_purchase:raw_material_purchases!related_purchase_id (
        attested_at,
        attested_by_email
      ),
      sale:sales!related_transaction_id (
        code,
        shipping_number,
        country_of_dispatch,
        attested_at,
        attested_by_email,
        acceptance_attested_at,
        acceptance_attested_by_email,
        inventory_lot:inventory_lot_id (
          code,
          product_name,
          output_micron_diameter,
          processing_batch:processing_batch_id (
            input_total_volume,
            output_volume,
            output_product,
            processing_method,
            processing_date,
            subcontractors
          )
        )
      )
      `,
    )
    .eq('id', id)
    .maybeSingle()

  let immediateInputs: ImmediateInput[] = []
  if (cert && cert.type === 'transaction') {
    const { data, error: rpcErr } = await supabase.rpc(
      'get_tc_immediate_inputs',
      { p_tc_id: id },
    )
    if (rpcErr) {
      console.error('[cert page] get_tc_immediate_inputs error:', rpcErr)
    } else if (Array.isArray(data)) {
      immediateInputs = data as ImmediateInput[]
    }
  }

  const voidedAt: string | null = cert?.voided_at ?? null
  const voidReason: string | null = cert?.void_reason ?? null

  return (
    <div className="p-6">
      <div className="mb-4 print:hidden">
        <Link
          href="/certificates"
          className="text-sm font-medium hover:underline"
          style={{ color: '#063359' }}
        >
          ← Back to certificates
        </Link>
      </div>

      {error && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error.message}
        </div>
      )}

      {!cert && !error && (
        <p className="text-sm text-gray-500">Certificate not found.</p>
      )}

      {cert ? (
        <>
          {isAdmin ? (
            <VoidCertButton certId={cert.id} alreadyVoided={!!voidedAt} />
          ) : null}

          <VoidedBanner voidedAt={voidedAt} reason={voidReason} />

          {cert.type === 'origin' && <OriginCertificate certificate={cert} />}
          {cert.type === 'transaction' && (
            <TransactionCertificate
              certificate={cert}
              immediateInputs={immediateInputs}
            />
          )}
          {cert.type !== 'origin' && cert.type !== 'transaction' && (
            <p className="text-sm text-gray-500">
              Detail view for type &quot;{cert.type}&quot; not yet implemented.
            </p>
          )}
        </>
      ) : null}
    </div>
  )
}