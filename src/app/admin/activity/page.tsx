// src/app/admin/activity/page.tsx
//
// Global activity feed — every event across every organisation,
// in chronological order. Lets admin watch supply chains in
// motion: a purchase records, a batch processes, a sale sends,
// a buyer accepts, a cert issues. One shared timeline.

import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

type Org = { name: string | null } | null

type PurchaseRow = {
  id: string
  code: string
  organization_id: string
  organizations: Org
  landbase_id: string | null
  landbases: { name: string | null } | null
  source_sale_id: string | null
  source_sale: { code: string | null; seller: Org } | null
  volume: number
  volume_unit: string
  created_at: string
}

type BatchRow = {
  id: string
  organization_id: string
  organizations: Org
  output_product: string | null
  input_total_volume: number | null
  output_volume: number | null
  inventory_lots: { code: string }[] | null
  created_at: string
}

type SaleRow = {
  id: string
  code: string
  organization_id: string
  organizations: Org
  buyer_org: Org
  buyer_name: string | null
  volume: number
  volume_unit: string | null
  status: 'pending' | 'accepted' | 'rejected' | 'expired'
  created_at: string
  accepted_at: string | null
  rejected_at: string | null
}

type CertRow = {
  id: string
  certificate_number: string | null
  type: string
  related_purchase_id: string | null
  related_transaction_id: string | null
  issued_at: string
}

type Event = {
  ts: string
  href: string
  icon: string
  summary: React.ReactNode
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
  const month = Math.floor(day / 30)
  return `${month}mo ago`
}

export default async function AdminActivityPage() {
  const admin = createAdminClient()

  const [
    { data: purchases },
    { data: batches },
    { data: sales },
    { data: certs },
  ] = await Promise.all([
    admin
      .from('raw_material_purchases')
      .select(
        `id, code, organization_id, volume, volume_unit, created_at, landbase_id, source_sale_id,
         organizations:organization_id(name),
         landbases:landbase_id(name),
         source_sale:sales!source_sale_id(code, seller:organization_id(name))`,
      )
      .order('created_at', { ascending: false })
      .limit(80),
    admin
      .from('processing_batches')
      .select(
        `id, organization_id, output_product, input_total_volume, output_volume, created_at,
         organizations:organization_id(name),
         inventory_lots(code)`,
      )
      .order('created_at', { ascending: false })
      .limit(80),
    admin
      .from('sales')
      .select(
        `id, code, organization_id, buyer_org_id, buyer_name, volume, volume_unit,
         status, created_at, accepted_at, rejected_at,
         organizations:organization_id(name),
         buyer_org:buyer_org_id(name)`,
      )
      .order('created_at', { ascending: false })
      .limit(80),
    admin
      .from('certificates')
      .select(
        'id, certificate_number, type, related_purchase_id, related_transaction_id, issued_at',
      )
      .order('issued_at', { ascending: false })
      .limit(80),
  ])

  const events: Event[] = []

  for (const p of (purchases ?? []) as unknown as PurchaseRow[]) {
    const orgName = p.organizations?.name ?? 'an organisation'
    const sourceLabel = p.landbase_id
      ? `landbase ${p.landbases?.name ?? '—'}`
      : `sale ${p.source_sale?.code ?? '—'} from ${p.source_sale?.seller?.name ?? '—'}`
    events.push({
      ts: p.created_at,
      href: `/purchases`,
      icon: '📦',
      summary: (
        <>
          <strong>{orgName}</strong> recorded a purchase of{' '}
          {Number(p.volume)} {p.volume_unit} from {sourceLabel}{' '}
          <span className="font-mono text-xs text-slate-500">{p.code}</span>
        </>
      ),
    })
  }

  for (const b of (batches ?? []) as unknown as BatchRow[]) {
    const orgName = b.organizations?.name ?? 'an organisation'
    const lotCode = b.inventory_lots?.[0]?.code
    events.push({
      ts: b.created_at,
      href: `/processing`,
      icon: '🧶',
      summary: (
        <>
          <strong>{orgName}</strong> processed{' '}
          {b.input_total_volume != null ? Number(b.input_total_volume) : '—'} t
          into {b.output_volume != null ? Number(b.output_volume) : '—'} t of{' '}
          {b.output_product ?? '—'}
          {lotCode ? (
            <>
              {' '}
              <span className="font-mono text-xs text-slate-500">{lotCode}</span>
            </>
          ) : null}
        </>
      ),
    })
  }

  for (const s of (sales ?? []) as unknown as SaleRow[]) {
    const sellerName = s.organizations?.name ?? 'a seller'
    const buyerName = s.buyer_org?.name ?? s.buyer_name ?? 'a buyer'

    // Sale created
    events.push({
      ts: s.created_at,
      href: `/sales`,
      icon: '📤',
      summary: (
        <>
          <strong>{sellerName}</strong> sent a sale of {Number(s.volume)}{' '}
          {s.volume_unit ?? 't'} to <strong>{buyerName}</strong>{' '}
          <span className="font-mono text-xs text-slate-500">{s.code}</span>
        </>
      ),
    })

    // Acceptance / rejection events
    if (s.status === 'accepted' && s.accepted_at) {
      events.push({
        ts: s.accepted_at,
        href: `/sales`,
        icon: '✅',
        summary: (
          <>
            <strong>{buyerName}</strong> accepted sale{' '}
            <span className="font-mono text-xs">{s.code}</span> from{' '}
            <strong>{sellerName}</strong>
          </>
        ),
      })
    } else if (s.status === 'rejected' && s.rejected_at) {
      events.push({
        ts: s.rejected_at,
        href: `/sales`,
        icon: '❌',
        summary: (
          <>
            <strong>{buyerName}</strong> rejected sale{' '}
            <span className="font-mono text-xs">{s.code}</span> from{' '}
            <strong>{sellerName}</strong>
          </>
        ),
      })
    }
  }

  for (const c of (certs ?? []) as unknown as CertRow[]) {
    events.push({
      ts: c.issued_at,
      href: `/certificates/${c.id}`,
      icon: c.type === 'origin' ? '🌱' : '📜',
      summary: (
        <>
          {c.type === 'origin' ? 'Origin' : 'Transaction'} certificate{' '}
          <span className="font-mono text-xs">{c.certificate_number}</span>{' '}
          issued
        </>
      ),
    })
  }

  events.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())
  const top = events.slice(0, 100)

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs text-slate-500">
          <Link href="/" className="hover:text-slate-700">
            ← Back to dashboard
          </Link>
        </div>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">
          Supply chain activity
        </h1>
        <p className="mt-1 text-sm text-slate-600 max-w-2xl">
          Every event across every organisation, newest first. Watch chains
          unfold as partners record purchases, process batches, send sales,
          and issue certificates.
        </p>
      </div>

      {top.length === 0 ? (
        <div className="rounded-md border border-slate-200 bg-white p-6 text-sm text-slate-500">
          No activity yet.
        </div>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <ul className="divide-y divide-slate-100">
            {top.map((e, i) => (
              <li key={i} className="flex gap-3 px-5 py-3 text-sm">
                <div
                  className="shrink-0 select-none text-base leading-tight"
                  aria-hidden
                >
                  {e.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-slate-700 leading-relaxed">
                    <Link href={e.href} className="hover:underline">
                      {e.summary}
                    </Link>
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {timeAgo(e.ts)}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}