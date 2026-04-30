import Link from 'next/link'
import { requireUser } from '@/lib/auth/requireUser'
import { createClient } from '@/lib/supabase/server'

type SaleRow = {
  id: string
  code: string
  buyer_name: string
  volume: number
  volume_unit: string | null
  sale_date: string
  organizations: { name: string } | null
  inventory_lots: { code: string; product_name: string } | null
  certificates: { id: string }[] | null
}

export default async function SalesPage() {
  await requireUser()
  const supabase = await createClient()

  const { data: sales } = await supabase
    .from('sales')
    .select(
      'id, code, buyer_name, volume, volume_unit, sale_date, organizations:organization_id(name), inventory_lots:inventory_lot_id(code, product_name), certificates!related_transaction_id(id)',
    )
    .order('sale_date', { ascending: false })
    .returns<SaleRow[]>()

  const list = sales ?? []
  const totalVolume = list.reduce((s, x) => s + Number(x.volume), 0)
  const buyers = new Set(list.map((x) => x.buyer_name))

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">Sales</h2>
          <p className="mt-1 text-sm text-slate-600">
            Records of inventory sold. As an admin you see every organization.
          </p>
        </div>
        <Link
          href="/sales/new"
          className="rounded-md bg-[#063359] px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-[#0a4a7e]"
        >
          + New sale
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <div className="text-xs font-medium uppercase text-slate-500">Sales</div>
          <div className="mt-2 text-3xl font-semibold text-slate-900">{list.length}</div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <div className="text-xs font-medium uppercase text-slate-500">Volume sold</div>
          <div className="mt-2 text-3xl font-semibold text-slate-900">{totalVolume.toFixed(1)} t</div>
          <div className="mt-1 text-xs text-slate-500">Cumulative</div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <div className="text-xs font-medium uppercase text-slate-500">Unique buyers</div>
          <div className="mt-2 text-3xl font-semibold text-slate-900">{buyers.size}</div>
        </div>
      </div>

      {list.length === 0 ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
          No sales recorded yet.
        </div>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-6 py-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            All sales
          </div>
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-6 py-3">Code</th>
                <th className="px-6 py-3">Buyer</th>
                <th className="px-6 py-3">From</th>
                <th className="px-6 py-3">Organization</th>
                <th className="px-6 py-3">Sold</th>
                <th className="px-6 py-3">Volume</th>
                <th className="px-6 py-3">Certificate</th>
              </tr>
            </thead>
            <tbody>
              {list.map((s) => {
                const certId = s.certificates?.[0]?.id
                return (
                  <tr key={s.id} className="border-t border-slate-100">
                    <td className="px-6 py-3 font-mono text-xs">{s.code}</td>
                    <td className="px-6 py-3">{s.buyer_name}</td>
                    <td className="px-6 py-3">
                      <div className="font-mono text-xs">{s.inventory_lots?.code ?? '—'}</div>
                      <div className="text-xs text-slate-500">{s.inventory_lots?.product_name ?? ''}</div>
                    </td>
                    <td className="px-6 py-3">{s.organizations?.name ?? '—'}</td>
                    <td className="px-6 py-3 text-slate-600">
                      {new Date(s.sale_date).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </td>
                    <td className="px-6 py-3">
                      {Number(s.volume).toFixed(0)} {s.volume_unit ?? 'tonnes'}
                    </td>
                    <td className="px-6 py-3">
                      {certId ? (
                        <Link
                          href={`/certificates/${certId}`}
                          className="text-[#063359] hover:underline"
                        >
                          View certificate
                        </Link>
                      ) : (
                        '—'
                      )}
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