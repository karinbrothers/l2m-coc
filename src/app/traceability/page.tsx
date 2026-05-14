// src/app/traceability/page.tsx
//
// Partner-facing supply chain view. One card per sale the user
// directly participates in (seller OR buyer). For each card,
// renders the full chain via get_trace_by_sale_code:
//   - Step 1: every origin landbase (multiple if the batch
//     was blended from multiple farms)
//   - Steps 2..N: every sale hop, with seller → buyer and
//     a link to that sale's TC

import Link from 'next/link'
import { requireUser } from '@/lib/auth/requireUser'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

type SaleRow = {
  id: string
  code: string
  sale_date: string | null
  organization_id: string
  buyer_org_id: string | null
}

type TraceInput = {
  volume_attributed: number | null
  raw_purchase: {
    code: string
    purchase_date: string | null
    volume: number
    volume_unit: string
  }
  landbase: {
    name: string
    country: string | null
    eligibility_status: string
  }
  purchasing_org: { name: string } | null
  origin_certificate: {
    id: string
    certificate_number: string | null
  } | null
}

type ChainStep = {
  sale_code: string
  sale_date: string | null
  volume: number
  volume_unit: string
  product_name: string | null
  seller: { name: string }
  buyer: { name: string }
  transaction_certificate: {
    id: string
    certificate_number: string | null
  } | null
}

