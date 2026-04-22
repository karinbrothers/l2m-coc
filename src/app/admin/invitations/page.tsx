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

type Invitation = {
  id: string
  email: string
  role: 'admin' | 'member'
  status: 'pending' | 'accepted' | 'expired' | 'revoked'
  created_at: string
  expires_at: string
  accepted_at: string | null
}

function errorCopy(code: string | undefined): string | null {
  if (!code) return null
  if (code === 'missing_email') return 'Please enter an email address.'
  if (code === 'invalid_role') return 'Role must be admin or member.'
  if (code === 'already_invited')
    return 'This email already has a pending invitation for your organization.'
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
  const { data: invitations } = await supabase
    .from('invitations')
    .select('id, email, role, status, created_at, expires_at, accepted_at')
    .eq('organization_id', admin.organization_id)
    .order('created_at', { ascending: false })
    .returns<Invitation[]>()

  const rows = invitations ?? []
  const pendingRows = rows.filter((r) => r.status === 'pending')
  const historyRows = rows.filter((r) => r.status !== 'pending')

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">Invitations</h2>
        <p className="mt-1 text-sm text-slate-600">
          Invite new users into your organization. They&apos;ll receive a
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
        <form action={createInvitation} className="mt-4 flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[260px]">
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
              defaultValue="member"
              className="rounded-md border border-slate-300 px-3 py-2 text-slate-900 shadow-sm focus:border-[#063359] focus:outline-none focus:ring-1 focus:ring-[#063359]"
            >
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <button
            type="submit"
            className="rounded-md bg-[#063359] px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-[#0a4a7e] focus:outline-none focus:ring-2 focus:ring-[#063359] focus:ring-offset-2"
          >
            Send invitation
          </button>
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
