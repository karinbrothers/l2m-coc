// src/app/traceability/page.tsx
//
// Partner-facing supply chain view. Same chain-card layout as
// /admin/activity, but uses the regular auth client so chain
// visibility goes through the existing user_can_see_cert RLS —
// each partner only sees chains their organization is part of.
//
// - A brand at the end of a chain sees every step back to landbase.
// - A middle processor sees chains that pass through them.
// - An FSP sees chains starting from their own purchases.

import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

type OcRow = {
  id: string
  certificate_number: string | null
  issued_at: string
  voided_at: string | null
  landbase_name_snapshot: string | null
  country_snapshot: string | null
  eligibility_status_snapshot: string | null
  buyer_org_name_snapshot: string | null
  purchase_code: string | null
  volume: number | null
  volume_unit: string | null
  purchase_date: string | null
  raw_material_purchases: {
    id: string
    code: string
    purchase_date: string | null
    volume: number
    volume_unit: string
    organizations: { name: string | null } | null
    landbases: {
      name: string | null
      country: string | null
      eligibility_status: string | null
    } | null
  } | null
}

type ChainTcRow = {
  origin_certificate_id: string
  volume_attributed: number | null
  certificates: {
    id: string
    certificate_number: string | null
    issued_at: string
    voided_at: string | null
    sale_code: string | null
    seller_org_name_snapshot: string | null
    buyer_name_snapshot: string | null
    sales: {
      code: string | null
      sale_date: string | null
      volume: number
      volume_unit: string | null
      status: string
      inventory_lot: { product_name: string | null } | null
    } | null
  } | null
}

type ChainStep = {
  saleCode: string
  saleDate: string | null
  volume: number
  volumeUnit: string | null
  status: string
  productName: string | null
  sellerName: string
  buyerName: string
  tcId: string
  tcNumber: string | null
  tcIssuedAt: string
  tcVoided: boolean
}

