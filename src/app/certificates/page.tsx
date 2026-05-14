import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

type CertRow = {
  id: string
  certificate_number: string | null
  type: string
  issued_at: string | null
  voided_at: string | null
  purchase_code: string | null
  sale_code: string | null
  landbase_name_snapshot: string | null
  seller_org_name_snapshot: string | null
  buyer_name_snapshot: string | null
  buyer_org_name_snapshot: string | null
}

export default async function CertificatesPage() {
  const supabase = await createClient()

  // Use snapshot fields stored on the cert itself — no joins to
  // organizations or sales, so chain participants who can SEE
  // the cert (per user_can_see_cert RLS) also get the org names
  // alongside, without depending on organizations RLS.
  const { data, error } = await supabase
    .from('certificates')
    .select(
      `
        id,
        certificate_number,
        type,
        issued_at,
        voided_at,
        purchase_code,
        sale_code,
        landbase_name_snapshot,
        seller_org_name_snapshot,
        buyer_name_snapshot,
        buyer_org_name_snapshot
      `,
    )
    .order('issued_at', { ascending: false })

  const certs = (data ?? []) as unknown as CertRow[]

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-[#063359]">Certificates</h1>
      </div>

      {error && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error.message}
        </div>
      )}

      {certs.length === 0 ? (
        <div className="rounded border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">
          No certificates yet. Origin certificates are issued when unprocessed
          material is purchased. Transaction certificates are issued when a
          sale is accepted.
        </div>
      ) : (
        <div className="overflow-hidden rounded border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-2">Certificate #</th>
                <th className="px-4 py-2">Type</th>
                <th className="px-4 py-2">Issued</th>
                <th className="px-4 py-2">Reference</th>
                <th className="px-4 py-2">Counterparty</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {certs.map((c) => {
                const isOrigin = c.type === 'origin'
                const reference = isOrigin
                  ? c.purchase_code ?? '—'
                  : c.sale_code ?? '—'
                const counterparty = isOrigin
                  ? c.buyer_org_name_snapshot ??
                    c.landbase_name_snapshot ??
                    '—'
                  : `${c.seller_org_name_snapshot ?? '?'} → ${
                      c.buyer_name_snapshot ?? '?'
                    }`

                return (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 font-mono text-xs">
                      <span className="inline-flex items-center gap-2">
                        {c.certificate_number ?? c.id.slice(0, 8)}
                        {c.voided_at ? (
                          <span className="inline-flex items-center rounded-full bg-red-100 text-red-800 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                            Voided
                          </span>
                        ) : null}
                      </span>
                    </td>
                    <td className="px-4 py-2 capitalize">{c.type}</td>
                    <td className="px-4 py-2 text-gray-600">
                      {c.issued_at
                        ? new Date(c.issued_at).toLocaleDateString()
                        : '—'}
                    </td>
                    <td className="px-4 py-2 text-gray-600">{reference}</td>
                    <td className="px-4 py-2 text-gray-600">{counterparty}</td>
                    <td className="px-4 py-2 text-right">
                      <Link
                        href={`/certificates/${c.id}`}
                        className="text-sm font-medium text-[#063359] hover:underline"
                      >
                        View →
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}