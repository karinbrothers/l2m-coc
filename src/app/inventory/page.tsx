import Link from 'next/link'
import { requireUser } from '@/lib/auth/requireUser'
import { createClient } from '@/lib/supabase/server'

type LandbaseLite = {
  id: string
  name: string
  country: string | null
}

type OrgLite = {
  id: string
  name: string
}

type RawRow = {
  id: string
  code: string
  volume: number
  volume_remaining: number
  volume_unit: string
  fibre_diameter: number | null
  year_of_clip: number | null
  purchase_date: string | null
  landbases: LandbaseLite | null
  organizations: OrgLite | null
}

function fmtNumber(n: number, digits = 2): string {
  return n.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  })
}

export default async function InventoryPage() {
  const user = await requireUser()
  const supabase = await createClient()

  const { data: rawRows, error: rawErr } = await supabase
    .from('raw_material_purchases')
    .select(
      `
      id, code, volume, volume_remaining, volume_unit,
      fibre_diameter, year_of_clip, purchase_date,
      landbases:landbase_id ( id, name, country ),
      organizations:organization_id ( id, name )
      `,
    )
    .gt('volume_remaining', 0)
    .order('purchase_date', { ascending: false, nullsFirst: false })
    .returns<RawRow[]>()

  if (rawErr) console.error('[InventoryPage]', rawErr.message)

  const raw = rawRows ?? []
  const isAdmin = user.role === 'admin'
  const totalRawRemaining = raw.reduce(
    (sum, r) => sum + Number(r.volume_remaining ?? 0),
    0,
  )

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">Inventory</h2>
        <p className="mt-1 text-sm text-slate-600">
          On-hand stock by stage.{' '}
          {isAdmin
            ? 'As an admin you see every organization.'
            : 'You see your organization only.'}
        </p>
      </div>

      {/* Raw materials */}
      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
              Raw materials
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              Greasy wool with remaining volume, newest first.
            </p>
          </div>
          <div className="text-right">
            <div className="text-xs uppercase tracking-wide text-slate-500">
              On hand
            </div>
            <div className="text-2xl font-semibold text-slate-900">
              {fmtNumber(totalRawRemaining)} t
            </div>
          </div>
        </div>

        {raw.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <p className="text-sm text-slate-500">No raw material on hand.</p>
            <Link
              href="/purchases/new"
              className="mt-4 inline-block rounded-md bg-[#063359] px-4 py-2 text-sm font-medium text-white hover:bg-[#0a4a7e]"
            >
              Record a purchase
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
                <th className="px-6 py-2 font-medium text-right">Original</th>
                <th className="px-6 py-2 font-medium text-right">Remaining</th>
                <th className="px-6 py-2 font-medium text-right">Diameter</th>
                <th className="px-6 py-2 font-medium text-right">Clip yr.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {raw.map((r) => {
                const pct =
                  r.volume > 0
                    ? (Number(r.volume_remaining) / Number(r.volume)) * 100
                    : 0
                return (
                  <tr key={r.id}>
                    <td className="px-6 py-3 font-mono text-xs text-slate-900">
                      {r.code}
                    </td>
                    <td className="px-6 py-3 text-slate-800">
                      <div>{r.landbases?.name ?? '—'}</div>
                      {r.landbases?.country ? (
                        <div className="text-xs text-slate-500">
                          {r.landbases.country}
                        </div>
                      ) : null}
                    </td>
                    {isAdmin ? (
                      <td className="px-6 py-3 text-slate-700">
                        {r.organizations?.name ?? '—'}
                      </td>
                    ) : null}
                    <td className="px-6 py-3 text-right text-slate-500">
                      {fmtNumber(Number(r.volume))} {r.volume_unit}
                    </td>
                    <td className="px-6 py-3 text-right">
                      <div className="font-medium text-slate-900">
                        {fmtNumber(Number(r.volume_remaining))} {r.volume_unit}
                      </div>
                      <div className="ml-auto mt-1 h-1 w-24 overflow-hidden rounded bg-slate-100">
                        <div
                          className="h-full bg-[#063359]"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </td>
                    <td className="px-6 py-3 text-right text-slate-700">
                      {r.fibre_diameter
                        ? `${fmtNumber(Number(r.fibre_diameter), 1)} µm`
                        : '—'}
                    </td>
                    <td className="px-6 py-3 text-right text-slate-700">
                      {r.year_of_clip ?? '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </section>

      {/* Finished goods — placeholder for MVP */}
      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-6 py-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
            Finished goods
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            Processed wool ready for sale.
          </p>
        </div>
        <div className="px-6 py-10 text-center">
          <p className="text-sm text-slate-500">No finished goods yet.</p>
          <p className="mt-1 text-xs text-slate-400">
            Finished inventory will appear here once processing lots are
            recorded.
          </p>
        </div>
      </section>
    </div>
  )
}
