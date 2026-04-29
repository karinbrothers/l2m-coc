import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { OriginCertificate } from "@/components/certificates/OriginCertificate";
import { TransactionCertificate } from "@/components/certificates/TransactionCertificate";

export const dynamic = "force-dynamic";

export default async function CertificateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: cert, error } = await supabase
    .from("certificates")
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
      )
      `,
    )
    .eq("id", id)
    .maybeSingle();

  return (
    <div className="p-6">
      <div className="mb-4">
        <Link href="/certificates" className="text-sm font-medium hover:underline" style={{ color: '#063359' }}>← Back to certificates</Link>
      </div>

      {error && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error.message}
        </div>
      )}

      {!cert && !error && (
        <p className="text-sm text-gray-500">Certificate not found.</p>
      )}

      {cert && cert.type === "origin" && <OriginCertificate certificate={cert} />}
      {cert && cert.type === "transaction" && <TransactionCertificate certificate={cert} />}
      {cert && cert.type !== "origin" && cert.type !== "transaction" && (
        <p className="text-sm text-gray-500">Detail view for type &quot;{cert.type}&quot; not yet implemented.</p>
      )}
    </div>
  );
}