type Chain = {
  ocId: string
  ocNumber: string | null
  ocVoided: boolean
  purchaseCode: string
  purchaseDate: string | null
  fspName: string
  landbaseName: string
  landbaseCountry: string | null
  eligibilityStatus: string
  originVolume: number
  volumeUnit: string
  steps: ChainStep[]
  latestActivityAt: string
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function timeAgo(iso: string, now: number): string {
  const ms = now - new Date(iso).getTime()
  const min = Math.floor(ms / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  if (day < 30) return `${day}d ago`
  return `${Math.floor(day / 30)}mo ago`
}

function EligibilityBadge({ status }: { status: string }) {
  const ok = status === 'eligible'
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
        ok
          ? 'bg-emerald-100 text-emerald-800'
          : 'bg-slate-100 text-slate-700'
      }`}
    >
      <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z"
          clipRule="evenodd"
        />
      </svg>
      {ok ? 'Eligible' : status}
    </span>
  )
}

export default async function TraceabilityPage() {
  const supabase = await createClient()

  // RLS scopes both queries to chains this user can see.
  const { data: ocsRaw } = await supabase
    .from('certificates')
    .select(
      `
      id, certificate_number, issued_at, voided_at,
      landbase_name_snapshot, country_snapshot, eligibility_status_snapshot,
      buyer_org_name_snapshot, purchase_code, volume, volume_unit,
      purchase_date,
      raw_material_purchases:related_purchase_id (
        id, code, purchase_date, volume, volume_unit,
        organizations:organization_id (name),
        landbases:landbase_id (name, country, eligibility_status)
      )
      `,
    )
    .eq('type', 'origin')
    .order('issued_at', { ascending: false })

  const ocs = (ocsRaw ?? []) as unknown as OcRow[]

  const ocIds = ocs.map((o) => o.id)
  let tcs: ChainTcRow[] = []
  if (ocIds.length > 0) {
    const { data: tcsRaw } = await supabase
      .from('certificate_origin_links')
      .select(
        `
        origin_certificate_id, volume_attributed,
        certificates:transaction_certificate_id (
          id, certificate_number, issued_at, voided_at, sale_code,
          seller_org_name_snapshot, buyer_name_snapshot,
          sales:related_transaction_id (
            code, sale_date, volume, volume_unit, status,
            inventory_lot:inventory_lot_id (product_name)
          )
        )
        `,
      )
      .in('origin_certificate_id', ocIds)
    tcs = (tcsRaw ?? []) as unknown as ChainTcRow[]
  }

  const chains: Chain[] = []
  for (const oc of ocs) {
    // Some rows might be missing the join (RLS could allow OC but
    // strip purchase join). Use snapshot fields as fallback.
    const purchase = oc.raw_material_purchases
    const landbase = purchase?.landbases
    const fspName =
      purchase?.organizations?.name ??
      oc.buyer_org_name_snapshot ??
      '—'
    const landbaseName = landbase?.name ?? oc.landbase_name_snapshot ?? '—'
    const landbaseCountry = landbase?.country ?? oc.country_snapshot ?? null
    const eligibility =
      landbase?.eligibility_status ?? oc.eligibility_status_snapshot ?? '—'
    const purchaseCode = purchase?.code ?? oc.purchase_code ?? '—'
    const purchaseDate = purchase?.purchase_date ?? oc.purchase_date ?? null
    const originVolume = purchase?.volume ?? oc.volume ?? 0
    const volumeUnit = purchase?.volume_unit ?? oc.volume_unit ?? 'tonnes'

    const tcsForThisOc = tcs.filter((t) => t.origin_certificate_id === oc.id)
    const steps: ChainStep[] = []
    for (const t of tcsForThisOc) {
      const tc = t.certificates
      const sale = tc?.sales
      if (!tc) continue
      steps.push({
        saleCode: tc.sale_code ?? sale?.code ?? '—',
        saleDate: sale?.sale_date ?? null,
        volume: sale?.volume ?? 0,
        volumeUnit: sale?.volume_unit ?? null,
        status: sale?.status ?? 'unknown',
        productName: sale?.inventory_lot?.product_name ?? null,
        sellerName: tc.seller_org_name_snapshot ?? '—',
        buyerName: tc.buyer_name_snapshot ?? '—',
        tcId: tc.id,
        tcNumber: tc.certificate_number,
        tcIssuedAt: tc.issued_at,
        tcVoided: !!tc.voided_at,
      })
    }
    steps.sort((a, b) => {
      const ax = a.saleDate ? new Date(a.saleDate).getTime() : 0
      const bx = b.saleDate ? new Date(b.saleDate).getTime() : 0
      return ax - bx
    })

    const latest =
      steps.length > 0 ? steps[steps.length - 1].tcIssuedAt : oc.issued_at

    chains.push({
      ocId: oc.id,
      ocNumber: oc.certificate_number,
      ocVoided: !!oc.voided_at,
      purchaseCode,
      purchaseDate,
      fspName,
      landbaseName,
      landbaseCountry,
      eligibilityStatus: eligibility,
      originVolume,
      volumeUnit,
      steps,
      latestActivityAt: latest,
    })
  }

  chains.sort(
    (a, b) =>
      new Date(b.latestActivityAt).getTime() -
      new Date(a.latestActivityAt).getTime(),
  )

  // eslint-disable-next-line react-hooks/purity
  const now = Date.now()

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Traceability</h1>
        <p className="mt-1 text-sm text-slate-600 max-w-2xl">
          Every chain your organization is part of, from origin landbase
          forward through every accepted sale. Most recently active chains
          appear first.
        </p>
      </div>

      {chains.length === 0 ? (
        <div className="rounded-md border border-slate-200 bg-white p-6 text-sm text-slate-500">
          No chains yet. Once material flows through your organization,
          chains will appear here.
        </div>
      ) : (
        <div className="space-y-8">
          {chains.map((chain) => (
            <article
              key={chain.ocId}
              className="rounded-2xl border border-slate-200 bg-slate-50 p-6"
            >
              <header className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-wide text-slate-500">
                    Chain · originating purchase {chain.purchaseCode}
                  </div>
                  <div className="mt-1 text-base text-slate-900">
                    {chain.fspName} sourcing {chain.originVolume}{' '}
                    {chain.volumeUnit} from{' '}
                    <strong>{chain.landbaseName}</strong>
                    {chain.landbaseCountry ? (
                      <span className="text-slate-500">
                        {' '}
                        · {chain.landbaseCountry}
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="text-xs text-slate-500">
                  Last activity {timeAgo(chain.latestActivityAt, now)}
                </div>
              </header>

              <div className="space-y-3">
                <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex flex-wrap items-baseline justify-between gap-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Step 1 · Origin landbase
                    </div>
                    <EligibilityBadge status={chain.eligibilityStatus} />
                  </div>
                  <div className="mt-2 text-lg font-semibold text-slate-900">
                    {chain.landbaseName}
                  </div>
                  {chain.landbaseCountry ? (
                    <div className="text-sm text-slate-600">
                      {chain.landbaseCountry}
                    </div>
                  ) : null}
                  <div className="mt-1 text-sm text-slate-600">
                    Purchased by <strong>{chain.fspName}</strong>
                  </div>

                  <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <dt className="text-xs uppercase text-slate-500">
                        Originally purchased
                      </dt>
                      <dd className="mt-0.5 text-slate-900">
                        {formatDate(chain.purchaseDate)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase text-slate-500">
                        Source purchase
                      </dt>
                      <dd className="mt-0.5 font-mono text-xs text-slate-900">
                        {chain.purchaseCode}
                      </dd>
                    </div>
                  </dl>

                  {chain.ocNumber ? (
                    <div className="mt-3 border-t border-slate-100 pt-3">
                      <Link
                        href={`/certificates/${chain.ocId}`}
                        className="text-sm font-medium hover:underline"
                        style={{ color: '#063359' }}
                      >
                        View origin certificate {chain.ocNumber}{' '}
                        {chain.ocVoided ? '(VOIDED)' : ''} →
                      </Link>
                    </div>
                  ) : null}
                </section>

                {chain.steps.map((step, idx) => {
                  const isFinal = idx === chain.steps.length - 1
                  return (
                    <section
                      key={`${chain.ocId}-${step.saleCode}-${idx}`}
                      className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
                    >
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Step {idx + 2} · {isFinal ? 'Latest sale' : 'Sale'}
                      </div>
                      <div className="mt-1.5 font-mono text-sm text-slate-900">
                        {step.saleCode}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-700">
                        <span>
                          <span className="text-xs uppercase text-slate-500 mr-1">
                            Seller
                          </span>
                          <strong>{step.sellerName}</strong>
                        </span>
                        <span className="text-slate-400">→</span>
                        <span>
                          <span className="text-xs uppercase text-slate-500 mr-1">
                            Sold to
                          </span>
                          <strong>{step.buyerName}</strong>
                        </span>
                      </div>
                      <dl className="mt-3 grid grid-cols-2 gap-3 text-sm md:grid-cols-3">
                        <div>
                          <dt className="text-xs uppercase text-slate-500">
                            Product
                          </dt>
                          <dd className="mt-0.5 capitalize text-slate-900">
                            {step.productName ?? '—'}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs uppercase text-slate-500">
                            Sale date
                          </dt>
                          <dd className="mt-0.5 text-slate-900">
                            {formatDate(step.saleDate)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs uppercase text-slate-500">
                            Volume
                          </dt>
                          <dd className="mt-0.5 text-slate-900">
                            {step.volume} {step.volumeUnit ?? 't'}
                          </dd>
                        </div>
                      </dl>
                      {step.tcNumber ? (
                        <div className="mt-3 border-t border-slate-100 pt-3">
                          <Link
                            href={`/certificates/${step.tcId}`}
                            className="text-sm font-medium hover:underline"
                            style={{ color: '#063359' }}
                          >
                            View transaction certificate {step.tcNumber}{' '}
                            {step.tcVoided ? '(VOIDED)' : ''} →
                          </Link>
                        </div>
                      ) : null}
                    </section>
                  )
                })}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}