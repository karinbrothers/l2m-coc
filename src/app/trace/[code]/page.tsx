import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

type PageProps = {
  params: Promise<{ code: string }>
}

type TraceData = {
  sale: {
    code: string
    buyer_name: string
    volume: number
    volume_unit: string
    sale_date: string | null
    created_at: string
  }
  lot: {
    code: string
    product_name: string
    total_volume: number
    volume_remaining: number
    volume_unit: string
  } | null
  batch: {
    input_total_volume: number
    output_volume: number
    output_product: string
    processing_method: string | null
    subcontractors: string | null
    processing_date: string | null
    yield_pct: number | null
  } | null
  inputs: Array<{
    volume_used: number
    volume_attributed: number | null
    raw_purchase: {
      code: string
      volume: number
      volume_unit: string
      purchase_date: string | null
      batch_number: string | null
      fibre_diameter: number | null
      year_of_clip: number | null
    }
    landbase: {
      name: string
      country: string | null
      eligibility_status: string
    }
    origin_certificate: {
      id: string
      certificate_number: string | null
    } | null
  }>
  organization: {
    name: string
  }
}

export async function generateMetadata({ params }: PageProps) {
  const { code } = await params
  return {
    title: `Verified Provenance · ${code}`,
    description: `Chain of custody trace for sale ${code}, verified by Land to Market.`,
  }
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function EligibilityBadge({ status }: { status: string }) {
  const isEligible = status === 'eligible'
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
        isEligible
          ? 'bg-emerald-100 text-emerald-800'
          : 'bg-slate-100 text-slate-700'
      }`}
    >
      <svg
        className="h-3.5 w-3.5"
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-hidden="true"
      >
        {isEligible ? (
          <path
            fillRule="evenodd"
            d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z"
            clipRule="evenodd"
          />
        ) : (
          <path
            fillRule="evenodd"
            d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-7-4a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM9 9a.75.75 0 0 0 0 1.5h.253a.25.25 0 0 1 .244.304l-.459 2.066A1.75 1.75 0 0 0 10.747 15H11a.75.75 0 0 0 0-1.5h-.253a.25.25 0 0 1-.244-.304l.459-2.066A1.75 1.75 0 0 0 9.253 9H9Z"
            clipRule="evenodd"
          />
        )}
      </svg>
      {isEligible ? 'Eligible landbase' : `Status: ${status}`}
    </span>
  )
}

export default async function TracePage({ params }: PageProps) {
  const { code } = await params
  const supabase = await createClient()

  const { data, error } = await supabase.rpc('get_trace_by_sale_code', {
    p_code: code,
  })

  if (error || !data) {
    return (
      <div className="mx-auto max-w-2xl py-16 text-center">
        <h1 className="text-2xl font-semibold text-slate-900">
          Trace not found
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          We couldn&apos;t find a sale with the code{' '}
          <code className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-800">
            {code}
          </code>
          . Check the code and try again.
        </p>
      </div>
    )
  }

  const trace = data as TraceData
  const allEligible = trace.inputs.every(
    (i) => i.landbase.eligibility_status === 'eligible',
  )

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      {/* Title + verification banner */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold text-slate-900">
            Verified Provenance
          </h1>
          {allEligible ? (
            <EligibilityBadge status="eligible" />
          ) : (
            <EligibilityBadge status="mixed" />
          )}
        </div>
        <p className="text-sm text-slate-600">
          Chain of custody for sale{' '}
          <code className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-800">
            {trace.sale.code}
          </code>
          . Every step from landbase to buyer is tracked and verifiable.
        </p>
      </div>

      {/* Step 1: Sale (the buyer-facing top of the chain) */}
      <section className="rounded-lg border-2 border-[#063359]/20 bg-white p-6 shadow-sm">
        <div className="text-xs font-semibold uppercase tracking-wide text-[#063359]">
          Step 1 · Sale
        </div>
        <div className="mt-2 flex flex-wrap items-baseline justify-between gap-3">
          <div className="text-xl font-semibold text-slate-900">
            {trace.sale.code}
          </div>
          <div className="text-sm text-slate-600">
            Sold to <strong>{trace.sale.buyer_name}</strong>
          </div>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-4 text-sm md:grid-cols-3">
          <div>
            <dt className="text-xs uppercase text-slate-500">Sale date</dt>
            <dd className="mt-1 text-slate-900">
              {formatDate(trace.sale.sale_date)}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-slate-500">Volume</dt>
            <dd className="mt-1 text-slate-900">
              {trace.sale.volume} {trace.sale.volume_unit}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-slate-500">Seller</dt>
            <dd className="mt-1 text-slate-900">{trace.organization.name}</dd>
          </div>
        </dl>
      </section>

      {/* Step 2: Inventory Lot */}
      {trace.lot ? (
        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Step 2 · Inventory lot
          </div>
          <div className="mt-2 flex flex-wrap items-baseline justify-between gap-3">
            <div className="text-lg font-semibold text-slate-900">
              {trace.lot.code}
            </div>
            <div className="text-sm text-slate-600">
              {trace.lot.product_name}
            </div>
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-4 text-sm md:grid-cols-3">
            <div>
              <dt className="text-xs uppercase text-slate-500">Total volume</dt>
              <dd className="mt-1 text-slate-900">
                {trace.lot.total_volume} {trace.lot.volume_unit}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-slate-500">
                Remaining in lot
              </dt>
              <dd className="mt-1 text-slate-900">
                {trace.lot.volume_remaining} {trace.lot.volume_unit}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-slate-500">This sale</dt>
              <dd className="mt-1 text-slate-900">
                {trace.sale.volume} {trace.sale.volume_unit} drawn
              </dd>
            </div>
          </dl>
        </section>
      ) : null}

      {/* Step 3: Processing Batch */}
      {trace.batch ? (
        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Step 3 · Processing
          </div>
          <div className="mt-2 flex flex-wrap items-baseline justify-between gap-3">
            <div className="text-lg font-semibold text-slate-900">
              {trace.batch.output_product}
            </div>
            <div className="text-sm text-slate-600">
              {formatDate(trace.batch.processing_date)}
            </div>
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
            <div>
              <dt className="text-xs uppercase text-slate-500">Input</dt>
              <dd className="mt-1 text-slate-900">
                {Number(trace.batch.input_total_volume).toFixed(1)} t
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-slate-500">Output</dt>
              <dd className="mt-1 text-slate-900">
                {Number(trace.batch.output_volume).toFixed(1)} t
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-slate-500">Yield</dt>
              <dd className="mt-1 text-slate-900">
                {trace.batch.yield_pct != null
                  ? `${trace.batch.yield_pct}%`
                  : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-slate-500">Method</dt>
              <dd className="mt-1 text-slate-900">
                {trace.batch.processing_method ?? '—'}
              </dd>
            </div>
          </dl>
          {trace.batch.subcontractors ? (
            <div className="mt-4 border-t border-slate-100 pt-4 text-xs text-slate-500">
              Processed by:{' '}
              <span className="text-slate-700">{trace.batch.subcontractors}</span>
            </div>
          ) : null}
        </section>
      ) : null}

      {/* Step 4: Source landbases */}
      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Step 4 · Source landbases
            </div>
            <div className="mt-1 text-sm text-slate-600">
              {trace.inputs.length}{' '}
              {trace.inputs.length === 1 ? 'source' : 'sources'} contributed to
              this lot
            </div>
          </div>
        </div>
        <div className="space-y-3">
          {trace.inputs.map((input, idx) => {
            const rp = input.raw_purchase
            const lb = input.landbase
            const oc = input.origin_certificate
            return (
              <div
                key={`${rp.code}-${idx}`}
                className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <div>
                    <div className="text-lg font-semibold text-slate-900">
                      {lb.name}
                    </div>
                    {lb.country ? (
                      <div className="text-sm text-slate-600">{lb.country}</div>
                    ) : null}
                  </div>
                  <EligibilityBadge status={lb.eligibility_status} />
                </div>

                <dl className="mt-4 grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
                  <div>
                    <dt className="text-xs uppercase text-slate-500">
                      Raw purchase
                    </dt>
                    <dd className="mt-1 font-mono text-xs text-slate-900">
                      {rp.code}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase text-slate-500">
                      Purchased
                    </dt>
                    <dd className="mt-1 text-slate-900">
                      {formatDate(rp.purchase_date)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase text-slate-500">
                      Volume into batch
                    </dt>
                    <dd className="mt-1 text-slate-900">
                      {Number(input.volume_used).toFixed(2)} {rp.volume_unit}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase text-slate-500">
                      Attributed to this sale
                    </dt>
                    <dd className="mt-1 text-slate-900">
                      {input.volume_attributed != null
                        ? `${Number(input.volume_attributed).toFixed(2)} ${rp.volume_unit}`
                        : '—'}
                    </dd>
                  </div>
                </dl>

                {(rp.year_of_clip || rp.fibre_diameter || rp.batch_number) && (
                  <dl className="mt-3 grid grid-cols-2 gap-4 border-t border-slate-100 pt-3 text-xs md:grid-cols-3">
                    {rp.year_of_clip ? (
                      <div>
                        <dt className="text-slate-500">Year of clip</dt>
                        <dd className="mt-0.5 text-slate-700">
                          {rp.year_of_clip}
                        </dd>
                      </div>
                    ) : null}
                    {rp.fibre_diameter ? (
                      <div>
                        <dt className="text-slate-500">Fibre diameter</dt>
                        <dd className="mt-0.5 text-slate-700">
                          {rp.fibre_diameter} µm
                        </dd>
                      </div>
                    ) : null}
                    {rp.batch_number ? (
                      <div>
                        <dt className="text-slate-500">Batch</dt>
                        <dd className="mt-0.5 text-slate-700">
                          {rp.batch_number}
                        </dd>
                      </div>
                    ) : null}
                  </dl>
                )}

                {oc ? (
                  <div className="mt-4 border-t border-slate-100 pt-3">
                    <Link
                      href={`/certificates/${oc.id}`}
                      className="inline-flex items-center gap-2 text-sm font-medium text-[#063359] hover:underline"
                    >
                      <svg
                        className="h-4 w-4"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path
                          fillRule="evenodd"
                          d="M10 1c-1.828 0-3.623.149-5.371.435a.75.75 0 0 0-.629.74v.387c-.827.157-1.642.345-2.445.564a.75.75 0 0 0-.552.842 38.13 38.13 0 0 0 1.25 5.518.75.75 0 0 0 1.426-.461 36.617 36.617 0 0 1-.948-3.74 41.31 41.31 0 0 1 6.55-.519 41.318 41.318 0 0 1 6.55.519 36.62 36.62 0 0 1-.949 3.74.75.75 0 0 0 1.426.461 38.13 38.13 0 0 0 1.25-5.518.75.75 0 0 0-.552-.842 40.6 40.6 0 0 0-2.445-.564V2.175a.75.75 0 0 0-.628-.74A33.07 33.07 0 0 0 10 1Zm-5.5 2.5h11v9.5h-11v-9.5Zm5.5 1.75a.75.75 0 0 1 .75.75v3a.75.75 0 0 1-1.5 0v-3a.75.75 0 0 1 .75-.75Zm-3 6.5a.75.75 0 0 0 0 1.5h6a.75.75 0 0 0 0-1.5h-6Z"
                          clipRule="evenodd"
                        />
                      </svg>
                      View origin certificate {oc.certificate_number}
                    </Link>
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      </section>

      {/* Verification statement */}
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-900">
        <div className="font-semibold">Verified by Land to Market</div>
        <p className="mt-1 text-emerald-800">
          This record is part of an immutable chain of custody. Volumes are
          enforced via mass balance at each step — purchase, processing, and
          sale.
        </p>
        <p className="mt-2 text-xs text-emerald-800">
          Record holder: {trace.organization.name}
        </p>
      </div>
    </div>
  )
}