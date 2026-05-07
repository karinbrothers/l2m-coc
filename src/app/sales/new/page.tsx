import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth/requireUser'
import { createClient } from '@/lib/supabase/server'
import { createSale } from '../actions'

type PageProps = {
  searchParams: Promise<{ error?: string }>
}

type AvailableLot = {
  id: string
  code: string
  product_name: string
  volume_remaining: number
  volume_unit: string
}

type Org = {
  id: string
  name: string
}

function errorCopy(code: string | undefined): string | null {
  if (!code) return null
  if (code === 'missing_source') return 'Please choose an inventory lot.'
  if (code === 'missing_buyer_org') return 'Please pick a buyer.'
  if (code === 'invalid_buyer_org')
    return 'That buyer organization does not exist.'
  if (code === 'invalid_volume') return 'Volume must be a positive number.'
  if (code === 'insufficient_volume')
    return 'Not enough remaining volume on that inventory lot. Try a smaller amount or pick another lot.'
  if (code === 'lot_not_found')
    return 'That inventory lot is not available to your organization.'
  if (code === 'no_organization')
    return 'Your account is not part of an organization.'
  return `Error: ${code}`
}

export default async function NewSalePage({ searchParams }: PageProps) {
  const user = await requireUser()
  const { error } = await searchParams
  const supabase = await createClient()

  // Final brands don't sell onward — bounce them back
  const { data: myOrg } = await supabase
    .from('organizations')
    .select('is_final_brand')
    .eq('id', user.organization_id)
    .maybeSingle()

  if (myOrg?.is_final_brand) {
    redirect('/sales?error=final_brand')
  }

  const [lotsRes, orgsRes] = await Promise.all([
    supabase
      .from('inventory_lots')
      .select('id, code, product_name, volume_remaining, volume_unit')
      .eq('organization_id', user.organization_id)
      .gt('volume_remaining', 0)
      .order('code', { ascending: true })
      .returns<AvailableLot[]>(),
    // Buyers can be mid-stream processors or final brands, but never
    // first-stage processors (those only source from landbases)
    supabase
      .from('organizations')
      .select('id, name')
      .neq('id', user.organization_id)
      .eq('is_first_stage_processor', false)
      .order('name', { ascending: true })
      .returns<Org[]>(),
  ])

  const options = lotsRes.data ?? []
  const orgs = orgsRes.data ?? []
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
          Record a sale drawn from a processed inventory lot. The buyer will
          see this in their inbox and can accept or reject.
        </p>
      </div>

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {errorCopy(error)}
        </div>
      ) : null}

      {options.length === 0 ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          No inventory lots with remaining volume. Process unprocessed material first.
        </div>
      ) : (
        <form
          action={createSale}
          className="space-y-5 rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
        >
          <div>
            <label
              htmlFor="inventory_lot_id"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Inventory lot <span className="text-red-600">*</span>
            </label>
            <select
              id="inventory_lot_id"
              name="inventory_lot_id"
              required
              defaultValue=""
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm focus:border-[#063359] focus:outline-none focus:ring-1 focus:ring-[#063359]"
            >
              <option value="" disabled>
                Select a lot with remaining volume…
              </option>
              {options.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.code} — {l.product_name} — {Number(l.volume_remaining)}{' '}
                  {l.volume_unit} remaining
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="buyer_org_id"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Buyer <span className="text-red-600">*</span>
            </label>
            <select
              id="buyer_org_id"
              name="buyer_org_id"
              required
              defaultValue=""
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm focus:border-[#063359] focus:outline-none focus:ring-1 focus:ring-[#063359]"
            >
              <option value="" disabled>
                Pick a partner…
              </option>
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-500">
              Don&apos;t see your buyer?{' '}
              <Link
                href="/partner-requests/new"
                className="font-medium hover:underline"
                style={{ color: '#063359' }}
              >
                Request to add them →
              </Link>
            </p>
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
              htmlFor="shipping_number"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Shipping number
            </label>
            <input
              id="shipping_number"
              name="shipping_number"
              type="text"
              placeholder="Optional — waybill, tracking, or order number"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 shadow-sm focus:border-[#063359] focus:outline-none focus:ring-1 focus:ring-[#063359]"
            />
            <p className="mt-1 text-xs text-slate-500">
              Appears on the buyer&apos;s transaction certificate (Box 6).
              Leave blank if not yet assigned at the time of sale.
            </p>
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
              placeholder="Optional — contract reference, additional context, etc."
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
              Send to buyer
            </button>
          </div>
        </form>
      )}
    </div>
  )
}