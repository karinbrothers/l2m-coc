// src/app/certificates/[id]/page.tsx
//
// Loads a certificate plus the joined data each cert type needs.
// For TCs we additionally call get_tc_immediate_inputs to render
// "Input Information" as the immediate upstream cert(s) — not
// the landbase OCs at the bottom of the chain.

import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { OriginCertificate } from '@/components/certificates/OriginCertificate';
import {
  TransactionCertificate,
  type ImmediateInput,
} from '@/components/certificates/TransactionCertificate';

export const dynamic = 'force-dynamic';

export default async function CertificateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

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
      sale:sales!related_transaction_id (
        code,
        shipping_number,
        country_of_dispatch,
        inventory_lot:inventory_lot_id (
          code,
          product_name,
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
    .maybeSingle();

  // For TCs, also fetch the IMMEDIATE upstream inputs (the cert
  // before this one in the chain). For an FSP's TC, those are
  // landbase OCs; for any later-stage TC, they're the upstream
  // partner's TCs.
  let immediateInputs: ImmediateInput[] = [];
  if (cert && cert.type === 'transaction') {
    const { data, error: rpcErr } = await supabase.rpc(
      'get_tc_immediate_inputs',
      { p_tc_id: id },
    );
    if (rpcErr) {
      console.error('[cert page] get_tc_immediate_inputs error:', rpcErr);
    } else if (Array.isArray(data)) {
      immediateInputs = data as ImmediateInput[];
    }
  }

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

      {cert && cert.type === 'origin' && (
        <OriginCertificate certificate={cert} />
      )}
      {cert && cert.type === 'transaction' && (
        <TransactionCertificate
          certificate={cert}
          immediateInputs={immediateInputs}
        />
      )}
      {cert && cert.type !== 'origin' && cert.type !== 'transaction' && (
        <p className="text-sm text-gray-500">
          Detail view for type &quot;{cert.type}&quot; not yet implemented.
        </p>
      )}
    </div>
  );
}