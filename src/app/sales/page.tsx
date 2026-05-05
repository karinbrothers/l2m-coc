import Link from 'next/link'
import { requireUser } from '@/lib/auth/requireUser'
import { createClient } from '@/lib/supabase/server'

type SaleRow = {
  id: string
  code: string
  buyer_name: string
  buyer_org_id: string | null
  volume: number
  volume_unit: string | null
  sale_date: string
  status: 'pending' | 'accepted' | 'rejected' | 'expired'
  organizations: { name: string } | null
  buyer_org: { name: string } | null
  inventory_lots: { code: string; product_name: string } | null
  certificates: { id: string }[] | null
}

function statusBadge(status: SaleRow['status']) {
  const map: Record<SaleRow['status'], { label: string; className: string }> = {
    pending: { label: 'Pending', className: 'bg-amber-100 text-amber-800' },
    accepted: { label: 'Accepted', className: 'bg-emerald-100 text-emerald-800' },
    rejected: { label: 'Rejected', className: 'bg-red-100 text-red-800' },
    expired: { label: 'Expired', className: 'bg-slate-100 text-slate-700' },
  }
  const s = map[status] ?? map.accepted
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${s.className}`}>
      {s.label}
    </span>
  )
}

export default async function SalesPage() {
  const user = await requireUser()
  const supabase = await createClient()

  const { data: sales } = await supabase
  .from('sales')
  .select(
    'id, code, buyer_name, buyer_org_id, volume, volume_unit, sale_date, status, organizations:organization_id(name), buyer_org:buyer_org_id(name), inventory_lots:inventory_lot_id(code, product_name), certificates!related_transaction_id(id)',
  )
  .eq('organization_id', user.organization_id)
  .order('sale_date', { ascending: false })
  .returns<SaleRow[]>()

  const list = sales ?? []
  const totalVolume = list
    .filter((x) => x.status !== 'rejected' && x.status !== 'expired')
    .reduce((s, x) => s + Number(x.volume), 0)
  const buyers = new Set(list.map((x) => x.buyer_name))
  const pendingCount = list.filter((x) => x.status === 'pending').length

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">Sales</h2>
          <p className="mt-1 text-sm text-slate-600">
            Sales your organization has sent out. Incoming sales show up in your inbox.
          </p>
        </div>
        <Link
          href="/sales/new"
          className="rounded-md bg-[#063359] px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-[#0a4a7e]"
        >
          + New sale
        </Link>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <div className="text-xs font-medium uppercase text-slate-500">Sales</div>
          <div className="mt-2 text-3xl font-semibold text-slate-900">{list.length}</div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <div className="text-xs font-medium uppercase text-slate-500">Pending</div>
          <div className="mt-2 text-3xl font-semibold text-slate-900">{pendingCount}</div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <div className="text-xs font-medium uppercase text-slate-500">Volume sold</div>
          <div className="mt-2 text-3xl font-semibold text-slate-900">{totalVolume.toFixed(1)} t</div>
          <div className="mt-1 text-xs text-slate-500">Excludes rejected / expired</div>
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
                <th className="px-6 py-3">Status</th>
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
                const buyerLabel = s.buyer_org?.name
                  ? `${s.buyer_org.name} (platform)`
                  : `${s.buyer_name} (external)`
                return (
                  <tr key={s.id} className="border-t border-slate-100">
                    <td className="px-6 py-3 font-mono text-xs">{s.code}</td>
                    <td className="px-6 py-3">{buyerLabel}</td>
                    <td className="px-6 py-3">{statusBadge(s.status)}</td>
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
                        <span className="text-slate-400">—</span>
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