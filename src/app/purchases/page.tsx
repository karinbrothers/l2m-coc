import Link from 'next/link'
import { requireUser } from '@/lib/auth/requireUser'
import { createClient } from '@/lib/supabase/server'
import EmptyState from '@/components/EmptyState'

type Purchase = {
  id: string
  code: string
  volume: number
  volume_remaining: number
  volume_unit: string
  commodity_type: string | null
  purchase_date: string | null
  year_of_clip: number | null
  fibre_diameter: number | null
  source_sale_id: string | null
  landbases: { name: string; country: string | null } | null
  origin_cert: { id: string; certificate_number: string | null }[] | null
  source_sale: {
    code: string | null
    seller_org: { name: string } | null
  } | null
}

type SaleTc = {
  id: string
  related_transaction_id: string
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export default async function PurchasesPage() {
  const user = await requireUser()
  const supabase = await createClient()

  const { data: org } = await supabase
    .from('organizations')
    .select('is_first_stage_processor')
    .eq('id', user.organization_id)
    .maybeSingle()

  const isFirstStage = org?.is_first_stage_processor ?? false

  const { data: purchases } = await supabase
    .from('raw_material_purchases')
    .select(
      `
      id, code, volume, volume_remaining, volume_unit, commodity_type,
      purchase_date, year_of_clip, fibre_diameter, source_sale_id,
      landbases:landbase_id (name, country),
      origin_cert:certificates!related_purchase_id (id, certificate_number),
      source_sale:sales!source_sale_id (
        code,
        seller_org:organization_id (name)
      )
    `,
    )
    .order('purchase_date', { ascending: false })
    .returns<Purchase[]>()

  const list = purchases ?? []

  // For received purchases, fetch the TC of the source sale separately
  const sourceSaleIds = list
    .map((p) => p.source_sale_id)
    .filter((id): id is string => id !== null)

  const tcsBySaleId = new Map<string, string>()
  if (sourceSaleIds.length > 0) {
    const { data: tcs } = await supabase
      .from('certificates')
      .select('id, related_transaction_id')
      .in('related_transaction_id', sourceSaleIds)
      .eq('type', 'transaction')
      .returns<SaleTc[]>()
    for (const tc of tcs ?? []) {
      tcsBySaleId.set(tc.related_transaction_id, tc.id)
    }
  }

  const totalCount = list.length
  const totalVolume = list.reduce((s, p) => s + Number(p.volume), 0)
  const totalRemaining = list.reduce(
    (s, p) => s + Number(p.volume_remaining),
    0,
  )
  const directCount = list.filter((p) => !p.source_sale_id).length
  const receivedCount = list.filter((p) => p.source_sale_id).length

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">Purchases</h2>
          <p className="mt-1 text-sm text-slate-600">
            Unprocessed material on hand — purchased directly from landbases or
            received from accepted sales. All material here can be drawn into processing.
          </p>
        </div>
        {isFirstStage ? (
          <Link
            href="/purchases/new"
            className="rounded-md bg-[#063359] px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-[#0a4a7e]"
          >
            + New purchase
          </Link>
        ) : null}
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <div className="text-xs font-medium uppercase text-slate-500">
            Purchases
          </div>
          <div className="mt-2 text-3xl font-semibold text-slate-900">
            {totalCount}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {directCount} direct · {receivedCount} received
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <div className="text-xs font-medium uppercase text-slate-500">
            Total volume
          </div>
          <div className="mt-2 text-3xl font-semibold text-slate-900">
            {totalVolume.toFixed(0)} t
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <div className="text-xs font-medium uppercase text-slate-500">
            Remaining
          </div>
          <div className="mt-2 text-3xl font-semibold text-slate-900">
            {totalRemaining.toFixed(0)} t
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Not yet drawn into processing
          </div>
        </div>
      </div>

      {list.length === 0 ? (
        <EmptyState
          icon="📦"
          title="No purchases yet"
          body={
            isFirstStage ? (
              <>
                A purchase records L2M-verified wool you&apos;ve received from
                a landbase. Landbases come from Salesforce automatically — pick
                one, enter volume and clip year, and the system issues an
                origin certificate for you.
              </>
            ) : (
              <>
                Verified material will appear here automatically when you
                accept an incoming sale in your inbox. There&apos;s nothing to
                record manually at your stage.
              </>
            )
          }
          primaryCta={
            isFirstStage
              ? { label: 'Record a purchase', href: '/purchases/new' }
              : { label: 'Open inbox', href: '/inbox' }
          }
          secondaryCta={{ label: 'Read the guide', href: '/help' }}
        />
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-6 py-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            All purchases
          </div>
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-6 py-3">Code</th>
                <th className="px-6 py-3">Source</th>
                <th className="px-6 py-3">Purchased</th>
                <th className="px-6 py-3">Volume</th>
                <th className="px-6 py-3">Remaining</th>
                <th className="px-6 py-3">Microns</th>
                <th className="px-6 py-3">Clip yr.</th>
                <th className="px-6 py-3">Certificate</th>
              </tr>
            </thead>
            <tbody>
              {list.map((p) => {
                const isReceived = !!p.source_sale_id
                const tcId = isReceived
                  ? tcsBySaleId.get(p.source_sale_id!)
                  : null
                const ocId = p.origin_cert?.[0]?.id ?? null

                return (
                  <tr key={p.id} className="border-t border-slate-100">
                    <td className="px-6 py-3 font-mono text-xs">{p.code}</td>
                    <td className="px-6 py-3">
                      {isReceived ? (
                        <>
                          <div className="text-xs uppercase text-slate-500">
                            Received from
                          </div>
                          <div className="text-sm text-slate-900">
                            {p.source_sale?.seller_org?.name ?? '—'}
                          </div>
                          {p.source_sale?.code ? (
                            <div className="text-xs text-slate-500 font-mono">
                              via {p.source_sale.code}
                            </div>
                          ) : null}
                        </>
                      ) : (
                        <>
                          <div className="text-sm text-slate-900">
                            {p.landbases?.name ?? '—'}
                          </div>
                          {p.landbases?.country ? (
                            <div className="text-xs text-slate-500">
                              {p.landbases.country}
                            </div>
                          ) : null}
                        </>
                      )}
                    </td>
                    <td className="px-6 py-3 text-slate-600">
                      {formatDate(p.purchase_date)}
                    </td>
                    <td className="px-6 py-3">
                      {Number(p.volume)} {p.volume_unit ?? 'tonnes'}
                    </td>
                    <td className="px-6 py-3">
                      {Number(p.volume_remaining)} {p.volume_unit ?? 'tonnes'}
                    </td>
                    <td className="px-6 py-3">
                      {p.fibre_diameter ? `${p.fibre_diameter} µm` : '—'}
                    </td>
                    <td className="px-6 py-3">{p.year_of_clip ?? '—'}</td>
                    <td className="px-6 py-3">
                      {isReceived && tcId ? (
                        <Link
                          href={`/certificates/${tcId}`}
                          className="text-[#063359] hover:underline"
                        >
                          View transaction cert
                        </Link>
                      ) : !isReceived && ocId ? (
                        <Link
                          href={`/certificates/${ocId}`}
                          className="text-[#063359] hover:underline"
                        >
                          View origin cert
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

      <p className="text-xs text-slate-500">
        Rows above are filtered by Row-Level Security. A member of a different
        organization would see only their own purchases.
      </p>
    </div>
  )
}