import {
  CertificateChrome,
  CertificateSection,
  CertificateField,
} from "./CertificateChrome";
import { PrintButton } from "./PrintButton";

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
  if (!d) return "—";
  return new Date(d).toLocaleDateString();
}

function formatQuantity(q: number | null, unit: string | null) {
  if (q == null) return "—";
  return (q.toLocaleString() + " " + (unit ?? "")).trim();
}

export function OriginCertificate({ certificate }: { certificate: OriginCertificateData }) {
  return (
    <>
      <div className="mb-4 flex justify-end print:hidden">
        <PrintButton />
      </div>
      <CertificateChrome
        title="Origin Certificate"
        certificateNumber={certificate.certificate_number}
        issuedAt={certificate.issued_at}
        description="This certificate confirms the verified origin of raw material entering the Land to Market chain of custody."
      >
        <CertificateSection title="Material">
          <CertificateField label="Commodity">{certificate.commodity_type ?? "—"}</CertificateField>
          <CertificateField label="Volume">{formatQuantity(certificate.volume, certificate.volume_unit)}</CertificateField>
          <CertificateField label="Purchase code">{certificate.purchase_code ?? "—"}</CertificateField>
          <CertificateField label="Purchase date">{formatDate(certificate.purchase_date)}</CertificateField>
          <CertificateField label="Clip year">{certificate.clip_year_snapshot != null ? String(certificate.clip_year_snapshot) : "—"}</CertificateField>
        </CertificateSection>

        <CertificateSection title="Origin landbase">
          <CertificateField label="Name">{certificate.landbase_name_snapshot ?? "—"}</CertificateField>
          <CertificateField label="Country">{certificate.country_snapshot ?? "—"}</CertificateField>
        </CertificateSection>

        <CertificateSection title="Eligibility snapshot at issue">
          <CertificateField label="Status">{certificate.eligibility_status_snapshot ?? "—"}</CertificateField>
          <CertificateField label="Report year used">{certificate.report_year_used != null ? String(certificate.report_year_used) : "—"}</CertificateField>
          <CertificateField label="Monitoring">{formatDate(certificate.monitoring_date_snapshot)}</CertificateField>
          <CertificateField label="Verification">{formatDate(certificate.verification_date_snapshot)}</CertificateField>
          <CertificateField label="Expires">{formatDate(certificate.expiration_date_snapshot)}</CertificateField>
          {certificate.eligibility_report_url_snapshot ? (
            <CertificateField label="Report"><a href={certificate.eligibility_report_url_snapshot} target="_blank" rel="noopener noreferrer" className="font-medium hover:underline" style={{ color: '#063359' }}>View eligibility report →</a></CertificateField>
          ) : null}
        </CertificateSection>
      </CertificateChrome>
    </>
  );
}