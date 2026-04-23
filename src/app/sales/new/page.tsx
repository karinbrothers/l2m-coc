import Link from 'next/link'
import { requireUser } from '@/lib/auth/requireUser'
import { createClient } from '@/lib/supabase/server'
import { createSale } from '../actions'

type PageProps = {
  searchParams: Promise<{ error?: string }>
}

type LandbaseLite = { id: string; name: string; country: string | null }

type AvailablePurchase = {
  id: string
  code: string
  volume_remaining: number
  volume_unit: string
  landbases: LandbaseLite | null
}

function errorCopy(code: string | undefined): string | null {
  if (!code) return null
  if (code === 'missing_source') return 'Please choose a source purchase.'
  if (code === 'missing_buyer') return 'Please enter a buyer name.'
  if (code === 'invalid_volume') return 'Volume must be a positive number.'
  if (code === 'insufficient_volume')
    return 'Not enough remaining volume on that source purchase. Try a smaller amount or pick another source.'
  if (code === 'source_not_found')
    return 'That source purchase is not available to your organization.'
  if (code === 'no_organization')
    return 'Your account is not part of an organization.'
  return `Error: ${code}`
}

export default async function NewSalePage({ searchParams }: PageProps) {
  await requireUser()
  const { error } = await searchParams
  const supabase = await createClient()

  const { data: purchases } = await supabase
    .from('raw_material_purchases')
    .select(
      'id, code, volume_remaining, volume_unit, landbases:landbase_id ( id, name, country )',
    )
    .gt('volume_remaining', 0)
    .order('code', { ascending: true })
    .returns<AvailablePurchase[]>()

  const options = purchases ?? []
  const todayIso = new Date().toISOString().slice(0, 10)

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <div className="text-xs text-slate-500">
          <Link href="/sales" className="hover:text-slate-700">
            ← Back to sales
          </Link>
        </div>
        <h2 className="mt-2 text-2xl font-semibold text-slate-900">New sale</h2>
        <p className="mt-1 text-sm text-slate-600">
          Record a sale drawn from an existing raw material purchase. The
          purchase&apos;s remaining volume is decremented atomically.
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
          action={createSale}
          className="space-y-5 rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
        >
          <div>
            <label
              htmlFor="source_purchase_id"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Source purchase <span className="text-red-600">*</span>
            </label>
            <select
              id="source_purchase_id"
              name="source_purchase_id"
              required
              defaultValue=""
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm focus:border-[#063359] focus:outline-none focus:ring-1 focus:ring-[#063359]"
            >
              <option value="" disabled>
                Select a purchase with remaining volume…
              </option>
              {options.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} — {p.landbases?.name ?? 'Unknown landbase'} —{' '}
                  {Number(p.volume_remaining)} {p.volume_unit} remaining
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="buyer_name"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Buyer <span className="text-red-600">*</span>
            </label>
            <input
              id="buyer_name"
              name="buyer_name"
              type="text"
              required
              placeholder="e.g. Patagonia Inc."
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 shadow-sm focus:border-[#063359] focus:outline-none focus:ring-1 focus:ring-[#063359]"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
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
                placeholder="e.g. 3.0"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 shadow-sm focus:border-[#063359] focus:outline-none focus:ring-1 focus:ring-[#063359]"
              />
            </div>
            <div>
              <label
                htmlFor="sale_date"
                className="mb-1 block text-sm font-medium text-slate-700"
              >
                Sale date
              </label>
              <input
                id="sale_date"
                name="sale_date"
                type="date"
                defaultValue={todayIso}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 shadow-sm focus:border-[#063359] focus:outline-none focus:ring-1 focus:ring-[#063359]"
              />
            </div>
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
              placeholder="Optional — contract reference, shipment details, etc."
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 shadow-sm focus:border-[#063359] focus:outline-none focus:ring-1 focus:ring-[#063359]"
            />
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
            <Link
              href="/sales"
              className="rounded-md px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900"
            >
              Cancel
            </Link>
            <button
              type="submit"
              className="rounded-md bg-[#063359] px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-[#0a4a7e] focus:outline-none focus:ring-2 focus:ring-[#063359] focus:ring-offset-2"
            >
              Record sale
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
