import Link from 'next/link'
import { requireUser } from '@/lib/auth/requireUser'
import { createClient } from '@/lib/supabase/server'
import EmptyState from '@/components/EmptyState'
import { acceptSale, rejectSale } from './actions'

type PageProps = {
  searchParams: Promise<{
    accepted?: string
    rejected?: string
    error?: string
  }>
}

type IncomingSale = {
  id: string
  code: string
  volume: number
  volume_unit: string | null
  sale_date: string | null
  notes: string | null
  status: 'pending' | 'accepted' | 'rejected' | 'expired'
  response_deadline: string | null
  accepted_at: string | null
  rejected_at: string | null
  response_notes: string | null
  created_at: string
  seller: { name: string } | null
  inventory_lot: { code: string; product_name: string } | null
}

function statusBadge(status: IncomingSale['status']) {
  const map: Record<IncomingSale['status'], { label: string; className: string }> = {
    pending: { label: 'Pending', className: 'bg-amber-100 text-amber-800' },
    accepted: { label: 'Accepted', className: 'bg-emerald-100 text-emerald-800' },
    rejected: { label: 'Rejected', className: 'bg-red-100 text-red-800' },
    expired: { label: 'Expired', className: 'bg-slate-100 text-slate-700' },
  }
  const s = map[status]
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${s.className}`}>
      {s.label}
    </span>
  )
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function daysUntil(iso: string | null): string {
  if (!iso) return '—'
  const ms = new Date(iso).getTime() - Date.now()
  const days = Math.ceil(ms / (1000 * 60 * 60 * 24))
  if (days < 0) return 'Overdue'
  if (days === 0) return 'Today'
  if (days === 1) return '1 day left'
  return `${days} days left`
}

export default async function InboxPage({ searchParams }: PageProps) {
  const user = await requireUser()
  const { accepted, rejected, error } = await searchParams
  const supabase = await createClient()

  const { data: sales } = await supabase
    .from('sales')
    .select(
      'id, code, volume, volume_unit, sale_date, notes, status, response_deadline, accepted_at, rejected_at, response_notes, created_at, seller:organization_id(name), inventory_lot:inventory_lot_id(code, product_name)',
    )
    .eq('buyer_org_id', user.organization_id)
    .order('created_at', { ascending: false })
    .returns<IncomingSale[]>()

  const list = sales ?? []
  const pendingRows = list.filter((s) => s.status === 'pending')
  const historyRows = list.filter((s) => s.status !== 'pending')

  // Truly empty inbox (no pending and no history) gets the rich
  // empty state. Once there's any history we go back to the
  // normal pending/history layout.
  if (list.length === 0) {
    return (
      <div className="space-y-8">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">Inbox</h2>
          <p className="mt-1 text-sm text-slate-600">
            Sales sent to your organization. Accept to receive the volume and
            a transaction certificate. Reject and the volume returns to the
            seller&apos;s inventory.
          </p>
        </div>

        <EmptyState
          icon="📨"
          title="Nothing waiting on you"
          body={
            <>
              When an upstream partner sells verified material to you,
              it&apos;ll appear here with a preview of the full chain back to
              landbase &mdash; so you can verify provenance before accepting.
            </>
          }
          secondaryCta={{ label: 'Read the guide', href: '/help' }}
        />
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">Inbox</h2>
        <p className="mt-1 text-sm text-slate-600">
          Sales sent to your organization. Accept to receive the volume and a transaction certificate.
          Reject and the volume returns to the seller&apos;s inventory.
        </p>
      </div>

      {accepted ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          Sale accepted. Transaction certificate issued.
        </div>
      ) : null}
      {rejected ? (
        <div className="rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
          Sale rejected. Volume returned to the seller.
        </div>
      ) : null}
      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Error: {error}
        </div>
      ) : null}

      {/* Pending */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
          Pending decision ({pendingRows.length})
        </h3>
        {pendingRows.length === 0 ? (
          <div className="rounded-md border border-slate-200 bg-white p-6 text-sm text-slate-500">
            No pending sales waiting for your decision.
          </div>
        ) : (
          pendingRows.map((s) => (
            <div key={s.id} className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <div className="font-mono text-base font-semibold text-slate-900">{s.code}</div>
                    {statusBadge(s.status)}
                  </div>
                  <div className="mt-1 text-sm text-slate-600">
                    From <strong>{s.seller?.name ?? 'Unknown'}</strong>
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                    <div>
                      <dt className="text-xs uppercase text-slate-500">Volume</dt>
                      <dd className="text-slate-900">
                        {Number(s.volume).toFixed(1)} {s.volume_unit ?? 'tonnes'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase text-slate-500">Sale date</dt>
                      <dd className="text-slate-900">{formatDate(s.sale_date)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase text-slate-500">Lot</dt>
                      <dd className="font-mono text-xs text-slate-900">
                        {s.inventory_lot?.code ?? '—'}
                      </dd>
                      {s.inventory_lot?.product_name ? (
                        <div className="text-xs text-slate-500">{s.inventory_lot.product_name}</div>
                      ) : null}
                    </div>
                    <div>
                      <dt className="text-xs uppercase text-slate-500">Respond by</dt>
                      <dd className="text-slate-900">{formatDate(s.response_deadline)}</dd>
                      <div className="text-xs text-slate-500">{daysUntil(s.response_deadline)}</div>
                    </div>
                  </dl>
                  {s.notes ? (
                    <div className="mt-3 text-sm text-slate-600">
                      <span className="text-xs uppercase text-slate-500">Seller notes:</span> {s.notes}
                    </div>
                  ) : null}
                  <div className="mt-3">
                    <Link
                      href={`/trace/${s.code}`}
                      target="_blank"
                      className="inline-flex items-center gap-1 text-xs font-medium hover:underline"
                      style={{ color: '#063359' }}
                    >
                      View supply chain traceability →
                    </Link>
                    <p className="mt-1 text-xs text-slate-500">
                      See where this material came from before deciding.
                    </p>
                  </div>
                </div>
              </div>
              <form className="mt-4 space-y-3 border-t border-slate-100 pt-4">
                <input type="hidden" name="sale_id" value={s.id} />
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">
                    Response notes (optional)
                  </label>
                  <input
                    name="response_notes"
                    type="text"
                    placeholder="Optional comment to the seller"
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="submit"
                    formAction={acceptSale}
                    className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-emerald-700"
                  >
                    Accept
                  </button>
                  <button
                    type="submit"
                    formAction={rejectSale}
                    className="rounded-md border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50"
                  >
                    Reject
                  </button>
                </div>
              </form>
            </div>
          ))
        )}
      </div>

      {/* History */}
      {historyRows.length > 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-6 py-4">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
              History
            </h3>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-6 py-2 font-medium">Sale</th>
                <th className="px-6 py-2 font-medium">From</th>
                <th className="px-6 py-2 font-medium">Volume</th>
                <th className="px-6 py-2 font-medium">Status</th>
                <th className="px-6 py-2 font-medium">Decided</th>
                <th className="px-6 py-2 font-medium">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {historyRows.map((s) => {
                const decidedAt = s.accepted_at ?? s.rejected_at
                return (
                  <tr key={s.id}>
                    <td className="px-6 py-3 font-mono text-xs">{s.code}</td>
                    <td className="px-6 py-3 text-slate-700">{s.seller?.name ?? '—'}</td>
                    <td className="px-6 py-3">
                      {Number(s.volume).toFixed(1)} {s.volume_unit ?? 'tonnes'}
                    </td>
                    <td className="px-6 py-3">{statusBadge(s.status)}</td>
                    <td className="px-6 py-3 text-slate-500">{formatDateTime(decidedAt)}</td>
                    <td className="px-6 py-3 text-slate-600">{s.response_notes ?? '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  )
}