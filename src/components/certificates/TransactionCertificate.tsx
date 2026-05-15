// src/components/certificates/TransactionCertificate.tsx
//
// Renders the L2M Digital Transaction Certificate in the official
// industry format — numbered boxes 1–7 plus the auto-rendered
// declaration / signature / seal in the chrome.
//
// Box 5 (Input Information) lists the IMMEDIATE upstream certs
// — the OC for direct landbase purchases, the TC for received
// purchases — passed in as the immediateInputs prop.

import Link from 'next/link';
import {
  CertificateChrome,
  Box,
  InputTable,
} from './CertificateChrome';
import { PrintButton } from './PrintButton';

export type ImmediateInput = {
  type: 'origin' | 'transaction';
  cert_id: string | null;
  cert_number: string | null;
  source_label: string | null;
  volume_used: number | null;
  volume_unit: string | null;
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
  sale: {
    code: string | null;
    shipping_number: string | null;
    country_of_dispatch: string | null;
    attested_at: string | null;
    attested_by_email: string | null;
    attested_by_name: string | null;
    attested_by_org_name: string | null;
    acceptance_attested_at: string | null;
    acceptance_attested_by_email: string | null;
    acceptance_attested_by_name: string | null;
    acceptance_attested_by_org_name: string | null;
    inventory_lot: {
      code: string | null;
      product_name: string | null;
      output_micron_diameter: number | null;
      processing_batch: ProcessingBatchLite | null;
    } | null;
  } | null;
};

