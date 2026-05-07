// src/app/certificates/[id]/page.tsx
//
// Loads a certificate plus the joined data each cert type needs:
// - For Origin certs: the issuing organisation (the first-stage
//   processor / buyer of raw material) for Box 2.
// - For Transaction certs: contributing OCs and the sale chain.

import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { OriginCertificate } from '@/components/certificates/OriginCertificate';
import { TransactionCertificate } from '@/components/certificates/TransactionCertificate';

export const dynamic = 'force-dynamic';

type OrgLite = {
  name: string | null;
  address: string | null;
};

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
      issuing_org:organization_id (name, address),
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

  // Pull out the issuing org cleanly so the cert components don't
  // have to know about the join shape.
  const issuingOrg = (cert?.issuing_org ?? null) as OrgLite | null;

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
        <OriginCertificate certificate={cert} buyerOrg={issuingOrg} />
      )}
      {cert && cert.type === 'transaction' && (
        <TransactionCertificate certificate={cert} sellerOrg={issuingOrg} />
      )}
      {cert && cert.type !== 'origin' && cert.type !== 'transaction' && (
        <p className="text-sm text-gray-500">
          Detail view for type &quot;{cert.type}&quot; not yet implemented.
        </p>
      )}
    </div>
  );
}