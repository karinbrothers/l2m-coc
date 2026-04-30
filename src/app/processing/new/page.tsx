import Link from 'next/link'
import { requireUser } from '@/lib/auth/requireUser'
import { createClient } from '@/lib/supabase/server'
import { createProcessingBatch } from '../actions'

type PageProps = {
  searchParams: Promise<{ error?: string }>
}

type AvailablePurchase = {
  id: string
  code: string
  volume_remaining: number
  volume_unit: string
  landbases: { name: string } | null
}

function errorCopy(code: string | undefined): string | null {
  if (!code) return null
  if (code === 'missing_output_product')
    return 'Please enter an output product name.'
  if (code === 'invalid_output_volume')
    return 'Output volume must be a positive number.'
  if (code === 'invalid_input_volume')
    return 'Each input volume must be a positive number.'
  if (code === 'no_inputs')
    return 'Pick at least one raw purchase and enter how much you used.'
  if (code === 'insufficient_input_volume')
    return 'You tried to use more volume than is remaining on a raw purchase.'
  if (code === 'input_not_found')
    return 'A selected raw purchase is not available to your organization.'
  if (code === 'no_organization')
    return 'Your account is not part of an organization.'
  return `Error: ${code}`
}

export default async function NewProcessingBatchPage({
  searchParams,
}: PageProps) {
  await requireUser()
  const { error } = await searchParams
  const supabase = await createClient()

  const { data: purchases } = await supabase
    .from('raw_material_purchases')
    .select(
      'id, code, volume_remaining, volume_unit, landbases:landbase_id(name)',
    )
    .gt('volume_remaining', 0)
    .order('code')
    .returns<AvailablePurchase[]>()

  const options = purchases ?? []
  const todayIso = new Date().toISOString().slice(0, 10)

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <div className="text-xs text-slate-500">
          <Link href="/processing" className="hover:text-slate-700">
            ← Back to processing
          </Link>
        </div>
        <h2 className="mt-2 text-2xl font-semibold text-slate-900">
          New processing batch
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Convert raw purchases into a single inventory lot. Enter how much
          volume each raw purchase contributes — leave at 0 to skip.
        </p>
      </div>

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {errorCopy(error)}
        </div>
      ) : null}

      {options.length === 0 ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          No raw purchases with remaining volume. Record a purchase first.
        </div>
      ) : (
        <form
          action={createProcessingBatch}
          className="space-y-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
        >
          <div>
            <h3 className="text-sm font-semibold text-slate-700">Inputs</h3>
            <p className="mt-1 text-xs text-slate-500">
              Volume to draw from each raw purchase. Leave at 0 to skip.
            </p>
            <div className="mt-3 divide-y divide-slate-100 rounded-md border border-slate-200">
              {options.map((p) => (
                <div key={p.id} className="flex items-center gap-4 px-4 py-3">
                  <div className="flex-1">
                    <div className="font-mono text-xs text-slate-700">
                      {p.code}
                    </div>
                    <div className="text-xs text-slate-500">
                      {p.landbases?.name ?? 'Unknown landbase'} —{' '}
                      {Number(p.volume_remaining)} {p.volume_unit} remaining
                    </div>
                  </div>
                  <input
                    name={`volume[${p.id}]`}
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0"
                    className="w-32 rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-900 shadow-sm focus:border-[#063359] focus:outline-none focus:ring-1 focus:ring-[#063359]"
                  />
                  <span className="w-16 text-xs text-slate-500">
                    {p.volume_unit}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 border-t border-slate-100 pt-6">
            <div>
              <label
                htmlFor="output_product"
                className="mb-1 block text-sm font-medium text-slate-700"
              >
                Output product <span className="text-red-600">*</span>
              </label>
              <input
                id="output_product"
                name="output_product"
                type="text"
                required
                placeholder="e.g. Greasy wool, scoured wool, top"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 shadow-sm focus:border-[#063359] focus:outline-none focus:ring-1 focus:ring-[#063359]"
              />
            </div>
            <div>
              <label
                htmlFor="output_volume"
                className="mb-1 block text-sm font-medium text-slate-700"
              >
                Output volume (tonnes) <span className="text-red-600">*</span>
              </label>
              <input
                id="output_volume"
                name="output_volume"
                type="number"
                required
                min="0"
                step="0.01"
                placeholder="e.g. 3.5"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 shadow-sm focus:border-[#063359] focus:outline-none focus:ring-1 focus:ring-[#063359]"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="processing_method"
                className="mb-1 block text-sm font-medium text-slate-700"
              >
                Processing method
              </label>
              <input
                id="processing_method"
                name="processing_method"
                type="text"
                placeholder="e.g. Scoured, carded"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 shadow-sm focus:border-[#063359] focus:outline-none focus:ring-1 focus:ring-[#063359]"
              />
            </div>
            <div>
              <label
                htmlFor="processing_date"
                className="mb-1 block text-sm font-medium text-slate-700"
              >
                Processing date
              </label>
              <input
                id="processing_date"
                name="processing_date"
                type="date"
                defaultValue={todayIso}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 shadow-sm focus:border-[#063359] focus:outline-none focus:ring-1 focus:ring-[#063359]"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="subcontractors"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Subcontractors / processors
            </label>
            <input
              id="subcontractors"
              name="subcontractors"
              type="text"
              placeholder="Optional — e.g. Acme Scouring Co."
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 shadow-sm focus:border-[#063359] focus:outline-none focus:ring-1 focus:ring-[#063359]"
            />
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
            <Link
              href="/processing"
              className="rounded-md px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900"
            >
              Cancel
            </Link>
            <button
              type="submit"
              className="rounded-md bg-[#063359] px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-[#0a4a7e] focus:outline-none focus:ring-2 focus:ring-[#063359] focus:ring-offset-2"
            >
              Record batch
            </button>
          </div>
        </form>
      )}
    </div>
  )
}