type TraceData = {
  sale: {
    code: string
    buyer_name: string
    volume: number
    volume_unit: string
    sale_date: string | null
  }
  inputs: TraceInput[]
  sale_chain: ChainStep[]
  organization: { name: string }
} | null

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
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
  const user = await requireUser()
  const supabase = await createClient()

  // Sales the user's org directly participates in (as seller or
  // buyer). These are the "endpoints" we render cards for; the
  // chain that leads to each is fetched via the trace RPC.
  const [sellerRes, buyerRes] = await Promise.all([
    supabase
      .from('sales')
      .select('id, code, sale_date, organization_id, buyer_org_id')
      .eq('organization_id', user.organization_id),
    supabase
      .from('sales')
      .select('id, code, sale_date, organization_id, buyer_org_id')
      .eq('buyer_org_id', user.organization_id),
  ])

  const all = [
    ...((sellerRes.data ?? []) as SaleRow[]),
    ...((buyerRes.data ?? []) as SaleRow[]),
  ]
  // Dedupe by id, then sort newest first
  const seen = new Set<string>()
  const sales = all
    .filter((s) => {
      if (seen.has(s.id)) return false
      seen.add(s.id)
      return true
    })
    .sort((a, b) => {
      const ax = a.sale_date ? new Date(a.sale_date).getTime() : 0
      const bx = b.sale_date ? new Date(b.sale_date).getTime() : 0
      return bx - ax
    })

  // Trace each sale in parallel
  const traces = await Promise.all(
    sales.map(async (s) => {
      const { data } = await supabase.rpc('get_trace_by_sale_code', {
        p_code: s.code,
      })
      return { sale: s, trace: data as TraceData }
    }),
  )

  const visibleTraces = traces.filter((t) => t.trace !== null)

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Traceability</h1>
        <p className="mt-1 text-sm text-slate-600 max-w-2xl">
          One card per sale your organization is part of. Each card shows the
          full chain — every landbase at origin (multiple if the batch was
          blended) and every sale step leading to the current one. Click any
          certificate to view it.
        </p>
      </div>

      {visibleTraces.length === 0 ? (
        <div className="rounded-md border border-slate-200 bg-white p-6 text-sm text-slate-500">
          No chains yet. Once your organization is part of a sale, the chain
          will appear here.
        </div>
      ) : (
        <div className="space-y-8">
          {visibleTraces.map(({ sale, trace }) => {
            if (!trace) return null
            const finalSeller = trace.organization?.name ?? '—'
            const finalBuyer = trace.sale?.buyer_name ?? '—'
            const inputs = trace.inputs ?? []
            const saleChain = trace.sale_chain ?? []

            return (
              <article
                key={sale.id}
                className="rounded-2xl border border-slate-200 bg-slate-50 p-6"
              >
                <header className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
                  <div>
                    <div className="text-xs uppercase tracking-wide text-slate-500">
                      Chain · ending at sale {trace.sale.code}
                    </div>
                    <div className="mt-1 text-base text-slate-900">
                      <strong>{finalSeller}</strong>
                      <span className="text-slate-400 mx-1">→</span>
                      <strong>{finalBuyer}</strong>
                      <span className="ml-2 text-slate-500">
                        · {trace.sale.volume} {trace.sale.volume_unit}
                      </span>
                    </div>
                  </div>
                  <div className="text-xs text-slate-500">
                    {formatDate(trace.sale.sale_date)}
                  </div>
                </header>

                <div className="space-y-3">
                  {/* Step 1: Origin landbase(s) */}
                  <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Step 1 · Origin landbase
                      {inputs.length > 1 ? 's' : ''}
                    </div>
                    {inputs.length === 0 ? (
                      <p className="mt-2 text-sm text-slate-500 italic">
                        No origin landbases linked to this chain yet.
                      </p>
                    ) : (
                      <div className="mt-3 space-y-4 divide-y divide-slate-100">
                        {inputs.map((input, idx) => {
                          const lb = input.landbase
                          const oc = input.origin_certificate
                          const rp = input.raw_purchase
                          return (
                            <div
                              key={`${rp.code}-${idx}`}
                              className={idx > 0 ? 'pt-4' : ''}
                            >
                              <div className="flex flex-wrap items-baseline justify-between gap-3">
                                <div>
                                  <div className="text-base font-semibold text-slate-900">
                                    {lb.name}
                                  </div>
                                  {lb.country ? (
                                    <div className="text-sm text-slate-600">
                                      {lb.country}
                                    </div>
                                  ) : null}
                                  {input.purchasing_org?.name ? (
                                    <div className="mt-1 text-sm text-slate-600">
                                      Purchased by{' '}
                                      <strong>
                                        {input.purchasing_org.name}
                                      </strong>
                                    </div>
                                  ) : null}
                                </div>
                                <EligibilityBadge
                                  status={lb.eligibility_status}
                                />
                              </div>

                              <dl className="mt-3 grid grid-cols-2 gap-3 text-sm md:grid-cols-3">
                                <div>
                                  <dt className="text-xs uppercase text-slate-500">
                                    Volume attributed
                                  </dt>
                                  <dd className="mt-0.5 text-slate-900">
                                    {input.volume_attributed != null
                                      ? `${Number(input.volume_attributed).toFixed(2)} ${rp.volume_unit}`
                                      : '—'}
                                  </dd>
                                </div>
                                <div>
                                  <dt className="text-xs uppercase text-slate-500">
                                    Originally purchased
                                  </dt>
                                  <dd className="mt-0.5 text-slate-900">
                                    {formatDate(rp.purchase_date)}
                                  </dd>
                                </div>
                                <div>
                                  <dt className="text-xs uppercase text-slate-500">
                                    Source purchase
                                  </dt>
                                  <dd className="mt-0.5 font-mono text-xs text-slate-900">
                                    {rp.code}
                                  </dd>
                                </div>
                              </dl>

                              {oc ? (
                                <div className="mt-3">
                                  <Link
                                    href={`/certificates/${oc.id}`}
                                    className="text-sm font-medium hover:underline"
                                    style={{ color: '#063359' }}
                                  >
                                    View origin certificate{' '}
                                    {oc.certificate_number} →
                                  </Link>
                                </div>
                              ) : null}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </section>

                  {/* Steps 2..N: each sale hop */}
                  {saleChain.map((step, idx) => {
                    const isFinal = idx === saleChain.length - 1
                    return (
                      <section
                        key={`${sale.id}-${step.sale_code}-${idx}`}
                        className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
                      >
                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Step {idx + 2} ·{' '}
                          {isFinal ? 'Final sale (yours)' : 'Sale'}
                        </div>
                        <div className="mt-1.5 font-mono text-sm text-slate-900">
                          {step.sale_code}
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-700">
                          <span>
                            <span className="text-xs uppercase text-slate-500 mr-1">
                              Seller
                            </span>
                            <strong>{step.seller.name}</strong>
                          </span>
                          <span className="text-slate-400">→</span>
                          <span>
                            <span className="text-xs uppercase text-slate-500 mr-1">
                              Sold to
                            </span>
                            <strong>{step.buyer.name}</strong>
                          </span>
                        </div>
                        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm md:grid-cols-3">
                          <div>
                            <dt className="text-xs uppercase text-slate-500">
                              Product
                            </dt>
                            <dd className="mt-0.5 capitalize text-slate-900">
                              {step.product_name ?? '—'}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-xs uppercase text-slate-500">
                              Sale date
                            </dt>
                            <dd className="mt-0.5 text-slate-900">
                              {formatDate(step.sale_date)}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-xs uppercase text-slate-500">
                              Volume
                            </dt>
                            <dd className="mt-0.5 text-slate-900">
                              {step.volume} {step.volume_unit ?? 't'}
                            </dd>
                          </div>
                        </dl>
                        {step.transaction_certificate ? (
                          <div className="mt-3 border-t border-slate-100 pt-3">
                            <Link
                              href={`/certificates/${step.transaction_certificate.id}`}
                              className="text-sm font-medium hover:underline"
                              style={{ color: '#063359' }}
                            >
                              View transaction certificate{' '}
                              {step.transaction_certificate.certificate_number}{' '}
                              →
                            </Link>
                          </div>
                        ) : null}
                      </section>
                    )
                  })}
                </div>
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}