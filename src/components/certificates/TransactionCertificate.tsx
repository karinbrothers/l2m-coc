import Link from 'next/link';
import {
  CertificateChrome,
  CertificateSection,
  CertificateField,
} from './CertificateChrome';
import { PrintButton } from './PrintButton';

export type OriginLinkLite = {
  id: string;
  volume_attributed: number | null;
  origin_certificate: {
    id: string;
    certificate_number: string | null;
    purchase_code: string | null;
    landbase_name_snapshot: string | null;
    country_snapshot: string | null;
  } | null;
};

export type ProcessingBatchLite = {
  input_total_volume: number | null;
  output_volume: number | null;
  output_product: string | null;
  processing_method: string | null;
  processing_date: string | null;
  subcontractors: string | null;
};

export type TransactionCertificateData = {
  id: string;
  certificate_number: string | null;
  issued_at: string | null;
  sale_code: string | null;
  buyer_name_snapshot: string | null;
  seller_org_name_snapshot: string | null;
  sale_date_snapshot: string | null;
  volume: number | null;
  volume_unit: string | null;
  commodity_type: string | null;
  purchase_code: string | null;
  certificate_origin_links: OriginLinkLite[] | null;
  sale: {
    code: string | null;
    inventory_lot: {
      code: string | null;
      product_name: string | null;
      processing_batch: ProcessingBatchLite | null;
    } | null;
  } | null;
};

function formatDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

function formatVolume(v: number | null, unit: string | null) {
  if (v == null) return '—';
  return `${Number(v).toLocaleString('en-US', { maximumFractionDigits: 2 })} ${unit ?? ''}`.trim();
}

function yieldPct(input: number | null, output: number | null): string {
  if (input == null || output == null || Number(input) <= 0) return '—';
  return `${Math.round((Number(output) / Number(input)) * 100)}%`;
}

export function TransactionCertificate({
  certificate,
}: {
  certificate: TransactionCertificateData;
}) {
  const links = certificate.certificate_origin_links ?? [];
  const lot = certificate.sale?.inventory_lot ?? null;
  const batch = lot?.processing_batch ?? null;
  const traceCode = certificate.sale?.code ?? certificate.sale_code;

  return (
    <>
      <div className="mb-4 flex justify-end print:hidden">
        <PrintButton />
      </div>
      <CertificateChrome
        title="Transaction Certificate"
        certificateNumber={certificate.certificate_number}
        issuedAt={certificate.issued_at}
        description="This certificate documents a verified transaction within the Land to Market chain of custody. The volume below was drawn from the source materials listed at the bottom."
      >
        <CertificateSection title="Material">
          <CertificateField label="Commodity">
            {certificate.commodity_type ?? '—'}
          </CertificateField>
          <CertificateField label="Volume">
            {formatVolume(certificate.volume, certificate.volume_unit)}
          </CertificateField>
          <CertificateField label="Sale date">
            {formatDate(certificate.sale_date_snapshot)}
          </CertificateField>
          <CertificateField label="Sale code">
            {certificate.sale_code ?? '—'}
          </CertificateField>
        </CertificateSection>

        <CertificateSection title="Parties">
          <CertificateField label="Seller">
            {certificate.seller_org_name_snapshot ?? '—'}
          </CertificateField>
          <CertificateField label="Buyer">
            {certificate.buyer_name_snapshot ?? '—'}
          </CertificateField>
        </CertificateSection>

        {batch ? (
          <CertificateSection title="Processing">
            <CertificateField label="Output product">
              {batch.output_product ?? lot?.product_name ?? '—'}
            </CertificateField>
            <CertificateField label="Lot code">
              {lot?.code ?? '—'}
            </CertificateField>
            <CertificateField label="Processed">
              {formatDate(batch.processing_date)}
            </CertificateField>
            <CertificateField label="Method">
              {batch.processing_method ?? '—'}
            </CertificateField>
            <CertificateField label="Input volume">
              {formatVolume(batch.input_total_volume, certificate.volume_unit)}
            </CertificateField>
            <CertificateField label="Output volume">
              {formatVolume(batch.output_volume, certificate.volume_unit)}
            </CertificateField>
            <CertificateField label="Yield">
              {yieldPct(batch.input_total_volume, batch.output_volume)}
            </CertificateField>
            <CertificateField label="Processed by">
              {batch.subcontractors ?? '—'}
            </CertificateField>
          </CertificateSection>
        ) : null}

        <CertificateSection title="Source materials">
          <div className="col-span-2 space-y-2">
            {links.length === 0 ? (
              <div className="text-xs text-slate-500 italic">
                No linked origin certificates.
              </div>
            ) : (
              links.map((link) => {
                const oc = link.origin_certificate;
                if (!oc) return null;
                return (
                  <Link
                    key={link.id}
                    href={`/certificates/${oc.id}`}
                    className="block rounded border border-slate-200 px-4 py-3 hover:border-[#063359] hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-baseline justify-between gap-4">
                      <div className="font-mono text-xs text-[#063359]">
                        {oc.certificate_number ?? '—'}
                      </div>
                      <div className="text-xs text-slate-500">
                        {formatVolume(link.volume_attributed, certificate.volume_unit)}
                      </div>
                    </div>
                    <div className="text-sm text-slate-800 mt-1">
                      {oc.landbase_name_snapshot ?? '—'}
                      {oc.country_snapshot ? (
                        <span className="text-slate-500"> · {oc.country_snapshot}</span>
                      ) : null}
                    </div>
                    {oc.purchase_code && (
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        Source purchase: <span className="font-mono">{oc.purchase_code}</span>
                      </div>
                    )}
                  </Link>
                );
              })
            )}
          </div>
        </CertificateSection>

        {traceCode ? (
          <div className="col-span-2 mt-2 border-t border-slate-100 pt-4 print:hidden">
            <Link
              href={`/trace/${traceCode}`}
              className="inline-flex items-center gap-2 text-sm font-medium hover:underline"
              style={{ color: '#063359' }}
            >
              View full provenance trace
              <svg
                className="h-3.5 w-3.5"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M5.22 14.78a.75.75 0 0 0 1.06 0l7.22-7.22v5.69a.75.75 0 0 0 1.5 0v-7.5a.75.75 0 0 0-.75-.75h-7.5a.75.75 0 0 0 0 1.5h5.69l-7.22 7.22a.75.75 0 0 0 0 1.06Z"
                  clipRule="evenodd"
                />
              </svg>
            </Link>
          </div>
        ) : null}
      </CertificateChrome>
    </>
  );
}