function formatAttestedTime(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

function attestorLabel(
  name: string | null,
  org: string | null,
  email: string | null,
): string {
  if (name && org) return `${name}, ${org}`;
  if (name) return name;
  if (org) return org;
  return email ?? 'unknown user';
}

type OrgLite = {
  name: string | null;
  address: string | null;
} | null;

const VERIFICATION_BODY = {
  name: 'Land to Market',
  address: '885 Arapahoe Ave\nBoulder, CO 80302\nUnited States',
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
  return `${Number(v).toLocaleString('en-US', {
    maximumFractionDigits: 2,
  })} ${unit ?? ''}`.trim();
}

export function TransactionCertificate({
  certificate,
  sellerOrg,
  immediateInputs = [],
}: {
  certificate: TransactionCertificateData;
  sellerOrg?: OrgLite;
  immediateInputs?: ImmediateInput[];
}) {
  const lot = certificate.sale?.inventory_lot ?? null;
  const batch = lot?.processing_batch ?? null;
  const traceCode = certificate.sale?.code ?? certificate.sale_code;
  const shippingNumber = certificate.sale?.shipping_number ?? null;
  const countryOfDispatch = certificate.sale?.country_of_dispatch ?? null;

  const sale = certificate.sale;
  const sellerAtt = sale?.attested_at
    ? `Attested by ${attestorLabel(
        sale.attested_by_name,
        sale.attested_by_org_name,
        sale.attested_by_email,
      )} on ${formatAttestedTime(sale.attested_at)}.`
    : null;
  const buyerAtt = sale?.acceptance_attested_at
    ? `Receipt attested by ${attestorLabel(
        sale.acceptance_attested_by_name,
        sale.acceptance_attested_by_org_name,
        sale.acceptance_attested_by_email,
      )} on ${formatAttestedTime(sale.acceptance_attested_at)}.`
    : null;
  const attestationFooter =
    sellerAtt || buyerAtt ? (
      <div className="space-y-0.5">
        {sellerAtt ? <div>{sellerAtt}</div> : null}
        {buyerAtt ? <div>{buyerAtt}</div> : null}
      </div>
    ) : null;

  return (
    <>
      <div className="mb-4 flex items-center justify-end gap-3 print:hidden">
        {traceCode ? (
          <Link
            href={`/trace/${traceCode}`}
            className="text-sm font-medium hover:underline"
            style={{ color: '#063359' }}
          >
            View supply chain traceability →
          </Link>
        ) : null}
        <PrintButton />
      </div>

      <CertificateChrome
        documentType="transaction"
        certificateId={certificate.certificate_number}
        issuedAt={certificate.issued_at}
        attestationFooter={attestationFooter}
      >
        {/* Row 1: Boxes 1 + 2 */}
        <Box
          number={1}
          title="Verification Body"
          subtitle="(Name and Address)"
          span={6}
          minHeight="120px"
        >
          <p className="font-medium">{VERIFICATION_BODY.name}</p>
          <p className="text-slate-700 whitespace-pre-line text-xs print:text-[9px] mt-1">
            {VERIFICATION_BODY.address}
          </p>
        </Box>

        <Box
          number={2}
          title="Seller of Verified Products"
          subtitle="(Name and Address)"
          span={6}
          minHeight="120px"
        >
          <p className="font-medium">
            {sellerOrg?.name ?? certificate.seller_org_name_snapshot ?? '—'}
          </p>
          {sellerOrg?.address ? (
            <p className="text-slate-700 whitespace-pre-line text-xs print:text-[9px] mt-1">
              {sellerOrg.address}
            </p>
          ) : null}
        </Box>

        {/* Row 2: Boxes 3 + 4 */}
        <Box
          number={3}
          title="Buyer of Verified Products"
          subtitle="(Name and Address of Ultimate Consignee)"
          span={6}
          minHeight="120px"
        >
          <p className="font-medium">
            {certificate.buyer_name_snapshot ?? '—'}
          </p>
        </Box>

        <Box
          number={4}
          title="Country of Dispatch"
          span={6}
          minHeight="120px"
        >
          <p>{countryOfDispatch ?? '—'}</p>
        </Box>

        {/* Row 3: Box 5 — Input information (immediate upstream) */}
        <Box
          number={5}
          title="Input Information"
          subtitle="(Input Digital Origin Certificate ID or Digital Transaction Certificate ID)"
          span={12}
          minHeight="auto"
        >
          {immediateInputs.length === 0 ? (
            <p className="text-slate-500 italic">
              No linked input certificates.
            </p>
          ) : (
            <InputTable
              headers={[
                'Certificate ID',
                'Type',
                'Source',
                'Volume Used',
              ]}
              rows={immediateInputs.map((input, i) => [
                input.cert_id ? (
                  <Link
                    key={input.cert_id}
                    href={`/certificates/${input.cert_id}`}
                    className="font-mono text-xs print:text-[9px] underline"
                    style={{ color: '#063359' }}
                  >
                    {input.cert_number ?? '—'}
                  </Link>
                ) : (
                  <span key={`missing-${i}`} className="text-slate-400">
                    —
                  </span>
                ),
                input.type === 'origin' ? 'Origin' : 'Transaction',
                input.source_label ?? '—',
                formatVolume(input.volume_used, input.volume_unit),
              ])}
            />
          )}
        </Box>

        {/* Row 4: Boxes 6 + 7 (8/4 split per template) */}
        <Box
          number={6}
          title="Product and Shipping Information"
          subtitle="(Product Name, Sale Date, Order/Shipping Number)"
          span={8}
          minHeight="120px"
        >
          <dl className="space-y-1.5 print:space-y-1">
            <div>
              <dt className="inline text-xs print:text-[9px] text-slate-700">
                Product name:{' '}
              </dt>
              <dd className="inline font-medium capitalize">
                {batch?.output_product ??
                  lot?.product_name ??
                  certificate.commodity_type ??
                  '—'}
              </dd>
            </div>
            <div>
              <dt className="inline text-xs print:text-[9px] text-slate-700">
                Sale date:{' '}
              </dt>
              <dd className="inline">
                {formatDate(certificate.sale_date_snapshot)}
              </dd>
            </div>
            <div>
              <dt className="inline text-xs print:text-[9px] text-slate-700">
                Order/Shipping Number:{' '}
              </dt>
              <dd className="inline font-mono text-xs print:text-[9px]">
                {shippingNumber ?? '—'}
              </dd>
            </div>
            {lot?.output_micron_diameter != null ? (
              <div>
                <dt className="inline text-xs print:text-[9px] text-slate-700">
                  Microns:{' '}
                </dt>
                <dd className="inline">
                  {Number(lot.output_micron_diameter)} µm
                </dd>
              </div>
            ) : null}
            {lot?.code ? (
              <div>
                <dt className="inline text-xs print:text-[9px] text-slate-700">
                  Lot:{' '}
                </dt>
                <dd className="inline font-mono text-xs print:text-[9px]">
                  {lot.code}
                </dd>
              </div>
            ) : null}
          </dl>
        </Box>

        <Box
          number={7}
          title="Verified Product Weight"
          subtitle="(Amount and Units)"
          span={4}
          minHeight="120px"
        >
          <p className="font-medium text-base print:text-[12px]">
            {formatVolume(certificate.volume, certificate.volume_unit)}
          </p>
        </Box>
      </CertificateChrome>
    </>
  );
}