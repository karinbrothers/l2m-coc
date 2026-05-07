// src/app/admin/partners/page.tsx
//
// Admin-only page listing every organisation in the system with
// its users. Click "Sign in as [user]" next to any user to
// generate a one-time magic-link sign-in URL.

import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import ImpersonateButton from './ImpersonateButton'

export const dynamic = 'force-dynamic'

type ProfileRow = {
  id: string
  email: string | null
  organization_id: string | null
  role: string | null
}

type OrgRow = {
  id: string
  name: string
  supply_chain_stage: string | null
  is_first_stage_processor: boolean | null
  is_final_brand: boolean | null
}

function stageLabel(o: OrgRow): string {
  if (o.supply_chain_stage === 'first_stage_processor') return 'First-stage processor'
  if (o.supply_chain_stage === 'middle_stage_processor') return 'Middle-stage processor'
  if (o.supply_chain_stage === 'final_stage_processor') return 'Final-stage processor'
  if (o.supply_chain_stage === 'final_brand') return 'Final brand'
  if (o.is_final_brand) return 'Final brand'
  if (o.is_first_stage_processor) return 'First-stage processor'
  return 'Processor'
}

export default async function AdminPartnersPage() {
  // Use the admin client so we read every org/profile regardless
  // of RLS. Page itself is gated by /admin/layout.tsx.
  const admin = createAdminClient()

  const [{ data: orgs }, { data: profiles }] = await Promise.all([
    admin.from('organizations').select(
      'id, name, supply_chain_stage, is_first_stage_processor, is_final_brand',
    ).order('name'),
    admin.from('profiles').select('id, email, organization_id, role').order('email'),
  ])

  const orgList = (orgs ?? []) as OrgRow[]
  const profileList = (profiles ?? []) as ProfileRow[]
  const profilesByOrg = new Map<string, ProfileRow[]>()
  for (const p of profileList) {
    if (!p.organization_id) continue
    const list = profilesByOrg.get(p.organization_id) ?? []
    list.push(p)
    profilesByOrg.set(p.organization_id, list)
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs text-slate-500">
          <Link href="/" className="hover:text-slate-700">
            ← Back to dashboard
          </Link>
        </div>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">
          Partners
        </h1>
        <p className="mt-1 text-sm text-slate-600 max-w-2xl">
          Every organisation in the system. Generate a one-time sign-in link
          for any user — useful for verifying what a partner sees, or
          stepping in to fix something on their behalf.
        </p>
      </div>

      <div className="space-y-4">
        {orgList.map((org) => {
          const users = profilesByOrg.get(org.id) ?? []
          return (
            <section
              key={org.id}
              className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
            >
              <div className="flex items-baseline justify-between gap-3">
                <div>
                  <div className="text-lg font-semibold text-slate-900">
                    {org.name}
                  </div>
                  <div className="text-xs text-slate-500">
                    {stageLabel(org)}
                  </div>
                </div>
                <div className="text-xs text-slate-500">
                  {users.length} user{users.length === 1 ? '' : 's'}
                </div>
              </div>

              <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
                {users.length === 0 ? (
                  <p className="text-xs italic text-slate-500">
                    No users yet.{' '}
                    <Link
                      href="/admin/invitations"
                      className="underline"
                      style={{ color: '#063359' }}
                    >
                      Send an invitation →
                    </Link>
                  </p>
                ) : (
                  users.map((u) => (
                    <div
                      key={u.id}
                      className="flex flex-wrap items-start justify-between gap-3"
                    >
                      <div className="flex-1 min-w-[240px]">
                        <div className="text-sm text-slate-900 font-mono">
                          {u.email ?? '—'}
                        </div>
                        {u.role ? (
                          <div className="text-xs text-slate-500">
                            {u.role}
                          </div>
                        ) : null}
                      </div>
                      <ImpersonateButton
                        email={u.email ?? ''}
                        label={org.name}
                      />
                    </div>
                  ))
                )}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}