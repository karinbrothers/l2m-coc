import Link from 'next/link'
import { requireUser } from '@/lib/auth/requireUser'
import { createPartnerRequest } from '../actions'

type PageProps = {
  searchParams: Promise<{ error?: string }>
}

function errorCopy(code: string | undefined): string | null {
  if (!code) return null
  if (code === 'missing_company_name') return 'Please enter a company name.'
  return `Error: ${code}`
}

export default async function NewPartnerRequestPage({ searchParams }: PageProps) {
  await requireUser()
  const { error } = await searchParams

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <div className="text-xs text-slate-500">
          <Link href="/sales/new" className="hover:text-slate-700">
            ← Back to new sale
          </Link>
        </div>
        <h2 className="mt-2 text-2xl font-semibold text-slate-900">
          Request a new partner
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Don&apos;t see your buyer in the dropdown? Send us a request to add
          them. An L2M admin will review and add the company; once Salesforce
          syncs they&apos;ll appear as a selectable buyer.
        </p>
      </div>

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {errorCopy(error)}
        </div>
      ) : null}

      <form
        action={createPartnerRequest}
        className="space-y-5 rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
      >
        <div>
          <label
            htmlFor="company_name"
            className="mb-1 block text-sm font-medium text-slate-700"
          >
            Company name <span className="text-red-600">*</span>
          </label>
          <input
            id="company_name"
            name="company_name"
            type="text"
            required
            placeholder="e.g. Acme Brands Inc."
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 shadow-sm focus:border-[#063359] focus:outline-none focus:ring-1 focus:ring-[#063359]"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label
              htmlFor="contact_name"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Contact name
            </label>
            <input
              id="contact_name"
              name="contact_name"
              type="text"
              placeholder="e.g. Jane Doe"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 shadow-sm focus:border-[#063359] focus:outline-none focus:ring-1 focus:ring-[#063359]"
            />
          </div>
          <div>
            <label
              htmlFor="contact_email"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Contact email
            </label>
            <input
              id="contact_email"
              name="contact_email"
              type="email"
              placeholder="jane@acme.com"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 shadow-sm focus:border-[#063359] focus:outline-none focus:ring-1 focus:ring-[#063359]"
            />
          </div>
        </div>

        <div>
          <label
            htmlFor="country"
            className="mb-1 block text-sm font-medium text-slate-700"
          >
            Country
          </label>
          <input
            id="country"
            name="country"
            type="text"
            placeholder="e.g. United States"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 shadow-sm focus:border-[#063359] focus:outline-none focus:ring-1 focus:ring-[#063359]"
          />
        </div>

        <div>
          <label
            htmlFor="notes"
            className="mb-1 block text-sm font-medium text-slate-700"
          >
            Notes
          </label>
          <textarea
            id="notes"
            name="notes"
            rows={3}
            placeholder="Anything that would help us find or add the company faster."
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 shadow-sm focus:border-[#063359] focus:outline-none focus:ring-1 focus:ring-[#063359]"
          />
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
          <Link
            href="/sales/new"
            className="rounded-md px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900"
          >
            Cancel
          </Link>
          <button
            type="submit"
            className="rounded-md bg-[#063359] px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-[#0a4a7e] focus:outline-none focus:ring-2 focus:ring-[#063359] focus:ring-offset-2"
          >
            Submit request
          </button>
        </div>
      </form>
    </div>
  )
}