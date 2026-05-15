// src/app/profile/page.tsx
//
// Simple profile editor — the user can update their full name,
// which is the name that appears on every certificate attestation
// footer they sign going forward. Email is shown but not editable
// here (changing email goes through Supabase Auth).

import Link from 'next/link'
import { requireUser } from '@/lib/auth/requireUser'
import { createClient } from '@/lib/supabase/server'
import { updateFullName } from './actions'

type PageProps = {
  searchParams: Promise<{ saved?: string; error?: string }>
}

export default async function ProfilePage({ searchParams }: PageProps) {
  const user = await requireUser()
  const { saved, error } = await searchParams
  const supabase = await createClient()

  const [{ data: profile }, { data: org }] = await Promise.all([
    supabase
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .maybeSingle(),
    supabase
      .from('organizations')
      .select('name')
      .eq('id', user.organization_id)
      .maybeSingle(),
  ])

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">Profile</h2>
        <p className="mt-1 text-sm text-slate-600">
          Your name and organization appear on every certificate you attest.
          Keep your name accurate so chain partners and L2M auditors know
          exactly who confirmed each step.
        </p>
      </div>

      {saved ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          Saved.
        </div>
      ) : null}
      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {error === 'name_required'
            ? 'Please enter your full name.'
            : `Error: ${error}`}
        </div>
      ) : null}

      <form
        action={updateFullName}
        className="space-y-5 rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
      >
        <div>
          <label
            htmlFor="full_name"
            className="mb-1 block text-sm font-medium text-slate-700"
          >
            Full name <span className="text-red-600">*</span>
          </label>
          <input
            id="full_name"
            name="full_name"
            type="text"
            required
            defaultValue={profile?.full_name ?? ''}
            placeholder="e.g. Joe Smith"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 shadow-sm focus:border-[#063359] focus:outline-none focus:ring-1 focus:ring-[#063359]"
          />
        </div>

        <div className="grid grid-cols-2 gap-4 border-t border-slate-100 pt-5">
          <div>
            <div className="text-xs font-medium text-slate-500 uppercase">
              Email
            </div>
            <div className="mt-1 text-sm text-slate-700">
              {user.email ?? '—'}
            </div>
          </div>
          <div>
            <div className="text-xs font-medium text-slate-500 uppercase">
              Organization
            </div>
            <div className="mt-1 text-sm text-slate-700">
              {org?.name ?? '—'}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
          <Link
            href="/"
            className="rounded-md px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900"
          >
            Cancel
          </Link>
          <button
            type="submit"
            className="rounded-md bg-[#063359] px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-[#0a4a7e] focus:outline-none focus:ring-2 focus:ring-[#063359] focus:ring-offset-2"
          >
            Save
          </button>
        </div>
      </form>
    </div>
  )
}