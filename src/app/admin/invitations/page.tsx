import { requireAdmin } from '@/lib/auth/requireAdmin'
import { createClient } from '@/lib/supabase/server'
import { createInvitation, revokeInvitation } from './actions'

type PageProps = {
  searchParams: Promise<{
    sent?: string
    email?: string
    error?: string
    revoked?: string
  }>
}

type Org = {
  id: string
  name: string
}

type Invitation = {
  id: string
  email: string
  role: 'admin' | 'partner'
  status: 'pending' | 'accepted' | 'expired' | 'revoked'
  created_at: string
  expires_at: string
  accepted_at: string | null
  organization: { name: string } | null
}

function errorCopy(code: string | undefined): string | null {
  if (!code) return null
  if (code === 'missing_email') return 'Please enter an email address.'
  if (code === 'missing_org') return 'Please pick an organization.'
  if (code === 'invalid_role') return 'Role must be admin or partner.'
  if (code === 'invalid_org') return 'That organization does not exist.'
  if (code === 'already_invited')
    return 'This email already has a pending invitation for that organization.'
  if (code === 'missing_id') return 'Invitation id was missing from the request.'
  if (code.startsWith('email_send_failed:'))
    return `Invitation row was created, but the magic link email failed to send. Details: ${code.slice('email_send_failed:'.length)}`
  return `Error: ${code}`
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

export default async function InvitationsPage({ searchParams }: PageProps) {
  const admin = await requireAdmin()
  const { sent, email, error, revoked } = await searchParams

  const supabase = await createClient()

  // Pull all orgs for the org selector AND the invitations list (cross-org).
  const [orgsRes, invsRes] = await Promise.all([
    supabase
      .from('organizations')
      .select('id, name')
      .order('name', { ascending: true })
      .returns<Org[]>(),
    supabase
      .from('invitations')
      .select(
        'id, email, role, status, created_at, expires_at, accepted_at, organization:organization_id(name)',
      )
      .order('created_at', { ascending: false })
      .returns<Invitation[]>(),
  ])

  const orgs = orgsRes.data ?? []
  const invitations = invsRes.data ?? []

  // Sort orgs so the admin's own org floats to the top, then alphabetical.
  const sortedOrgs = [...orgs].sort((a, b) => {
    if (a.id === admin.organization_id) return -1
    if (b.id === admin.organization_id) return 1
    return a.name.localeCompare(b.name)
  })

  const pendingRows = invitations.filter((r) => r.status === 'pending')
  const historyRows = invitations.filter((r) => r.status !== 'pending')

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">Invitations</h2>
        <p className="mt-1 text-sm text-slate-600">
          Invite new users into any organization. They&apos;ll receive a
          magic-link email and land signed in with the role you choose.
        </p>
      </div>

      {/* Flash messages */}
      {sent ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          Invitation sent to <strong>{email}</strong>. They should receive a
          sign-in email within a minute.
        </div>
      ) : null}
      {revoked ? (
        <div className="rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
          Invitation revoked.
        </div>
      ) : null}
      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {errorCopy(error)}
        </div>
      ) : null}

      {/* Invite form */}
      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
          Invite a new user
        </h3>
        <form action={createInvitation} className="mt-4 space-y-4">
          <div>
            <label
              htmlFor="email"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="off"
              placeholder="person@example.com"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 shadow-sm focus:border-[#063359] focus:outline-none focus:ring-1 focus:ring-[#063359]"
            />
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label
                htmlFor="organization_id"
                className="mb-1 block text-sm font-medium text-slate-700"
              >
                Organization
              </label>
              <select
                id="organization_id"
                name="organization_id"
                required
                defaultValue={admin.organization_id}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 shadow-sm focus:border-[#063359] focus:outline-none focus:ring-1 focus:ring-[#063359]"
              >
                {sortedOrgs.map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.name}
                    {org.id === admin.organization_id ? ' (your org)' : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                htmlFor="role"
                className="mb-1 block text-sm font-medium text-slate-700"
              >
                Role
              </label>
              <select
                id="role"
                name="role"
                defaultValue="partner"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 shadow-sm focus:border-[#063359] focus:outline-none focus:ring-1 focus:ring-[#063359]"
              >
                <option value="partner">Partner</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              className="rounded-md bg-[#063359] px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-[#0a4a7e] focus:outline-none focus:ring-2 focus:ring-[#063359] focus:ring-offset-2"
            >
              Send invitation
            </button>
          </div>
        </form>
      </div>

      {/* Pending */}
      <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-6 py-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
            Pending ({pendingRows.length})
          </h3>
        </div>
        {pendingRows.length === 0 ? (
          <p className="px-6 py-6 text-sm text-slate-500">
            No pending invitations.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-6 py-2 font-medium">Email</th>
                <th className="px-6 py-2 font-medium">Organization</th>
                <th className="px-6 py-2 font-medium">Role</th>
                <th className="px-6 py-2 font-medium">Sent</th>
                <th className="px-6 py-2 font-medium">Expires</th>
                <th className="px-6 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pendingRows.map((inv) => (
                <tr key={inv.id}>
                  <td className="px-6 py-3 text-slate-900">{inv.email}</td>
                  <td className="px-6 py-3 text-slate-700">
                    {inv.organization?.name ?? '—'}
                  </td>
                  <td className="px-6 py-3 text-slate-700">{inv.role}</td>
                  <td className="px-6 py-3 text-slate-500">
                    {formatDate(inv.created_at)}
                  </td>
                  <td className="px-6 py-3 text-slate-500">
                    {formatDate(inv.expires_at)}
                  </td>
                  <td className="px-6 py-3 text-right">
                    <form action={revokeInvitation}>
                      <input type="hidden" name="invitation_id" value={inv.id} />
                      <button
                        type="submit"
                        className="text-xs text-red-600 hover:text-red-800"
                      >
                        Revoke
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
                <th className="px-6 py-2 font-medium">Email</th>
                <th className="px-6 py-2 font-medium">Organization</th>
                <th className="px-6 py-2 font-medium">Role</th>
                <th className="px-6 py-2 font-medium">Status</th>
                <th className="px-6 py-2 font-medium">Sent</th>
                <th className="px-6 py-2 font-medium">Accepted</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {historyRows.map((inv) => (
                <tr key={inv.id}>
                  <td className="px-6 py-3 text-slate-900">{inv.email}</td>
                  <td className="px-6 py-3 text-slate-700">
                    {inv.organization?.name ?? '—'}
                  </td>
                  <td className="px-6 py-3 text-slate-700">{inv.role}</td>
                  <td className="px-6 py-3">
                    <span
                      className={
                        inv.status === 'accepted'
                          ? 'text-emerald-700'
                          : inv.status === 'revoked'
                            ? 'text-slate-500'
                            : 'text-amber-700'
                      }
                    >
                      {inv.status}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-slate-500">
                    {formatDate(inv.created_at)}
                  </td>
                  <td className="px-6 py-3 text-slate-500">
                    {inv.accepted_at ? formatDate(inv.accepted_at) : '—'}
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