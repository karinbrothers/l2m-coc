import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

type OrgRow = {
  id: string
  name: string
  type: string
}

type ProfileRow = {
  id: string
  email: string | null
  full_name: string | null
  role: 'admin' | 'member'
  organization_id: string | null
  organizations: OrgRow | null
}

type LandbaseRow = {
  id: string
  name: string
  country: string | null
  eligibility_status: string
  expiration_date: string | null
}

export default async function Home() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Defense in depth — middleware should already have redirected.
  if (!user) {
    redirect('/login')
  }

  // Fetch the signed-in user's profile with their org embedded.
  const { data: profileRaw } = await supabase
    .from('profiles')
    .select(
      `
      id,
      email,
      full_name,
      role,
      organization_id,
      organizations:organization_id ( id, name, type )
      `,
    )
    .eq('id', user.id)
    .single<ProfileRow>()

  const profile = profileRaw
  const isAdmin = profile?.role === 'admin'
  const orgName = profile?.organizations?.name ?? null
  const orgType = profile?.organizations?.type ?? null

  // RLS-aware counts. Admins see everything; members see only their org's
  // rows via the policies defined in 03_rls_policies.sql. The SAME query
  // returns different numbers depending on who's signed in — that IS the
  // RLS proof.
  const [
    { count: orgsCount },
    { count: landbasesCount },
    { count: purchasesCount },
    { count: batchesCount },
  ] = await Promise.all([
    supabase.from('organizations').select('id', { count: 'exact', head: true }),
    supabase.from('landbases').select('id', { count: 'exact', head: true }),
    supabase
      .from('raw_material_purchases')
      .select('id', { count: 'exact', head: true }),
    supabase
      .from('processing_batches')
      .select('id', { count: 'exact', head: true }),
  ])

  // Pull the 5 most recent landbases visible to this user.
  const { data: recentLandbases } = await supabase
    .from('landbases')
    .select('id, name, country, eligibility_status, expiration_date')
    .order('monitoring_date', { ascending: false, nullsFirst: false })
    .limit(5)
    .returns<LandbaseRow[]>()

  return (
    <div className="space-y-8">
      {/* Greeting */}
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">
          Welcome back{profile?.full_name ? `, ${profile.full_name}` : ''}
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          {orgName ? (
            <>
              Signed in to <strong>{orgName}</strong>
              {orgType ? (
                <span className="ml-1 text-slate-500">({orgType})</span>
              ) : null}
              <span className="mx-2 text-slate-300">·</span>
              <span className={isAdmin ? 'text-amber-700' : 'text-slate-600'}>
                {isAdmin ? 'Admin' : 'Member'}
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

      {/* Metric cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <MetricCard
          label={isAdmin ? 'Organizations' : 'Your organization'}
          value={isAdmin ? (orgsCount ?? 0) : 1}
          hint={isAdmin ? 'Total in system' : orgName ?? ''}
        />
        <MetricCard
          label="Landbases"
          value={landbasesCount ?? 0}
          hint={isAdmin ? 'All orgs' : 'Visible to your org'}
        />
        <MetricCard
          label="Purchases"
          value={purchasesCount ?? 0}
          hint={isAdmin ? 'All orgs' : 'Visible to your org'}
        />
        <MetricCard
          label="Processing batches"
          value={batchesCount ?? 0}
          hint={isAdmin ? 'All orgs' : 'Visible to your org'}
        />
      </div>

      {/* Recent landbases */}
      <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-6 py-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
            Recent landbases
          </h3>
        </div>
        {!recentLandbases || recentLandbases.length === 0 ? (
          <p className="px-6 py-6 text-sm text-slate-500">
            No landbases visible.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-6 py-2 font-medium">Name</th>
                <th className="px-6 py-2 font-medium">Country</th>
                <th className="px-6 py-2 font-medium">Status</th>
                <th className="px-6 py-2 font-medium">Expires</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {recentLandbases.map((lb) => (
                <tr key={lb.id}>
                  <td className="px-6 py-3 text-slate-900">{lb.name}</td>
                  <td className="px-6 py-3 text-slate-700">{lb.country ?? '—'}</td>
                  <td className="px-6 py-3">
                    <StatusBadge status={lb.eligibility_status} />
                  </td>
                  <td className="px-6 py-3 text-slate-500">
                    {lb.expiration_date
                      ? new Date(lb.expiration_date).toLocaleDateString()
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p className="text-xs text-slate-400">
        All counts and rows above are filtered by Row-Level Security. A member
        of a different organization would see only their own data on this
        exact page.
      </p>
    </div>
  )
}

function MetricCard({
  label,
  value,
  hint,
}: {
  label: string
  value: number
  hint?: string
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className="mt-2 text-3xl font-semibold text-slate-900">{value}</div>
      {hint ? <div className="mt-1 text-xs text-slate-500">{hint}</div> : null}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === 'eligible'
      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
      : status === 'expired'
        ? 'bg-red-50 text-red-800 border-red-200'
        : 'bg-slate-50 text-slate-700 border-slate-200'
  return (
    <span
      className={`inline-flex rounded border px-2 py-0.5 text-xs font-medium ${tone}`}
    >
      {status}
    </span>
  )
}
