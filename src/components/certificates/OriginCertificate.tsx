// src/components/certificates/OriginCertificate.tsx
//
// Renders the L2M Digital Origin Certificate in the official
// industry format — numbered boxes, formal declaration, signature.

import {
  CertificateChrome,
  Box,
  InputTable,
} from './CertificateChrome';
import { PrintButton } from './PrintButton';

type OrgLite = {
  name: string | null;
  address: string | null;
} | null;

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
  /** Eligibility report ID (if you want to use a non-URL ID
   *  in Box 3 instead of the URL). Optional — falls back to
   *  the report URL if present. */
  eligibility_report_id_snapshot?: string | null;
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

// Land to Market verification body — the cert always lists L2M
// as the verifier, with Savory Institute as the issuing body.
const VERIFICATION_BODY = {
  name: 'Land to Market',
  address: 'A program of the Savory Institute\n3550 Frontier Avenue, Unit B-2\nBoulder, CO 80301, USA',
};

export function OriginCertificate({
  certificate,
  buyerOrg,
}: {
  certificate: OriginCertificateData;
  /** The first-stage processor / buyer of raw material — the
   *  organisation that recorded the purchase. Pulled at page
   *  level via a join on certificates.organization_id. */
  buyerOrg?: OrgLite;
}) {
  const reportRef =
    certificate.eligibility_report_id_snapshot ??
    certificate.eligibility_report_url_snapshot ??
    '—';

  return (
    <>
      <div className="mb-4 flex justify-end print:hidden">
        <PrintButton />
      </div>
      <CertificateChrome
        documentType="origin"
        certificateId={certificate.certificate_number}
        issuedAt={certificate.issued_at}
      >
        {/* Row 1: Boxes 1 + 2 (50/50) */}
        <Box
          number={1}
          title="Verification Body"
          subtitle="(Name and Address)"
          span={6}
          minHeight="120px"
        >
          <p className="font-medium">{VERIFICATION_BODY.name}</p>
          <p className="text-slate-700 whitespace-pre-line text-xs mt-1">
            {VERIFICATION_BODY.address}
          </p>
        </Box>

        <Box
          number={2}
          title="First Stage Processor / Buyer of Raw Material"
          subtitle="(Name and Address)"
          span={6}
          minHeight="120px"
        >
          <p className="font-medium">{buyerOrg?.name ?? '—'}</p>
          {buyerOrg?.address ? (
            <p className="text-slate-700 whitespace-pre-line text-xs mt-1">
              {buyerOrg.address}
            </p>
          ) : null}
        </Box>

        {/* Row 2: Box 3 full width with input table */}
        <Box
          number={3}
          title="Input Information"
          span={12}
          minHeight="auto"
        >
          <InputTable
            headers={[
              'Landbase Name',
              'Landbase Eligibility Report',
              'Purchase Date',
              'Amount and Units',
            ]}
            rows={[
              [
                certificate.landbase_name_snapshot ?? '—',
                reportRef && reportRef !== '—' ? (
                  reportRef.startsWith('http') ? (
                    <a
                      href={reportRef}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline"
                      style={{ color: '#063359' }}
                    >
                      View report
                    </a>
                  ) : (
                    <span className="font-mono text-xs">{reportRef}</span>
                  )
                ) : (
                  '—'
                ),
                formatDate(certificate.purchase_date),
                formatQuantity(certificate.volume, certificate.volume_unit),
              ],
            ]}
          />
        </Box>

        {/* Row 3: Boxes 4 + 5 + 6 (4/4/4) */}
        <Box
          number={4}
          title="Verified Raw Material"
          subtitle="(Name/Description)"
          span={4}
        >
          <p className="capitalize">
            {certificate.commodity_type ?? '—'}
          </p>
          {certificate.clip_year_snapshot ? (
            <p className="text-xs text-slate-700 mt-1">
              Clip year {certificate.clip_year_snapshot}
            </p>
          ) : null}
        </Box>

        <Box
          number={5}
          title="Total Verified Raw Material Weight"
          subtitle="(Amount and Units)"
          span={4}
        >
          <p className="font-medium">
            {formatQuantity(certificate.volume, certificate.volume_unit)}
          </p>
        </Box>

        <Box number={6} title="Country of Origin" span={4}>
          <p>{certificate.country_snapshot ?? '—'}</p>
        </Box>
      </CertificateChrome>
    </>
  );
}