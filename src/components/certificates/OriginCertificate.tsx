import {
  CertificateChrome,
  CertificateSection,
  CertificateField,
} from './CertificateChrome';
import { PrintButton } from './PrintButton';

type OriginCertificateData = {
  id: string;
  certificate_number: string | null;
  issued_at: string | null;
  landbase_name_snapshot: string | null;
  country_snapshot: string | null;
  eligibility_status_snapshot: string | null;
  expiration_date_snapshot: string | null;
  monitoring_date_snapshot: string | null;
  verification_date_snapshot: string | null;
  eligibility_report_url_snapshot: string | null;
  purchase_code: string | null;
  volume: number | null;
  volume_unit: string | null;
  commodity_type: string | null;
  purchase_date: string | null;
  clip_year_snapshot: number | null;
  report_year_used: number | null;
};

function formatDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

function formatQuantity(q: number | null, unit: string | null) {
  if (q == null) return '—';
  return (q.toLocaleString() + ' ' + (unit ?? '')).trim();
}

export function OriginCertificate({
  certificate,
}: {
  certificate: OriginCertificateData;
}) {
  // Status strip surfaces the headline verification fact: this
  // certificate represents wool from a verified landbase, with
  // eligibility valid through the snapshot expiration date.
  const status = {
    label: 'L2M Verified',
    detail: certificate.expiration_date_snapshot
      ? `Eligibility valid through ${formatDate(certificate.expiration_date_snapshot)}`
      : 'Eligibility verified at issue',
  };

  return (
    <>
      <div className="mb-4 flex justify-end print:hidden">
        <PrintButton />
      </div>
      <CertificateChrome
        title="Origin Certificate"
        certificateNumber={certificate.certificate_number}
        issuedAt={certificate.issued_at}
        status={status}
        description="This certificate confirms the verified origin of regenerative material entering the Land to Market chain of custody."
      >
        <CertificateSection title="Material">
          <CertificateField label="Commodity">
            {certificate.commodity_type ?? '—'}
          </CertificateField>
          <CertificateField label="Volume">
            {formatQuantity(certificate.volume, certificate.volume_unit)}
          </CertificateField>
          <CertificateField label="Clip year">
            {certificate.clip_year_snapshot != null
              ? String(certificate.clip_year_snapshot)
              : '—'}
          </CertificateField>
          <CertificateField label="Purchased">
            {formatDate(certificate.purchase_date)}
          </CertificateField>
          <CertificateField label="Purchase reference" span={2}>
            <span className="font-mono text-xs">
              {certificate.purchase_code ?? '—'}
            </span>
          </CertificateField>
        </CertificateSection>

        <CertificateSection title="Origin landbase">
          <CertificateField label="Name" span={2}>
            <span className="text-base font-semibold">
              {certificate.landbase_name_snapshot ?? '—'}
            </span>
            {certificate.country_snapshot ? (
              <span className="text-sm font-normal text-slate-500 ml-2">
                · {certificate.country_snapshot}
              </span>
            ) : null}
          </CertificateField>
        </CertificateSection>

        <CertificateSection title="Eligibility snapshot at issue">
          <CertificateField label="Monitored">
            {formatDate(certificate.monitoring_date_snapshot)}
          </CertificateField>
          <CertificateField label="Verified">
            {formatDate(certificate.verification_date_snapshot)}
          </CertificateField>
          <CertificateField label="Report year">
            {certificate.report_year_used != null
              ? String(certificate.report_year_used)
              : '—'}
          </CertificateField>
          <CertificateField label="Status">
            <span className="capitalize">
              {certificate.eligibility_status_snapshot ?? '—'}
            </span>
          </CertificateField>
          {certificate.eligibility_report_url_snapshot ? (
            <CertificateField label="Eligibility report" span={2}>
              <a
                href={certificate.eligibility_report_url_snapshot}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium hover:underline"
                style={{ color: '#063359' }}
              >
                View full eligibility report →
              </a>
            </CertificateField>
          ) : null}
        </CertificateSection>
      </CertificateChrome>
    </>
  );
}