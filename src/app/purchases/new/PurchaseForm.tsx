// src/app/purchases/new/PurchaseForm.tsx
//
// Client-side form for recording a new purchase.
//
// Key decisions:
// - SHEARING DATE drives landbase eligibility (not purchase date).
//   A landbase only appears in the dropdown if it was eligible on
//   the date the wool was sheared. Late-recorded purchases work.
// - PRODUCT NAME is a dropdown — greasy wool, clean wool, or wool
//   tops — so an FSP that buys already-processed material (e.g.,
//   at auction) can record the actual stage.
// - WILL YOU PROCESS? if no, the action creates a passthrough
//   inventory lot so the material is ready-to-sell immediately.

'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { createPurchase } from '../actions'
import { WOOL_PRODUCTS } from '@/lib/products'

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

  const [shearingDate, setShearingDate] = useState(todayIso)
  const [purchaseDate, setPurchaseDate] = useState(todayIso)
  const [landbaseId, setLandbaseId] = useState('')
  const [willProcess, setWillProcess] = useState('yes')

  // Filter landbases by their verification window relative to the
  // SHEARING date. The wool was eligible if the landbase was
  // eligible when the sheep were shorn.
  const eligibleOnDate = useMemo(() => {
    if (!shearingDate) return []
    return landbases.filter(
      (lb) =>
        lb.verification_date &&
        lb.expiration_date &&
        lb.verification_date <= shearingDate &&
        shearingDate <= lb.expiration_date,
    )
  }, [shearingDate, landbases])

  const selectedStillEligible = landbaseId
    ? eligibleOnDate.some((lb) => lb.id === landbaseId)
    : false
  const displayedLandbaseId = selectedStillEligible ? landbaseId : ''

  return (
    <form
      action={createPurchase}
      className="space-y-5 rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
    >
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label
            htmlFor="shearing_date"
            className="mb-1 block text-sm font-medium text-slate-700"
          >
            Date of shearing <span className="text-red-600">*</span>
          </label>
          <input
            id="shearing_date"
            name="shearing_date"
            type="date"
            required
            value={shearingDate}
            onChange={(e) => setShearingDate(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 shadow-sm focus:border-[#063359] focus:outline-none focus:ring-1 focus:ring-[#063359]"
          />
          <p className="mt-1 text-xs text-slate-500">
            Drives landbase eligibility. Wool sheared while the landbase was
            eligible can still be recorded later.
          </p>
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
            value={purchaseDate}
            onChange={(e) => setPurchaseDate(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 shadow-sm focus:border-[#063359] focus:outline-none focus:ring-1 focus:ring-[#063359]"
          />
          <p className="mt-1 text-xs text-slate-500">
            When the wool was bought. For your records.
          </p>
        </div>
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
              ? 'No landbases were eligible on this shearing date'
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
          {formatDateShort(shearingDate)}.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label
            htmlFor="product_name"
            className="mb-1 block text-sm font-medium text-slate-700"
          >
            Product name <span className="text-red-600">*</span>
          </label>
          <select
            id="product_name"
            name="product_name"
            required
            defaultValue="Greasy Wool"
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm focus:border-[#063359] focus:outline-none focus:ring-1 focus:ring-[#063359]"
          >
            {WOOL_PRODUCTS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
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
            placeholder="e.g. 12.5"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 shadow-sm focus:border-[#063359] focus:outline-none focus:ring-1 focus:ring-[#063359]"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label
            htmlFor="fibre_diameter"
            className="mb-1 block text-sm font-medium text-slate-700"
          >
            Microns (µm)
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

      <fieldset className="rounded-md border border-slate-200 bg-slate-50 p-4">
        <legend className="px-2 text-sm font-medium text-slate-700">
          Will you process this material before selling it?
        </legend>
        <div className="mt-2 space-y-2">
          <label className="flex items-start gap-2 text-sm text-slate-700 cursor-pointer">
            <input
              type="radio"
              name="will_process"
              value="yes"
              checked={willProcess === 'yes'}
              onChange={(e) => setWillProcess(e.target.value)}
              className="mt-0.5"
            />
            <span>
              <strong>Yes</strong> — I&rsquo;ll record a processing batch
              before selling. Volume stays in the unprocessed pool until
              then.
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm text-slate-700 cursor-pointer">
            <input
              type="radio"
              name="will_process"
              value="no"
              checked={willProcess === 'no'}
              onChange={(e) => setWillProcess(e.target.value)}
              className="mt-0.5"
            />
            <span>
              <strong>No</strong> — I&rsquo;ll sell this material as-is. The
              system will create a ready-to-sell inventory lot for it
              automatically.
            </span>
          </label>
        </div>
      </fieldset>

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