import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

type LandbaseRow = {
  id: string
  name: string
  country: string | null
  eligibility_status: string
  monitoring_date: string | null
  verification_date: string | null
  expiration_date: string | null
  eligibility_report_url: string | null
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export default async function LandbasesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) { redirect('/login') }

  const { data: landbases } = await supabase
    .from('landbases')
    .select('id, name, country, eligibility_status, monitoring_date, verification_date, expiration_date, eligibility_report_url')
    .order('name', { ascending: true })
    .returns<LandbaseRow[]>()

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">Landbases</h2>
        <p className="mt-1 text-sm text-slate-600">All landbases visible to your organization, scoped by Row-Level Security.</p>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
        {!landbases || landbases.length === 0 ? (
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
              {landbases.map((lb) => (
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

      {landbases && landbases.length > 0 ? (
        <p className="text-xs text-slate-400">{landbases.length} landbases</p>
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