import Link from 'next/link'
import { requireUser } from '@/lib/auth/requireUser'
import { createClient } from '@/lib/supabase/server'
import { approvePartnerRequest, rejectPartnerRequest } from './actions'

type PageProps = {
  searchParams: Promise<{
    submitted?: string
    approved?: string
    rejected?: string
    error?: string
  }>
}

type PartnerRequest = {
  id: string
  company_name: string
  contact_name: string | null
  contact_email: string | null
  country: string | null
  notes: string | null
  status: 'pending' | 'approved' | 'rejected'
  admin_notes: string | null
  created_at: string
  resolved_at: string | null
  resolved_org_id: string | null
  requested_by_org: { name: string } | null
  resolved_org: { name: string } | null
}

type Org = {
  id: string
  name: string
}

function statusBadge(status: PartnerRequest['status']) {
  const map: Record
    PartnerRequest['status'],
    { label: string; className: string }
  > = {
    pending: { label: 'Pending', className: 'bg-amber-100 text-amber-800' },
    approved: { label: 'Approved', className: 'bg-emerald-100 text-emerald-800' },
    rejected: { label: 'Rejected', className: 'bg-red-100 text-red-800' },
  }
  const s = map[status]
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${s.className}`}
    >
      {s.label}
    </span>
  )
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default async function PartnerRequestsPage({ searchParams }: PageProps) {
  const user = await requireUser()
  const { submitted, approved, rejected, error } = await searchParams
  const supabase = await createClient()

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()
  const isAdmin = profile?.role === 'admin'

  const { data: requests } = await supabase
    .from('partner_requests')
    .select(
      'id, company_name, contact_name, contact_email, country, notes, status, admin_notes, created_at, resolved_at, resolved_org_id, requested_by_org:requested_by_org_id(name), resolved_org:resolved_org_id(name)',
    )
    .order('created_at', { ascending: false })
    .returns<PartnerRequest[]>()

  const list = requests ?? []
  const pendingRows = list.filter((r) => r.status === 'pending')
  const historyRows = list.filter((r) => r.status !== 'pending')

  let orgs: Org[] = []
  if (isAdmin && pendingRows.length > 0) {
    const orgsRes = await supabase
      .from('organizations')
      .select('id, name')
      .order('name', { ascending: true })
      .returns<Org[]>()
    orgs = orgsRes.data ?? []
  }

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">
            Partner Requests
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            {isAdmin
              ? 'Review requests from partners to add new buyers. Approve or reject each request. Approved requests can be linked to the new organization once it appears via Salesforce sync.'
              : "Track requests you've submitted to add new buyers. Approved requests will appear in the Sales dropdown."}
          </p>
        </div>
        <Link
          href="/partner-requests/new"
          className="rounded-md bg-[#063359] px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-[#0a4a7e]"
        >
          + New request
        </Link>
      </div>

      {submitted ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          Your request was submitted. We&apos;ll review and get back to you.
        </div>
      ) : null}
      {approved ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          Request approved.
        </div>
      ) : null}
      {rejected ? (
        <div className="rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
          Request rejected.
        </div>
      ) : null}
      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Error: {error}
        </div>
      ) : null}

      {/* Pending */}
      <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-6 py-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
            Pending ({pendingRows.length})
          </h3>
        </div>
        {pendingRows.length === 0 ? (
          <p className="px-6 py-6 text-sm text-slate-500">
            No pending requests.
          </p>
        ) : (
          <div className="divide-y divide-slate-100">
            {pendingRows.map((r) => (
              <div key={r.id} className="px-6 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="text-base font-semibold text-slate-900">
                      {r.company_name}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      Requested by {r.requested_by_org?.name ?? 'Unknown'} on{' '}
                      {formatDate(r.created_at)}
                    </div>
                    <dl className="mt-3 grid grid-cols-1 gap-2 text-sm md:grid-cols-3">
                      {r.contact_name ? (
                        <div>
                          <dt className="text-xs uppercase text-slate-500">Contact</dt>
                          <dd className="text-slate-700">{r.contact_name}</dd>
                        </div>
                      ) : null}
                      {r.contact_email ? (
                        <div>
                          <dt className="text-xs uppercase text-slate-500">Email</dt>
                          <dd className="text-slate-700">{r.contact_email}</dd>
                        </div>
                      ) : null}
                      {r.country ? (
                        <div>
                          <dt className="text-xs uppercase text-slate-500">Country</dt>
                          <dd className="text-slate-700">{r.country}</dd>
                        </div>
                      ) : null}
                    </dl>
                    {r.notes ? (
                      <div className="mt-3 text-sm text-slate-600">
                        <span className="text-xs uppercase text-slate-500">Notes:</span>{' '}
                        {r.notes}
                      </div>
                    ) : null}
                  </div>
                  <div>{statusBadge(r.status)}</div>
                </div>

                {isAdmin ? (
                  <div className="mt-4 border-t border-slate-100 pt-4">
                    <form className="space-y-3">
                      <input type="hidden" name="request_id" value={r.id} />
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        <div>
                          <label className="mb-1 block text-xs font-medium text-slate-700">
                            Linked organization (after Salesforce sync)
                          </label>
                          <select
                            name="resolved_org_id"
                            defaultValue=""
                            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
                          >
                            <option value="">— Optional: pick the org —</option>
                            {orgs.map((o) => (
                              <option key={o.id} value={o.id}>
                                {o.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-slate-700">
                            Admin notes (optional)
                          </label>
                          <input
                            name="admin_notes"
                            type="text"
                            placeholder="Internal note about this decision"
                            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
                          />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="submit"
                          formAction={approvePartnerRequest}
                          className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-emerald-700"
                        >
                          Approve
                        </button>
                        <button
                          type="submit"
                          formAction={rejectPartnerRequest}
                          className="rounded-md border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
                        >
                          Reject
                        </button>
                      </div>
                    </form>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
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
                <th className="px-6 py-2 font-medium">Company</th>
                <th className="px-6 py-2 font-medium">Status</th>
                <th className="px-6 py-2 font-medium">Linked org</th>
                <th className="px-6 py-2 font-medium">Submitted</th>
                <th className="px-6 py-2 font-medium">Resolved</th>
                <th className="px-6 py-2 font-medium">Admin notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {historyRows.map((r) => (
                <tr key={r.id}>
                  <td className="px-6 py-3 text-slate-900">{r.company_name}</td>
                  <td className="px-6 py-3">{statusBadge(r.status)}</td>
                  <td className="px-6 py-3 text-slate-700">
                    {r.resolved_org?.name ?? '—'}
                  </td>
                  <td className="px-6 py-3 text-slate-500">
                    {formatDate(r.created_at)}
                  </td>
                  <td className="px-6 py-3 text-slate-500">
                    {r.resolved_at ? formatDate(r.resolved_at) : '—'}
                  </td>
                  <td className="px-6 py-3 text-slate-600">
                    {r.admin_notes ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  )
}