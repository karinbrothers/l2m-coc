import Link from 'next/link'
import { requireUser } from '@/lib/auth/requireUser'
import { createClient } from '@/lib/supabase/server'

type PageProps = {
  searchParams: Promise<{
    created?: string
  }>
}

type LandbaseLite = {
  id: string
  name: string
  country: string | null
}

type OrgLite = {
  id: string
  name: string
}

type PurchaseRow = {
  id: string
  code: string
  organization_id: string
  landbase_id: string
  volume: number
  volume_remaining: number
  volume_unit: string
  commodity_type: string
  fibre_diameter: number | null
  year_of_clip: number | null
  batch_number: string | null
  purchase_date: string | null
  created_at: string
  landbases: LandbaseLite | null
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

export default async function PurchasesPage({ searchParams }: PageProps) {
  const user = await requireUser()
  const { created } = await searchParams

  const supabase = await createClient()

  const { data: rows, error } = await supabase
    .from('raw_material_purchases')
    .select(
      `
      id,
      code,
      organization_id,
      landbase_id,
      volume,
      volume_remaining,
      volume_unit,
      commodity_type,
      fibre_diameter,
      year_of_clip,
      batch_number,
      purchase_date,
      created_at,
      landbases:landbase_id ( id, name, country ),
      organizations:organization_id ( id, name )
      `,
    )
    .order('purchase_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .returns<PurchaseRow[]>()

  if (error) {
    console.error('[PurchasesPage]', error.message)
  }

  const purchases = rows ?? []
  const isAdmin = user.role === 'admin'

  const totalVolume = purchases.reduce((sum, p) => sum + Number(p.volume ?? 0), 0)
  const totalRemaining = purchases.reduce(
    (sum, p) => sum + Number(p.volume_remaining ?? 0),
    0,
  )

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">Purchases</h2>
          <p className="mt-1 text-sm text-slate-600">
            Raw material purchases from eligible landbases.{' '}
            {isAdmin
              ? 'As an admin you see every organization.'
              : 'You see purchases made by your organization.'}
          </p>
        </div>
        <Link
          href="/purchases/new"
          className="rounded-md bg-[#063359] px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-[#0a4a7e] focus:outline-none focus:ring-2 focus:ring-[#063359] focus:ring-offset-2"
        >
          + New purchase
        </Link>
      </div>

      {created ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          Purchase <strong>{created}</strong> created.
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <SummaryCard label="Purchases" value={String(purchases.length)} />
        <SummaryCard
          label="Total volume"
          value={`${fmtNumber(totalVolume)} t`}
          hint="Greasy wool purchased"
        />
        <SummaryCard
          label="Remaining"
          value={`${fmtNumber(totalRemaining)} t`}
          hint="Not yet drawn into processing"
        />
      </div>

      <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-6 py-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
            All purchases
          </h3>
        </div>

        {purchases.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <p className="text-sm text-slate-500">No purchases yet.</p>
            <Link
              href="/purchases/new"
              className="mt-4 inline-block rounded-md bg-[#063359] px-4 py-2 text-sm font-medium text-white hover:bg-[#0a4a7e]"
            >
              Record your first purchase
            </Link>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-6 py-2 font-medium">Code</th>
                <th className="px-6 py-2 font-medium">Landbase</th>
                {isAdmin ? (
                  <th className="px-6 py-2 font-medium">Organization</th>
                ) : null}
                <th className="px-6 py-2 font-medium">Purchased</th>
                <th className="px-6 py-2 font-medium text-right">Volume</th>
                <th className="px-6 py-2 font-medium text-right">Remaining</th>
                <th className="px-6 py-2 font-medium text-right">Diameter</th>
                <th className="px-6 py-2 font-medium text-right">Clip yr.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {purchases.map((p) => (
                <tr key={p.id}>
                  <td className="px-6 py-3 font-mono text-xs text-slate-900">
                    {p.code}
                  </td>
                  <td className="px-6 py-3 text-slate-800">
                    <div>{p.landbases?.name ?? '—'}</div>
                    {p.landbases?.country ? (
                      <div className="text-xs text-slate-500">
                        {p.landbases.country}
                      </div>
                    ) : null}
                  </td>
                  {isAdmin ? (
                    <td className="px-6 py-3 text-slate-700">
                      {p.organizations?.name ?? '—'}
                    </td>
                  ) : null}
                  <td className="px-6 py-3 text-slate-500">
                    {fmtDate(p.purchase_date)}
                  </td>
                  <td className="px-6 py-3 text-right text-slate-900">
                    {fmtNumber(Number(p.volume))} {p.volume_unit}
                  </td>
                  <td className="px-6 py-3 text-right">
                    <span
                      className={
                        Number(p.volume_remaining) <= 0
                          ? 'text-slate-400'
                          : 'text-slate-900'
                      }
                    >
                      {fmtNumber(Number(p.volume_remaining))} {p.volume_unit}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-right text-slate-700">
                    {p.fibre_diameter ? `${fmtNumber(Number(p.fibre_diameter), 1)} µm` : '—'}
                  </td>
                  <td className="px-6 py-3 text-right text-slate-700">
                    {p.year_of_clip ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p className="text-xs text-slate-400">
        Rows above are filtered by Row-Level Security. A member of a different
        organization would see only their own purchases.
      </p>
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
