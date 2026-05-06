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
  // Action items: incoming pending sales
  const actionItemsPromise = orgId
    ? supabase
        .from('sales')
        .select('id', { count: 'exact', head: true })
        .eq('buyer_org_id', orgId)
        .eq('status', 'pending')
    : Promise.resolve({ count: 0 } as { count: number | null })

  // Unprocessed inventory: sum of volume_remaining on raw_material_purchases
  const unprocessedPromise = orgId
    ? supabase
        .from('raw_material_purchases')
        .select('volume_remaining, volume')
        .eq('organization_id', orgId)
    : Promise.resolve({ data: [] } as { data: { volume_remaining: number; volume: number }[] })

  // Processed inventory: sum of volume_remaining on inventory_lots
  const processedPromise = orgId
    ? supabase
        .from('inventory_lots')
        .select('volume_remaining')
        .eq('organization_id', orgId)
    : Promise.resolve({ data: [] } as { data: { volume_remaining: number }[] })

  // Outgoing pending: count of sales sent and awaiting buyer
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

      {/* Quick actions — hidden if user has no available actions */}
      {(isFirstStage ||
        !isFinalBrand ||
        actionItemsCount > 0 ||
        isAdmin) ? (
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

      {/* Recent activity feed coming in Block 2 */}
      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
          Recent activity
        </h3>
        <p className="mt-2 text-sm text-slate-500">
          Activity feed coming next.
        </p>
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