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
  source_purchase: {
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

  // No row found OR db error: render a clean 404.
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

  return (
    <div className="space-y-6">
      {/* Title + verification banner */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold text-slate-900">
            Verified Provenance
          </h1>
          <EligibilityBadge status={trace.landbase.eligibility_status} />
        </div>
        <p className="text-sm text-slate-600">
          Chain of custody for sale{' '}
          <code className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-800">
            {trace.sale.code}
          </code>
          . Every step from landbase to buyer is tracked and verifiable.
        </p>
      </div>

      {/* Flow: Landbase → Purchase → Sale */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {/* Landbase card — the hero */}
        <div className="rounded-lg border-2 border-[#063359]/20 bg-white p-5 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-[#063359]">
            Step 1 · Landbase
          </div>
          <div className="mt-2 text-lg font-semibold text-slate-900">
            {trace.landbase.name}
          </div>
          {trace.landbase.country ? (
            <div className="mt-0.5 text-sm text-slate-600">
              {trace.landbase.country}
            </div>
          ) : null}
          <div className="mt-3">
            <EligibilityBadge status={trace.landbase.eligibility_status} />
          </div>
        </div>

        {/* Purchase card */}
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Step 2 · Raw material purchase
          </div>
          <div className="mt-2 text-lg font-semibold text-slate-900">
            {trace.source_purchase.code}
          </div>
          <dl className="mt-3 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-500">Purchased</dt>
              <dd className="text-slate-900">
                {formatDate(trace.source_purchase.purchase_date)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Volume</dt>
              <dd className="text-slate-900">
                {trace.source_purchase.volume}{' '}
                {trace.source_purchase.volume_unit}
              </dd>
            </div>
            {trace.source_purchase.year_of_clip ? (
              <div className="flex justify-between">
                <dt className="text-slate-500">Year of clip</dt>
                <dd className="text-slate-900">
                  {trace.source_purchase.year_of_clip}
                </dd>
              </div>
            ) : null}
            {trace.source_purchase.fibre_diameter ? (
              <div className="flex justify-between">
                <dt className="text-slate-500">Fibre diameter</dt>
                <dd className="text-slate-900">
                  {trace.source_purchase.fibre_diameter} µm
                </dd>
              </div>
            ) : null}
            {trace.source_purchase.batch_number ? (
              <div className="flex justify-between">
                <dt className="text-slate-500">Batch</dt>
                <dd className="text-slate-900">
                  {trace.source_purchase.batch_number}
                </dd>
              </div>
            ) : null}
          </dl>
        </div>

        {/* Sale card */}
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Step 3 · Sale
          </div>
          <div className="mt-2 text-lg font-semibold text-slate-900">
            {trace.sale.code}
          </div>
          <dl className="mt-3 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-500">Sold to</dt>
              <dd className="text-slate-900">{trace.sale.buyer_name}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Sale date</dt>
              <dd className="text-slate-900">
                {formatDate(trace.sale.sale_date)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Volume</dt>
              <dd className="text-slate-900">
                {trace.sale.volume} {trace.sale.volume_unit}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      {/* Verification statement */}
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-900">
        <div className="font-semibold">Verified by Land to Market</div>
        <p className="mt-1 text-emerald-800">
          This record is part of an immutable chain of custody. The source
          landbase has been verified as{' '}
          <strong>{trace.landbase.eligibility_status}</strong> under the Land
          to Market program, and the volume sold ({trace.sale.volume}{' '}
          {trace.sale.volume_unit}) was drawn from purchase{' '}
          {trace.source_purchase.code} with enforced mass balance.
        </p>
        <p className="mt-2 text-xs text-emerald-800">
          Record holder: {trace.organization.name}
        </p>
      </div>
    </div>
  )
}