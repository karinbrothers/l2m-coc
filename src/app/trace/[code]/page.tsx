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
  inputs: Array<{
    volume_used: number
    volume_attributed: number | null
    raw_purchase: {
      code: string
      volume: number
      volume_unit: string
      purchase_date: string | null
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
      <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        {isEligible ? (
          <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z" clipRule="evenodd" />
        ) : (
          <path fillRule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z" clipRule="evenodd" />
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
        <h1 className="text-2xl font-semibold text-slate-900">Trace not found</h1>
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
          <h1 className="text-2xl font-semibold text-slate-900">Verified Provenance</h1>
          <EligibilityBadge status={allEligible ? 'eligible' : 'mixed'} />
        </div>
        <p className="text-sm text-slate-600">
          Chain of custody for sale{' '}
          <code className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-800">{trace.sale.code}</code>
          . Origin landbase verified, volume tracked end-to-end.
        </p>
      </div>

      {/* Step 1: Origin landbase(s) */}
      <section>
        <div className="mb-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-[#063359]">
            Step 1 · Origin landbase{trace.inputs.length > 1 ? 's' : ''}
          </div>
          {trace.inputs.length > 1 ? (
            <div className="mt-1 text-sm text-slate-600">
              {trace.inputs.length} landbases contributed to this sale
            </div>
          ) : null}
        </div>
        <div className="space-y-3">
          {trace.inputs.map((input, idx) => {
            const lb = input.landbase
            const oc = input.origin_certificate
            const rp = input.raw_purchase
            return (
              <div
                key={`${rp.code}-${idx}`}
                className="rounded-lg border-2 border-[#063359]/20 bg-white p-6 shadow-sm"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <div>
                    <div className="text-xl font-semibold text-slate-900">{lb.name}</div>
                    {lb.country ? (
                      <div className="text-sm text-slate-600">{lb.country}</div>
                    ) : null}
                  </div>
                  <EligibilityBadge status={lb.eligibility_status} />
                </div>

                <dl className="mt-4 grid grid-cols-2 gap-4 text-sm md:grid-cols-3">
                  <div>
                    <dt className="text-xs uppercase text-slate-500">Volume attributed</dt>
                    <dd className="mt-1 text-slate-900">
                      {input.volume_attributed != null
                        ? `${Number(input.volume_attributed).toFixed(2)} ${rp.volume_unit}`
                        : '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase text-slate-500">Originally purchased</dt>
                    <dd className="mt-1 text-slate-900">{formatDate(rp.purchase_date)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase text-slate-500">Source purchase</dt>
                    <dd className="mt-1 font-mono text-xs text-slate-900">{rp.code}</dd>
                  </div>
                </dl>

                {oc ? (
                  <div className="mt-4 border-t border-slate-100 pt-3">
                    <Link
                      href={`/certificates/${oc.id}`}
                      className="inline-flex items-center gap-2 text-sm font-medium text-[#063359] hover:underline"
                    >
                      View origin certificate {oc.certificate_number} →
                    </Link>
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      </section>

      {/* Step 2: The Sale */}
      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Step 2 · Sale
        </div>
        <div className="mt-2 flex flex-wrap items-baseline justify-between gap-3">
          <div className="text-xl font-semibold text-slate-900">{trace.sale.code}</div>
          <div className="text-sm text-slate-600">
            Sold to <strong>{trace.sale.buyer_name}</strong>
          </div>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-4 text-sm md:grid-cols-3">
          <div>
            <dt className="text-xs uppercase text-slate-500">Sale date</dt>
            <dd className="mt-1 text-slate-900">{formatDate(trace.sale.sale_date)}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-slate-500">Volume</dt>
            <dd className="mt-1 text-slate-900">{trace.sale.volume} {trace.sale.volume_unit}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-slate-500">Seller</dt>
            <dd className="mt-1 text-slate-900">{trace.organization.name}</dd>
          </div>
        </dl>
      </section>

      {/* Verification statement */}
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-900">
        <div className="font-semibold">Verified by Land to Market</div>
        <p className="mt-1 text-emerald-800">
          The volume sold ({trace.sale.volume} {trace.sale.volume_unit}) is traced
          back to the {trace.inputs.length === 1 ? 'origin landbase' : 'origin landbases'} above.
          Mass balance is enforced at every transaction.
        </p>
        <p className="mt-2 text-xs text-emerald-800">
          Record holder: {trace.organization.name}
        </p>
      </div>
    </div>
  )
}