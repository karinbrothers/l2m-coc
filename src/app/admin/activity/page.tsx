// src/app/admin/activity/page.tsx
//
// Supply Chains — admin's primary "what's happening" view. Each
// origin landbase purchase becomes a chain card, with every
// downstream accepted sale rendered as a step (Engraw → Suedwolle
// → Tessilbiella → Kering). Each step links to its certificate.
// Chains sort by most-recent activity so live ones float up.
//
// Pending sales (not yet accepted by buyer) don't appear here
// because TCs only issue on acceptance — they're tracked in the
// chronological feed below the chain stack.

import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

type OcRow = {
  id: string
  certificate_number: string | null
  related_purchase_id: string | null
  issued_at: string
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
    related_transaction_id: string | null
    issued_at: string
    sales: {
      id: string
      code: string
      sale_date: string | null
      volume: number
      volume_unit: string | null
      status: string
      buyer_name: string | null
      organizations: { name: string | null } | null
      buyer_org: { name: string | null } | null
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
}

type Chain = {
  ocId: string
  ocNumber: string | null
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

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
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

export default async function AdminSupplyChainsPage() {
  const admin = createAdminClient()

  // 1. Every origin certificate in the system, with its underlying
  //    purchase + landbase + FSP context.
  const { data: ocsRaw } = await admin
    .from('certificates')
    .select(
      `
      id, certificate_number, related_purchase_id, issued_at,
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

  // 2. Every TC linked to any of those OCs, with its sale context.
  const ocIds = ocs.map((o) => o.id)
  let tcs: ChainTcRow[] = []
  if (ocIds.length > 0) {
    const { data: tcsRaw } = await admin
      .from('certificate_origin_links')
      .select(
        `
        origin_certificate_id, volume_attributed,
        certificates:transaction_certificate_id (
          id, certificate_number, related_transaction_id, issued_at,
          sales:related_transaction_id (
            id, code, sale_date, volume, volume_unit, status, buyer_name,
            organizations:organization_id (name),
            buyer_org:buyer_org_id (name),
            inventory_lot:inventory_lot_id (product_name)
          )
        )
        `,
      )
      .in('origin_certificate_id', ocIds)
    tcs = (tcsRaw ?? []) as unknown as ChainTcRow[]
  }

  // 3. Group TCs by origin OC, build chain cards.
  const chains: Chain[] = []
  for (const oc of ocs) {
    const purchase = oc.raw_material_purchases
    if (!purchase || !purchase.landbases) continue

    const tcsForThisOc = tcs.filter((t) => t.origin_certificate_id === oc.id)
    const steps: ChainStep[] = []
    for (const t of tcsForThisOc) {
      const tc = t.certificates
      const sale = tc?.sales
      if (!tc || !sale) continue
      steps.push({
        saleCode: sale.code,
        saleDate: sale.sale_date,
        volume: sale.volume,
        volumeUnit: sale.volume_unit,
        status: sale.status,
        productName: sale.inventory_lot?.product_name ?? null,
        sellerName: sale.organizations?.name ?? '—',
        buyerName: sale.buyer_org?.name ?? sale.buyer_name ?? '—',
        tcId: tc.id,
        tcNumber: tc.certificate_number,
        tcIssuedAt: tc.issued_at,
      })
    }
    // Sort steps by sale_date ascending so chain reads top-to-bottom
    steps.sort((a, b) => {
      const ax = a.saleDate ? new Date(a.saleDate).getTime() : 0
      const bx = b.saleDate ? new Date(b.saleDate).getTime() : 0
      return ax - bx
    })

    const latest =
      steps.length > 0
        ? steps[steps.length - 1].tcIssuedAt
        : oc.issued_at

    chains.push({
      ocId: oc.id,
      ocNumber: oc.certificate_number,
      purchaseCode: purchase.code,
      purchaseDate: purchase.purchase_date,
      fspName: purchase.organizations?.name ?? '—',
      landbaseName: purchase.landbases.name ?? '—',
      landbaseCountry: purchase.landbases.country,
      eligibilityStatus: purchase.landbases.eligibility_status ?? '—',
      originVolume: purchase.volume,
      volumeUnit: purchase.volume_unit,
      steps,
      latestActivityAt: latest,
    })
  }

  // Most recently active chains first
  chains.sort(
    (a, b) =>
      new Date(b.latestActivityAt).getTime() -
      new Date(a.latestActivityAt).getTime(),
  )

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Supply chains</h1>
        <p className="mt-1 text-sm text-slate-600 max-w-2xl">
          Every chain in the system, from origin landbase forward through
          every accepted sale. Most recently active chains appear first.
          Sales that haven&apos;t been accepted yet don&apos;t appear here —
          their TCs are issued on acceptance.
        </p>
      </div>

      {chains.length === 0 ? (
        <div className="rounded-md border border-slate-200 bg-white p-6 text-sm text-slate-500">
          No chains yet.
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
                    {chain.volumeUnit} of greasy wool from{' '}
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
                  Last activity {timeAgo(chain.latestActivityAt)}
                </div>
              </header>

              <div className="space-y-3">
                {/* Step 1: Origin landbase */}
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
                        View origin certificate {chain.ocNumber} →
                      </Link>
                    </div>
                  ) : null}
                </section>

                {/* Steps 2..N: each sale */}
                {chain.steps.map((step, idx) => {
                  const isFinal = idx === chain.steps.length - 1
                  return (
                    <section
                      key={step.saleCode}
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
                            View transaction certificate {step.tcNumber} →
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