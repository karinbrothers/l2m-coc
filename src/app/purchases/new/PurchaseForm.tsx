// src/app/purchases/new/PurchaseForm.tsx
//
// Client-side form for recording a new purchase. The user picks
// the purchase date first; the landbase dropdown then shows only
// landbases that were eligible on that date (verification_date ≤
// purchase_date ≤ expiration_date). This handles the realistic
// case where a partner buys wool today but logs the purchase a
// few days later, after the landbase's eligibility window has
// technically lapsed.
//
// Server-side validation in createPurchase enforces the same
// rule — UI filter is a usability layer, not a security layer.

'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { createPurchase } from '../actions'

type Landbase = {
  id: string
  name: string
  country: string | null
  verification_date: string | null
  expiration_date: string | null
  eligibility_status: string | null
}

function formatDateShort(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export default function PurchaseForm({
  landbases,
}: {
  landbases: Landbase[]
}) {
  const todayIso = new Date().toISOString().slice(0, 10)
  const currentYear = new Date().getFullYear()

  const [purchaseDate, setPurchaseDate] = useState(todayIso)
  const [landbaseId, setLandbaseId] = useState('')

  // Filter to landbases whose verification window covers the
  // selected purchase date. NULL dates → not eligible (can't
  // verify a window we don't have).
  const eligibleOnDate = useMemo(() => {
    if (!purchaseDate) return []
    return landbases.filter(
      (lb) =>
        lb.verification_date &&
        lb.expiration_date &&
        lb.verification_date <= purchaseDate &&
        purchaseDate <= lb.expiration_date,
    )
  }, [purchaseDate, landbases])

  // Whether the user's current selection is still valid for the
  // chosen date. Computed during render rather than reset in an
  // effect — this way, if the user toggles back to a date where
  // their original landbase is eligible again, the selection
  // comes back automatically without needing to re-pick.
  const selectedStillEligible = landbaseId
    ? eligibleOnDate.some((lb) => lb.id === landbaseId)
    : false
  const displayedLandbaseId = selectedStillEligible ? landbaseId : ''

  return (
    <form
      action={createPurchase}
      className="space-y-5 rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
    >
      <div>
        <label
          htmlFor="purchase_date"
          className="mb-1 block text-sm font-medium text-slate-700"
        >
          Purchase date <span className="text-red-600">*</span>
        </label>
        <input
          id="purchase_date"
          name="purchase_date"
          type="date"
          required
          value={purchaseDate}
          onChange={(e) => setPurchaseDate(e.target.value)}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 shadow-sm focus:border-[#063359] focus:outline-none focus:ring-1 focus:ring-[#063359]"
        />
        <p className="mt-1 text-xs text-slate-500">
          Landbase eligibility is checked against this date — you can record a
          purchase from a date when a landbase was eligible, even if eligibility
          has since lapsed.
        </p>
      </div>

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
          value={displayedLandbaseId}
          onChange={(e) => setLandbaseId(e.target.value)}
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm focus:border-[#063359] focus:outline-none focus:ring-1 focus:ring-[#063359]"
        >
          <option value="" disabled>
            {eligibleOnDate.length === 0
              ? 'No landbases were eligible on this date'
              : 'Select an eligible landbase…'}
          </option>
          {eligibleOnDate.map((lb) => (
            <option key={lb.id} value={lb.id}>
              {lb.name}
              {lb.country ? ` — ${lb.country}` : ''}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-slate-500">
          {eligibleOnDate.length} landbase
          {eligibleOnDate.length === 1 ? '' : 's'} eligible on{' '}
          {formatDateShort(purchaseDate)}.
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

      <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
        <Link
          href="/purchases"
          className="rounded-md px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          Cancel
        </Link>
        <button
          type="submit"
          disabled={!displayedLandbaseId}
          className="rounded-md bg-[#063359] px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-[#0a4a7e] focus:outline-none focus:ring-2 focus:ring-[#063359] focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Create purchase
        </button>
      </div>
    </form>
  )
}