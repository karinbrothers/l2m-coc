import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

type OrgRow = {
  id: string
  name: string
  type: string | null
  is_first_stage_processor: boolean | null
  is_final_brand: boolean | null
  supply_chain_stage: string | null
}

type ProfileRow = {
  id: string
  email: string | null
  full_name: string | null
  role: 'admin' | 'partner'
  organization_id: string | null
  organizations: OrgRow | null
}

type ActivityRow = {
  type: 'purchase' | 'received' | 'batch' | 'sale_sent' | 'sale_accepted' | 'sale_rejected'
  timestamp: string
  title: string
  subtitle: string | null
  href: string
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const days = Math.floor(ms / (1000 * 60 * 60 * 24))
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days} days ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  if (days < 365) return `${Math.floor(days / 30)}mo ago`
  return `${Math.floor(days / 365)}y ago`
}

function activityIcon(type: ActivityRow['type']): string {
  switch (type) {
    case 'purchase':       return '🌱'
    case 'received':       return '📦'
    case 'batch':          return '🏭'
    case 'sale_sent':      return '📤'
    case 'sale_accepted':  return '✅'
    case 'sale_rejected':  return '❌'
  }
}

export default async function Home() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    redirect('/login')
  }

  const { data: profileRaw } = await supabase
    .from('profiles')
    .select(
      `id, email, full_name, role, organization_id,
       organizations:organization_id ( id, name, type, is_first_stage_processor, is_final_brand, supply_chain_stage )`,
    )
    .eq('id', user.id)
    .single<ProfileRow>()

  const profile = profileRaw
  const isAdmin = profile?.role === 'admin'
  const orgId = profile?.organization_id ?? null
  const orgName = profile?.organizations?.name ?? null
  const stage = profile?.organizations?.supply_chain_stage ?? null
  const isFirstStage =
    profile?.organizations?.is_first_stage_processor ?? false
  const isFinalBrand = profile?.organizations?.is_final_brand ?? false

  // ─── Stats queries ────────────────────────────────────────
  const actionItemsPromise = orgId
    ? supabase
        .from('sales')
        .select('id', { count: 'exact', head: true })
        .eq('buyer_org_id', orgId)
        .eq('status', 'pending')
    : Promise.resolve({ count: 0 } as { count: number | null })

  const unprocessedPromise = orgId
    ? supabase
        .from('raw_material_purchases')
        .select('volume_remaining, volume')
        .eq('organization_id', orgId)
    : Promise.resolve({ data: [] } as { data: { volume_remaining: number; volume: number }[] })

  const processedPromise = orgId
    ? supabase
        .from('inventory_lots')
        .select('volume_remaining')
        .eq('organization_id', orgId)
    : Promise.resolve({ data: [] } as { data: { volume_remaining: number }[] })

  const outgoingPendingPromise = orgId
    ? supabase
        .from('sales')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .eq('status', 'pending')
    : Promise.resolve({ count: 0 } as { count: number | null })

  const [actionItemsRes, unprocRes, procRes, outgoingRes] =
    await Promise.all([
      actionItemsPromise,
      unprocessedPromise,
      processedPromise,
      outgoingPendingPromise,
    ])

  const actionItemsCount = actionItemsRes.count ?? 0
  const unprocessedRows =
    (unprocRes as { data: { volume_remaining: number; volume: number }[] | null }).data ?? []
  const unprocessedTonnes = unprocessedRows.reduce(
    (s, r) => s + Number(r.volume_remaining ?? 0),
    0,
  )
  const lifetimeTonnes = unprocessedRows.reduce(
    (s, r) => s + Number(r.volume ?? 0),
    0,
  )
  const processedTonnes = (
    (procRes as { data: { volume_remaining: number }[] | null }).data ?? []
  ).reduce((s, r) => s + Number(r.volume_remaining ?? 0), 0)
  const outgoingPendingCount = outgoingRes.count ?? 0

  // ─── Activity feed queries ────────────────────────────────
  const activity: ActivityRow[] = []

  if (orgId) {
    const [purchasesAct, batchesAct, salesSentAct, salesReceivedAct] =
      await Promise.all([
        supabase
          .from('raw_material_purchases')
          .select(
            'id, code, volume, volume_unit, purchase_date, source_sale_id, landbases:landbase_id(name), source_sale:sales!source_sale_id(seller_org:organization_id(name))',
          )
          .eq('organization_id', orgId)
          .order('purchase_date', { ascending: false })
          .limit(5),
        supabase
          .from('processing_batches')
          .select('id, output_product, output_volume, processing_date')
          .eq('organization_id', orgId)
          .order('processing_date', { ascending: false })
          .limit(5),
        supabase
          .from('sales')
          .select(
            'id, code, volume, volume_unit, sale_date, status, accepted_at, rejected_at, buyer_org:buyer_org_id(name)',
          )
          .eq('organization_id', orgId)
          .order('sale_date', { ascending: false })
          .limit(5),
        supabase
          .from('sales')
          .select(
            'id, code, volume, volume_unit, sale_date, status, accepted_at, rejected_at, seller_org:organization_id(name)',
          )
          .eq('buyer_org_id', orgId)
          .order('sale_date', { ascending: false })
          .limit(5),
      ])

    for (const p of (purchasesAct.data ?? []) as unknown as Array<{
      id: string
      code: string
      volume: number
      volume_unit: string | null
      purchase_date: string
      source_sale_id: string | null
      landbases: { name: string } | null
      source_sale: { seller_org: { name: string } | null } | null
    }>) {
      const isReceived = !!p.source_sale_id
      activity.push({
        type: isReceived ? 'received' : 'purchase',
        timestamp: p.purchase_date,
        title: isReceived
          ? `Received ${Number(p.volume)} ${p.volume_unit ?? 't'} from ${p.source_sale?.seller_org?.name ?? 'a partner'}`
          : `Purchased ${Number(p.volume)} ${p.volume_unit ?? 't'} from ${p.landbases?.name ?? 'a landbase'}`,
        subtitle: p.code,
        href: '/purchases',
      })
    }

    for (const b of (batchesAct.data ?? []) as unknown as Array<{
      id: string
      output_product: string
      output_volume: number
      processing_date: string
    }>) {
      activity.push({
        type: 'batch',
        timestamp: b.processing_date,
        title: `Processed batch — ${Number(b.output_volume)} t of ${b.output_product}`,
        subtitle: null,
        href: '/processing',
      })
    }

    for (const s of (salesSentAct.data ?? []) as unknown as Array<{
      id: string
      code: string
      volume: number
      volume_unit: string | null
      sale_date: string
      status: string
      accepted_at: string | null
      rejected_at: string | null
      buyer_org: { name: string } | null
    }>) {
      const buyer = s.buyer_org?.name ?? 'a partner'
      const vol = `${Number(s.volume)} ${s.volume_unit ?? 't'}`
      if (s.status === 'accepted' && s.accepted_at) {
        activity.push({
          type: 'sale_accepted',
          timestamp: s.accepted_at,
          title: `${buyer} accepted ${vol}`,
          subtitle: s.code,
          href: '/sales',
        })
      } else if (s.status === 'rejected' && s.rejected_at) {
        activity.push({
          type: 'sale_rejected',
          timestamp: s.rejected_at,
          title: `${buyer} rejected ${vol}`,
          subtitle: s.code,
          href: '/sales',
        })
      } else {
        activity.push({
          type: 'sale_sent',
          timestamp: s.sale_date,
          title: `Sent ${vol} to ${buyer}`,
          subtitle: s.code,
          href: '/sales',
        })
      }
    }

    for (const s of (salesReceivedAct.data ?? []) as unknown as Array<{
      id: string
      code: string
      volume: number
      volume_unit: string | null
      sale_date: string
      status: string
      accepted_at: string | null
      rejected_at: string | null
      seller_org: { name: string } | null
    }>) {
      if (s.status === 'pending') continue
      const seller = s.seller_org?.name ?? 'a partner'
      const vol = `${Number(s.volume)} ${s.volume_unit ?? 't'}`
      if (s.status === 'accepted' && s.accepted_at) {
        activity.push({
          type: 'sale_accepted',
          timestamp: s.accepted_at,
          title: `Accepted ${vol} from ${seller}`,
          subtitle: s.code,
          href: '/inbox',
        })
      } else if (s.status === 'rejected' && s.rejected_at) {
        activity.push({
          type: 'sale_rejected',
          timestamp: s.rejected_at,
          title: `Rejected ${vol} from ${seller}`,
          subtitle: s.code,
          href: '/inbox',
        })
      }
    }

    activity.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    )
  }

  const recentActivity = activity.slice(0, 10)

  // ─── Render ───────────────────────────────────────────────
  return (
    <div className="space-y-8">
      {/* Welcome */}
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">
          Welcome back{profile?.full_name ? `, ${profile.full_name}` : ''}
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          {orgName ? (
            <>
              Signed in to <strong>{orgName}</strong>
              {stage ? <span className="ml-1 text-slate-500">· {stage}</span> : null}
              <span className="mx-2 text-slate-300">·</span>
              <span className={isAdmin ? 'text-amber-700' : 'text-slate-600'}>
                {isAdmin ? 'Admin' : 'Partner'}
              </span>
            </>
          ) : (
            <span className="text-amber-700">
              You aren&apos;t assigned to an organization yet. Ask your admin
              for an invitation.
            </span>
          )}
        </p>
      </div>

      {/* Regenerative impact hero */}
      {orgId && lifetimeTonnes > 0 ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-6">
          <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
            Regenerative impact
          </div>
          <div className="mt-2 text-2xl font-semibold text-emerald-900">
            {lifetimeTonnes.toFixed(1)} tonnes
          </div>
          <p className="mt-1 text-sm text-emerald-800">
            of material from regenerating landbases has moved through your organization.
          </p>
        </div>
      ) : null}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Link
          href="/inbox"
          className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm hover:border-[#063359] hover:bg-slate-50 transition-colors"
        >
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Action items
          </div>
          <div
            className={`mt-2 text-3xl font-semibold ${actionItemsCount > 0 ? 'text-amber-700' : 'text-slate-900'}`}
          >
            {actionItemsCount}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {actionItemsCount === 0
              ? 'No incoming sales'
              : actionItemsCount === 1
                ? 'Incoming sale awaiting your decision'
                : 'Incoming sales awaiting your decision'}
          </div>
        </Link>

        <Link
          href="/inventory"
          className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm hover:border-[#063359] hover:bg-slate-50 transition-colors"
        >
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Unprocessed
          </div>
          <div className="mt-2 text-3xl font-semibold text-slate-900">
            {unprocessedTonnes.toFixed(1)} t
          </div>
          <div className="mt-1 text-xs text-slate-500">
            On hand, ready to process
          </div>
        </Link>

        {isFinalBrand ? (
          <Link
            href="/certificates"
            className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm hover:border-[#063359] hover:bg-slate-50 transition-colors"
          >
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Certificates received
            </div>
            <div className="mt-2 text-3xl font-semibold text-slate-900">—</div>
            <div className="mt-1 text-xs text-slate-500">
              View provenance for incoming material
            </div>
          </Link>
        ) : (
          <Link
            href="/inventory"
            className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm hover:border-[#063359] hover:bg-slate-50 transition-colors"
          >
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Processed
            </div>
            <div className="mt-2 text-3xl font-semibold text-slate-900">
              {processedTonnes.toFixed(1)} t
            </div>
            <div className="mt-1 text-xs text-slate-500">Ready to sell</div>
          </Link>
        )}

        {isFinalBrand ? (
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm opacity-60">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Outgoing
            </div>
            <div className="mt-2 text-3xl font-semibold text-slate-900">—</div>
            <div className="mt-1 text-xs text-slate-500">
              Brands don&apos;t sell onward
            </div>
          </div>
        ) : (
          <Link
            href="/sales"
            className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm hover:border-[#063359] hover:bg-slate-50 transition-colors"
          >
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Outgoing pending
            </div>
            <div className="mt-2 text-3xl font-semibold text-slate-900">
              {outgoingPendingCount}
            </div>
            <div className="mt-1 text-xs text-slate-500">
              Sent to buyers, awaiting their response
            </div>
          </Link>
        )}
      </div>

      {/* Quick actions */}
      {(isFirstStage || !isFinalBrand || actionItemsCount > 0 || isAdmin) ? (
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
            Quick actions
          </h3>
          <div className="mt-3 flex flex-wrap gap-3">
            {isFirstStage ? (
              <QuickAction href="/purchases/new" label="+ New purchase" />
            ) : null}
            {isFinalBrand ? null : (
              <QuickAction href="/processing/new" label="+ New batch" />
            )}
            {isFinalBrand ? null : (
              <QuickAction href="/sales/new" label="+ New sale" />
            )}
            {actionItemsCount > 0 ? (
              <QuickAction
                href="/inbox"
                label={`Review inbox (${actionItemsCount})`}
                variant="primary"
              />
            ) : null}
            {isAdmin ? (
              <QuickAction
                href="/admin/invitations"
                label="Manage invitations"
                variant="ghost"
              />
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Recent activity feed */}
      <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-6 py-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
            Recent activity
          </h3>
        </div>
        {recentActivity.length === 0 ? (
          <p className="px-6 py-6 text-sm text-slate-500">
            No activity yet. Once your organization records purchases, batches,
            or sales, they&apos;ll appear here.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {recentActivity.map((event, idx) => (
              <li key={`${event.type}-${event.timestamp}-${idx}`}>
                <Link
                  href={event.href}
                  className="flex items-start gap-3 px-6 py-3 hover:bg-slate-50"
                >
                  <span className="text-lg leading-none mt-0.5">
                    {activityIcon(event.type)}
                  </span>
                  <div className="flex-1">
                    <div className="text-sm text-slate-900">{event.title}</div>
                    {event.subtitle ? (
                      <div className="font-mono text-xs text-slate-500">
                        {event.subtitle}
                      </div>
                    ) : null}
                  </div>
                  <span className="text-xs text-slate-500 whitespace-nowrap">
                    {relativeTime(event.timestamp)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function QuickAction({
  href,
  label,
  variant = 'default',
}: {
  href: string
  label: string
  variant?: 'default' | 'primary' | 'ghost'
}) {
  const base = 'rounded-md px-4 py-2 text-sm font-medium shadow-sm transition-colors'
  const styles =
    variant === 'primary'
      ? 'bg-[#063359] text-white hover:bg-[#0a4a7e]'
      : variant === 'ghost'
        ? 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
        : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
  return (
    <Link href={href} className={`${base} ${styles}`}>
      {label}
    </Link>
  )
}