import Link from 'next/link';
import {
  CertificateChrome,
  CertificateSection,
  CertificateField,
} from './CertificateChrome';

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

export function TransactionCertificate({
  certificate,
}: {
  certificate: TransactionCertificateData;
}) {
  const links = certificate.certificate_origin_links ?? [];

  return (
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
    </CertificateChrome>
  );
}