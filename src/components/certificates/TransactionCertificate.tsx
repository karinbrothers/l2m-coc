import {
  CertificateChrome,
  CertificateSection,
  CertificateField,
} from "./CertificateChrome";

type TransactionCertificateData = {
  id: string;
  certificate_number: string | null;
  issued_at: string | null;
  certificate_type: string | null;
  sale_transaction: {
    id: string;
    material_type: string | null;
    quantity: number | null;
    unit: string | null;
    transaction_date: string | null;
    seller_organization: { name: string | null } | null;
    buyer_organization: { name: string | null } | null;
  } | null;
};

function formatDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString();
}

function formatQuantity(q: number | null, unit: string | null) {
  if (q == null) return "—";
  return (q.toLocaleString() + " " + (unit ?? "")).trim();
}

export function TransactionCertificate({ certificate }: { certificate: TransactionCertificateData }) {
  const tx = certificate.sale_transaction;

  return (
    <CertificateChrome
      title="Transaction Certificate"
      certificateNumber={certificate.certificate_number}
      issuedAt={certificate.issued_at}
      description="This certificate documents a verified transaction within the Land to Market chain of custody."
    >
      <CertificateSection title="Material">
        <CertificateField label="Type">{tx?.material_type ?? "—"}</CertificateField>
        <CertificateField label="Quantity">{formatQuantity(tx?.quantity ?? null, tx?.unit ?? null)}</CertificateField>
        <CertificateField label="Transaction date">{formatDate(tx?.transaction_date ?? null)}</CertificateField>
      </CertificateSection>

      <CertificateSection title="Parties">
        <CertificateField label="Seller">{tx?.seller_organization?.name ?? "—"}</CertificateField>
        <CertificateField label="Buyer">{tx?.buyer_organization?.name ?? "—"}</CertificateField>
      </CertificateSection>
    </CertificateChrome>
  );
}
