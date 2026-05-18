import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import LandbaseMap, { type LandbasePin } from './LandbaseMap'

type LandbaseRow = {
  id: string
  name: string
  country: string | null
  eligibility_status: string
  monitoring_date: string | null
  verification_date: string | null
  expiration_date: string | null
  eligibility_report_url: string | null
  latitude: number | null
  longitude: number | null
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

// Supabase's REST API caps a single query at 1000 rows by
// default. We have well over that, so paginate explicitly via
// .range() until we run out. Fine for our scale (<10k rows);
// if we ever get to 100k+ landbases we should revisit.
async function fetchAllLandbases(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<LandbaseRow[]> {
  const pageSize = 1000
  const all: LandbaseRow[] = []
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('landbases')
      .select(
        'id, name, country, eligibility_status, monitoring_date, verification_date, expiration_date, eligibility_report_url, latitude, longitude',
      )
      .order('name', { ascending: true })
      .range(from, from + pageSize - 1)
      .returns<LandbaseRow[]>()
    if (error) {
      console.error('[landbases page] fetch error:', error.message)
      break
    }
    const chunk = data ?? []
    all.push(...chunk)
    if (chunk.length < pageSize) break
    from += pageSize
  }
  return all
}

export default async function LandbasesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) { redirect('/login') }

  const all = await fetchAllLandbases(supabase)

  // Map needs only landbases with coordinates. Anything without
  // lat/long in Salesforce is skipped on the map but still
  // listed in the table below.
  const pins: LandbasePin[] = all
    .filter(
      (lb): lb is LandbaseRow & { latitude: number; longitude: number } =>
        typeof lb.latitude === 'number' && typeof lb.longitude === 'number',
    )
    .map((lb) => ({
      id: lb.id,
      name: lb.name,
      country: lb.country,
      eligibility_status: lb.eligibility_status,
      verification_date: lb.verification_date,
      expiration_date: lb.expiration_date,
      latitude: lb.latitude,
      longitude: lb.longitude,
    }))

  const missingCoords = all.length - pins.length

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">Landbases</h2>
        <p className="mt-1 text-sm text-slate-600">All landbases visible to your organization, scoped by Row-Level Security.</p>
      </div>

      {/* Map sits above the table. If no coordinates are synced
          yet, we skip the map block entirely so the page doesn't
          look broken. */}
      {pins.length > 0 ? (
        <div className="space-y-2">
          <LandbaseMap pins={pins} />
          {missingCoords > 0 ? (
            <p className="text-xs text-slate-500">
              {missingCoords} landbase{missingCoords === 1 ? '' : 's'} not shown
              on the map (no coordinates in Salesforce yet).
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
        {all.length === 0 ? (
          <p className="px-6 py-6 text-sm text-slate-500">No landbases visible.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-6 py-2 font-medium">Name</th>
                <th className="px-6 py-2 font-medium">Country</th>
                <th className="px-6 py-2 font-medium">Status</th>
                <th className="px-6 py-2 font-medium">Verified</th>
                <th className="px-6 py-2 font-medium">Expires</th>
                <th className="px-6 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {all.map((lb) => (
                <tr key={lb.id}>
                  <td className="px-6 py-3 text-slate-900">{lb.name}</td>
                  <td className="px-6 py-3 text-slate-700">{lb.country ?? '—'}</td>
                  <td className="px-6 py-3"><StatusBadge status={lb.eligibility_status} /></td>
                  <td className="px-6 py-3 text-slate-500">{formatDate(lb.verification_date)}</td>
                  <td className="px-6 py-3 text-slate-500">{formatDate(lb.expiration_date)}</td>
                  <td className="px-6 py-3 text-right"><ReportLink url={lb.eligibility_report_url} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {all.length > 0 ? (
        <p className="text-xs text-slate-400">{all.length} landbases</p>
      ) : null}
    </div>
  )
}

function ReportLink({ url }: { url: string | null }) {
  if (!url) { return <span className="text-xs text-slate-400">No report</span> }
  return <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs font-medium hover:underline" style={{ color: '#063359' }}>View eligibility report →</a>
}

function StatusBadge({ status }: { status: string }) {
  const label = status.charAt(0).toUpperCase() + status.slice(1)
  const tone =
    status === 'eligible' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' :
    status === 'ineligible' ? 'bg-red-50 text-red-800 border-red-200' :
    status === 'expired' ? 'bg-amber-50 text-amber-800 border-amber-200' :
    status === 'suspended' ? 'bg-amber-50 text-amber-800 border-amber-200' :
    'bg-slate-50 text-slate-700 border-slate-200'
  return <span className={`inline-flex rounded border px-2 py-0.5 text-xs font-medium ${tone}`}>{label}</span>
}