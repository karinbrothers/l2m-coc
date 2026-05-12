// src/app/admin/sales/page.tsx
//
// Admin sales view.
//
// Pending section — every sale awaiting buyer action, with
//   Cancel and Edit-details buttons.
// Recent decisions section — last 25 accepted/rejected sales,
//   with Edit-details only (no cancel; for accepted sales,
//   metadata edits flow through to the TC live).

import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import CancelSaleButton from './CancelSaleButton'
import EditSaleButton from './EditSaleButton'

export const dynamic = 'force-dynamic'

type SaleRow = {
  id: string
  code: string
  volume: number
  volume_unit: string | null
  sale_date: string | null
  status: 'pending' | 'accepted' | 'rejected' | 'expired'
  response_deadline: string | null
  buyer_name: string | null
  response_notes: string | null
  shipping_number: string | null
  country_of_dispatch: string | null
  notes: string | null
  accepted_at: string | null
  rejected_at: string | null
  organizations: { name: string | null } | null
  buyer_org: { name: string | null } | null
  inventory_lot: { code: string | null; product_name: string | null } | null
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function statusBadge(s: SaleRow['status']) {
  const map: Record<SaleRow['status'], { label: string; cls: string }> = {
    pending: { label: 'Pending', cls: 'bg-amber-100 text-amber-800' },
    accepted: { label: 'Accepted', cls: 'bg-emerald-100 text-emerald-800' },
    rejected: { label: 'Rejected', cls: 'bg-red-100 text-red-800' },
    expired: { label: 'Expired', cls: 'bg-slate-100 text-slate-700' },
  }
  const m = map[s]
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${m.cls}`}
    >
      {m.label}
    </span>
  )
}

function SaleCard({
  s,
  showCancel,
  now,
}: {
  s: SaleRow
  showCancel: boolean
  now: number
}) {
  // "Past due" = pending sale whose 14-day response deadline has
  // passed. We don't auto-expire — partner follow-up is handled
  // manually — but the badge surfaces who needs nudging.
  // `now` is passed from the parent so the render stays pure.
  const isPastDue =
    s.status === 'pending' &&
    s.response_deadline != null &&
    new Date(s.response_deadline).getTime() < now

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <div className="flex items-baseline gap-3 flex-wrap">
            <div className="font-mono text-sm font-semibold text-slate-900">
              {s.code}
            </div>
            {statusBadge(s.status)}
            {isPastDue ? (
              <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-red-100 text-red-800">
                Past due
              </span>
            ) : null}
          </div>
          <div className="mt-1 text-sm text-slate-700">
            <strong>{s.organizations?.name ?? '—'}</strong>
            <span className="text-slate-400 mx-1">→</span>
            <strong>{s.buyer_org?.name ?? s.buyer_name ?? '—'}</strong>
          </div>
        </div>
        <div className="text-xs text-slate-500">
          {s.status === 'pending'
            ? `Respond by ${formatDate(s.response_deadline)}`
            : `Decided ${formatDate(s.accepted_at ?? s.rejected_at)}`}
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
        <div>
          <dt className="text-xs uppercase text-slate-500">Volume</dt>
          <dd className="text-slate-900 mt-0.5">
            {Number(s.volume).toFixed(1)} {s.volume_unit ?? 't'}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-slate-500">Sale date</dt>
          <dd className="text-slate-900 mt-0.5">{formatDate(s.sale_date)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-slate-500">Lot</dt>
          <dd className="font-mono text-xs text-slate-900 mt-0.5">
            {s.inventory_lot?.code ?? '—'}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-slate-500">Product</dt>
          <dd className="text-slate-900 mt-0.5 capitalize">
            {s.inventory_lot?.product_name ?? '—'}
          </dd>
        </div>
      </dl>

      <dl className="mt-3 grid grid-cols-2 gap-3 text-sm md:grid-cols-3 border-t border-slate-100 pt-3">
        <div>
          <dt className="text-xs uppercase text-slate-500">Shipping no.</dt>
          <dd className="font-mono text-xs text-slate-900 mt-0.5">
            {s.shipping_number ?? '—'}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-slate-500">
            Country of dispatch
          </dt>
          <dd className="text-slate-900 mt-0.5">
            {s.country_of_dispatch ?? '—'}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-slate-500">Notes</dt>
          <dd className="text-slate-900 mt-0.5 truncate" title={s.notes ?? ''}>
            {s.notes ?? '—'}
          </dd>
        </div>
      </dl>

      {s.response_notes ? (
        <div className="mt-3 text-xs text-slate-600 border-t border-slate-100 pt-3">
          <strong>Response notes:</strong> {s.response_notes}
        </div>
      ) : null}

      <div className="mt-4 border-t border-slate-100 pt-3 flex flex-wrap items-start justify-between gap-3">
        <Link
          href={`/trace/${s.code}`}
          target="_blank"
          className="text-xs font-medium hover:underline"
          style={{ color: '#063359' }}
        >
          View traceability →
        </Link>
        <div className="flex flex-wrap items-start gap-2">
          <EditSaleButton
            saleId={s.id}
            current={{
              volume: Number(s.volume),
              sale_date: s.sale_date,
              shipping_number: s.shipping_number,
              country_of_dispatch: s.country_of_dispatch,
              notes: s.notes,
              status: s.status,
            }}
          />
          {showCancel ? (
            <CancelSaleButton saleId={s.id} saleCode={s.code} />
          ) : null}
        </div>
      </div>
    </div>
  )
}

export default async function AdminSalesPage() {
  const admin = createAdminClient()

  const SELECT =
    'id, code, volume, volume_unit, sale_date, status, response_deadline, buyer_name, response_notes, shipping_number, country_of_dispatch, notes, accepted_at, rejected_at, organizations:organization_id(name), buyer_org:buyer_org_id(name), inventory_lot:inventory_lot_id(code, product_name)'

  const [{ data: pendingRaw }, { data: historyRaw }] = await Promise.all([
    admin
      .from('sales')
      .select(SELECT)
      .eq('status', 'pending')
      .order('created_at', { ascending: false }),
    admin
      .from('sales')
      .select(SELECT)
      .neq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(25),
  ])

  const pending = (pendingRaw ?? []) as unknown as SaleRow[]
  const history = (historyRaw ?? []) as unknown as SaleRow[]
  // Server component runs once per request; Date.now() is fine
  // here. Lint rule is tuned for client renders.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now()

  return (
    <div className="space-y-8 max-w-5xl">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Admin · Sales</h1>
        <p className="mt-1 text-sm text-slate-600 max-w-2xl">
          Cancel pending sales when a partner picks the wrong buyer or
          mistypes a volume. Edit shipping number, country of dispatch, or
          notes on any sale (changes flow straight to the TC live).
        </p>
      </div>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700 mb-3">
          Pending decision ({pending.length})
        </h2>
        {pending.length === 0 ? (
          <div className="rounded-md border border-slate-200 bg-white p-6 text-sm text-slate-500">
            No pending sales right now.
          </div>
        ) : (
          <div className="space-y-3">
            {pending.map((s) => (
              <SaleCard key={s.id} s={s} showCancel={true} now={now} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700 mb-3">
          Recent decisions
        </h2>
        {history.length === 0 ? (
          <div className="rounded-md border border-slate-200 bg-white p-6 text-sm text-slate-500">
            No history yet.
          </div>
        ) : (
          <div className="space-y-3">
            {history.map((s) => (
              <SaleCard key={s.id} s={s} showCancel={false} now={now} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}