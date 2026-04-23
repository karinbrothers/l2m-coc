import Link from 'next/link'
import { requireUser } from '@/lib/auth/requireUser'
import { createClient } from '@/lib/supabase/server'
import { createPurchase } from '../actions'

type PageProps = {
  searchParams: Promise<{
    error?: string
  }>
}

type LandbaseOption = {
  id: string
  name: string
  country: string | null
  eligibility_status: string
}

function errorCopy(code: string | undefined): string | null {
  if (!code) return null
  if (code === 'missing_landbase') return 'Please choose a landbase.'
  if (code === 'invalid_volume') return 'Volume must be a positive number.'
  if (code === 'invalid_fibre') return 'Fibre diameter must be a positive number.'
  if (code === 'invalid_year') return 'Year of clip looks invalid.'
  if (code === 'landbase_not_found')
    return 'That landbase is not visible to your organization.'
  if (code === 'landbase_not_eligible')
    return 'That landbase is not currently eligible. Only eligible landbases can be sourced from.'
  if (code === 'code_conflict')
    return 'Two purchases were created at the same instant. Try again.'
  return `Error: ${code}`
}

export default async function NewPurchasePage({ searchParams }: PageProps) {
  await requireUser()
  const { error } = await searchParams

  const supabase = await createClient()

  const { data: landbases } = await supabase
    .from('landbases')
    .select('id, name, country, eligibility_status')
    .eq('eligibility_status', 'eligible')
    .order('name', { ascending: true })
    .returns<LandbaseOption[]>()

  const options = landbases ?? []
  const currentYear = new Date().getFullYear()
  const todayIso = new Date().toISOString().slice(0, 10)

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <div className="text-xs text-slate-500">
          <Link href="/purchases" className="hover:text-slate-700">
            ← Back to purchases
          </Link>
        </div>
        <h2 className="mt-2 text-2xl font-semibold text-slate-900">
          New purchase
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Record a raw wool purchase from an eligible landbase. A purchase code
          will be generated automatically.
        </p>
      </div>

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {errorCopy(error)}
        </div>
      ) : null}

      {options.length === 0 ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          No eligible landbases are visible to your organization yet. Ask an
          admin to add a landbase before recording a purchase.
        </div>
      ) : (
        <form
          action={createPurchase}
          className="space-y-5 rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
        >
          <div>
            <label
              htmlFor="landbase_id"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Landbase <span className="text-red-600">*</span>
            </label>
            <select
              id="landbase_id"
              name="landbase_id"
              required
              defaultValue=""
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm focus:border-[#063359] focus:outline-none focus:ring-1 focus:ring-[#063359]"
            >
              <option value="" disabled>
                Select an eligible landbase…
              </option>
              {options.map((lb) => (
                <option key={lb.id} value={lb.id}>
                  {lb.name}
                  {lb.country ? ` — ${lb.country}` : ''}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-500">
              Only landbases with status <em>eligible</em> are shown.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2">
              <label
                htmlFor="volume"
                className="mb-1 block text-sm font-medium text-slate-700"
              >
                Volume (tonnes) <span className="text-red-600">*</span>
              </label>
              <input
                id="volume"
                name="volume"
                type="number"
                required
                min="0"
                step="0.01"
                placeholder="e.g. 12.5"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 shadow-sm focus:border-[#063359] focus:outline-none focus:ring-1 focus:ring-[#063359]"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Commodity
              </label>
              <input
                value="Wool"
                disabled
                className="w-full cursor-not-allowed rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-slate-500 shadow-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="fibre_diameter"
                className="mb-1 block text-sm font-medium text-slate-700"
              >
                Fibre diameter (µm)
              </label>
              <input
                id="fibre_diameter"
                name="fibre_diameter"
                type="number"
                min="0"
                step="0.1"
                placeholder="e.g. 17.5"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 shadow-sm focus:border-[#063359] focus:outline-none focus:ring-1 focus:ring-[#063359]"
              />
            </div>
            <div>
              <label
                htmlFor="year_of_clip"
                className="mb-1 block text-sm font-medium text-slate-700"
              >
                Year of clip
              </label>
              <input
                id="year_of_clip"
                name="year_of_clip"
                type="number"
                min="1900"
                max={currentYear + 1}
                step="1"
                defaultValue={currentYear}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 shadow-sm focus:border-[#063359] focus:outline-none focus:ring-1 focus:ring-[#063359]"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="batch_number"
                className="mb-1 block text-sm font-medium text-slate-700"
              >
                Batch number
              </label>
              <input
                id="batch_number"
                name="batch_number"
                type="text"
                placeholder="Supplier reference"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 shadow-sm focus:border-[#063359] focus:outline-none focus:ring-1 focus:ring-[#063359]"
              />
            </div>
            <div>
              <label
                htmlFor="purchase_date"
                className="mb-1 block text-sm font-medium text-slate-700"
              >
                Purchase date
              </label>
              <input
                id="purchase_date"
                name="purchase_date"
                type="date"
                defaultValue={todayIso}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 shadow-sm focus:border-[#063359] focus:outline-none focus:ring-1 focus:ring-[#063359]"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
            <Link
              href="/purchases"
              className="rounded-md px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900"
            >
              Cancel
            </Link>
            <button
              type="submit"
              className="rounded-md bg-[#063359] px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-[#0a4a7e] focus:outline-none focus:ring-2 focus:ring-[#063359] focus:ring-offset-2"
            >
              Create purchase
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
