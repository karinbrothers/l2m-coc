// src/app/admin/purchases/page.tsx
//
// Admin purchases view. Every purchase in the system, fresh
// (nothing drawn) and partially-consumed mixed in, sorted by
// most recent. Edit any field to fix a typo. Volume edits
// rebalance volume_remaining; trying to drop volume below
// what's already been drawn into a batch fails cleanly.

import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import EditPurchaseButton from './EditPurchaseButton'

export const dynamic = 'force-dynamic'

type PurchaseRow = {
  id: string
  code: string
  volume: number
  volume_remaining: number
  volume_unit: string | null
  commodity_type: string | null
  fibre_diameter: number | null
  year_of_clip: number | null
  batch_number: string | null
  purchase_date: string | null
  source_sale_id: string | null
  organizations: { name: string | null } | null
  landbases: { name: string | null; country: string | null } | null
  source_sale: {
    code: string | null
    seller: { name: string | null } | null
  } | null
  origin_cert: { id: string; certificate_number: string | null }[] | null
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function statusBadge(p: PurchaseRow) {
  const used = Number(p.volume) - Number(p.volume_remaining)
  if (used <= 0) {
    return (
      <span className="inline-flex items-center rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5 text-xs font-medium">
        Fresh
      </span>
    )
  }
  if (Number(p.volume_remaining) <= 0) {
    return (
      <span className="inline-flex items-center rounded-full bg-slate-100 text-slate-700 px-2 py-0.5 text-xs font-medium">
        Consumed
      </span>
    )
  }
  return (
    <span className="inline-flex items-center rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 text-xs font-medium">
      Partial
    </span>
  )
}

export default async function AdminPurchasesPage() {
  const admin = createAdminClient()

  const { data: purchasesRaw } = await admin
    .from('raw_material_purchases')
    .select(
      `
      id, code, volume, volume_remaining, volume_unit, commodity_type,
      fibre_diameter, year_of_clip, batch_number, purchase_date,
      source_sale_id,
      organizations:organization_id (name),
      landbases:landbase_id (name, country),
      source_sale:sales!source_sale_id (code, seller:organization_id(name)),
      origin_cert:certificates!related_purchase_id (id, certificate_number)
      `,
    )
    .order('purchase_date', { ascending: false })
    .order('created_at', { ascending: false })

  const purchases = (purchasesRaw ?? []) as unknown as PurchaseRow[]

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">
          Admin · Purchases
        </h1>
        <p className="mt-1 text-sm text-slate-600 max-w-2xl">
          Every purchase in the system. Edit fields to correct typos. Volume
          changes rebalance the remaining-volume tracker; you can&apos;t
          reduce volume below what&apos;s already been drawn into a batch.
        </p>
      </div>

      {purchases.length === 0 ? (
        <div className="rounded-md border border-slate-200 bg-white p-6 text-sm text-slate-500">
          No purchases yet.
        </div>
      ) : (
        <div className="space-y-3">
          {purchases.map((p) => {
            const oc = p.origin_cert?.[0]
            const orgName = p.organizations?.name ?? '—'
            const isReceived = !!p.source_sale_id
            return (
              <div
                key={p.id}
                className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <div>
                    <div className="flex items-baseline gap-3">
                      <div className="font-mono text-sm font-semibold text-slate-900">
                        {p.code}
                      </div>
                      {statusBadge(p)}
                    </div>
                    <div className="mt-1 text-sm text-slate-700">
                      {isReceived ? (
                        <>
                          <strong>{orgName}</strong>
                          <span className="text-slate-400 mx-1">←</span>
                          Received from{' '}
                          <strong>
                            {p.source_sale?.seller?.name ?? '—'}
                          </strong>
                          {p.source_sale?.code ? (
                            <span className="text-xs text-slate-500 ml-1">
                              (via {p.source_sale.code})
                            </span>
                          ) : null}
                        </>
                      ) : (
                        <>
                          <strong>{orgName}</strong> bought from{' '}
                          <strong>{p.landbases?.name ?? '—'}</strong>
                          {p.landbases?.country ? (
                            <span className="text-slate-500">
                              {' '}
                              · {p.landbases.country}
                            </span>
                          ) : null}
                        </>
                      )}
                    </div>
                  </div>
                  <div className="text-xs text-slate-500">
                    Purchased {formatDate(p.purchase_date)}
                  </div>
                </div>

                <dl className="mt-3 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                  <div>
                    <dt className="text-xs uppercase text-slate-500">Volume</dt>
                    <dd className="text-slate-900 mt-0.5">
                      {Number(p.volume).toFixed(2)} {p.volume_unit ?? 't'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase text-slate-500">
                      Remaining
                    </dt>
                    <dd className="text-slate-900 mt-0.5">
                      {Number(p.volume_remaining).toFixed(2)}{' '}
                      {p.volume_unit ?? 't'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase text-slate-500">
                      Fibre diam.
                    </dt>
                    <dd className="text-slate-900 mt-0.5">
                      {p.fibre_diameter != null
                        ? `${Number(p.fibre_diameter)} µm`
                        : '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase text-slate-500">
                      Clip year
                    </dt>
                    <dd className="text-slate-900 mt-0.5">
                      {p.year_of_clip ?? '—'}
                    </dd>
                  </div>
                </dl>

                {p.batch_number ? (
                  <div className="mt-2 text-xs text-slate-600">
                    <strong>Batch / supplier ref:</strong> {p.batch_number}
                  </div>
                ) : null}

                <div className="mt-4 border-t border-slate-100 pt-3 flex flex-wrap items-start justify-between gap-3">
                  {oc ? (
                    <Link
                      href={`/certificates/${oc.id}`}
                      target="_blank"
                      className="text-xs font-medium hover:underline"
                      style={{ color: '#063359' }}
                    >
                      View OC {oc.certificate_number} →
                    </Link>
                  ) : (
                    <span className="text-xs text-slate-400">No OC issued</span>
                  )}
                  <EditPurchaseButton
                    purchaseId={p.id}
                    current={{
                      volume: Number(p.volume),
                      volume_remaining: Number(p.volume_remaining),
                      fibre_diameter:
                        p.fibre_diameter != null
                          ? Number(p.fibre_diameter)
                          : null,
                      year_of_clip: p.year_of_clip,
                      purchase_date: p.purchase_date,
                      batch_number: p.batch_number,
                      has_oc: !!oc,
                    }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}