import Link from 'next/link'
import { requireUser } from '@/lib/auth/requireUser'
import { createClient } from '@/lib/supabase/server'

type PageProps = {
  searchParams: Promise<{ created?: string }>
}

type LandbaseLite = { id: string; name: string; country: string | null }

type PurchaseLite = {
  id: string
  code: string
  landbases: LandbaseLite | null
}

type OrgLite = { id: string; name: string }

type SaleRow = {
  id: string
  code: string
  organization_id: string
  source_purchase_id: string
  buyer_name: string
  volume: number
  volume_unit: string
  sale_date: string | null
  notes: string | null
  created_at: string
  raw_material_purchases: PurchaseLite | null
  organizations: OrgLite | null
}

function fmtNumber(n: number, digits = 2): string {
  return n.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  })
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export default async function SalesPage({ searchParams }: PageProps) {
  const user = await requireUser()
  const { created } = await searchParams
  const supabase = await createClient()

  const { data: rows, error } = await supabase
    .from('sales')
    .select(
      `
      id, code, organization_id, source_purchase_id,
      buyer_name, volume, volume_unit, sale_date, notes, created_at,
      raw_material_purchases:source_purchase_id (
        id, code,
        landbases:landbase_id ( id, name, country )
      ),
      organizations:organization_id ( id, name )
      `,
    )
    .order('sale_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .returns<SaleRow[]>()

  if (error) console.error('[SalesPage]', error.message)

  const sales = rows ?? []
  const isAdmin = user.role === 'admin'
  const totalVolume = sales.reduce((sum, s) => sum + Number(s.volume ?? 0), 0)
  const buyerSet = new Set(sales.map((s) => s.buyer_name.toLowerCase()))

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">Sales</h2>
          <p className="mt-1 text-sm text-slate-600">
            Records of wool sold from eligible raw purchases.{' '}
            {isAdmin
              ? 'As an admin you see every organization.'
              : 'You see sales by your organization.'}
          </p>
        </div>
        <Link
          href="/sales/new"
          className="rounded-md bg-[#063359] px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-[#0a4a7e] focus:outline-none focus:ring-2 focus:ring-[#063359] focus:ring-offset-2"
        >
          + New sale
        </Link>
      </div>

      {created ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          Sale <strong>{created}</strong> recorded.
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <SummaryCard label="Sales" value={String(sales.length)} />
        <SummaryCard
          label="Volume sold"
          value={`${fmtNumber(totalVolume)} t`}
          hint="Cumulative"
        />
        <SummaryCard label="Unique buyers" value={String(buyerSet.size)} />
      </div>

      <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-6 py-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
            All sales
          </h3>
        </div>

        {sales.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <p className="text-sm text-slate-500">No sales yet.</p>
            <Link
              href="/sales/new"
              className="mt-4 inline-block rounded-md bg-[#063359] px-4 py-2 text-sm font-medium text-white hover:bg-[#0a4a7e]"
            >
              Record your first sale
            </Link>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-6 py-2 font-medium">Code</th>
                <th className="px-6 py-2 font-medium">Buyer</th>
                <th className="px-6 py-2 font-medium">From</th>
                {isAdmin ? (
                  <th className="px-6 py-2 font-medium">Organization</th>
                ) : null}
                <th className="px-6 py-2 font-medium">Sold</th>
                <th className="px-6 py-2 font-medium text-right">Volume</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sales.map((s) => (
                <tr key={s.id}>
                  <td className="px-6 py-3 font-mono text-xs text-slate-900">
                    {s.code}
                  </td>
                  <td className="px-6 py-3 text-slate-800">{s.buyer_name}</td>
                  <td className="px-6 py-3 text-slate-700">
                    <div className="font-mono text-xs">
                      {s.raw_material_purchases?.code ?? '—'}
                    </div>
                    {s.raw_material_purchases?.landbases?.name ? (
                      <div className="text-xs text-slate-500">
                        {s.raw_material_purchases.landbases.name}
                      </div>
                    ) : null}
                  </td>
                  {isAdmin ? (
                    <td className="px-6 py-3 text-slate-700">
                      {s.organizations?.name ?? '—'}
                    </td>
                  ) : null}
                  <td className="px-6 py-3 text-slate-500">
                    {fmtDate(s.sale_date)}
                  </td>
                  <td className="px-6 py-3 text-right text-slate-900">
                    {fmtNumber(Number(s.volume))} {s.volume_unit}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function SummaryCard({
  label,
  value,
  hint,
}: {
  label: string
  value: string
  hint?: string
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold text-slate-900">{value}</div>
      {hint ? <div className="mt-1 text-xs text-slate-500">{hint}</div> : null}
    </div>
  )
}
