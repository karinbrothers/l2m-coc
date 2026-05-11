// src/app/admin/sales/EditSaleButton.tsx
//
// Inline edit form for the three safe metadata fields on any
// sale: shipping number, country of dispatch, notes. Click Edit
// → form expands pre-filled with current values → Save commits
// via server action and refreshes.

'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { editSaleMetadataAction } from './actions'

export default function EditSaleButton({
  saleId,
  current,
}: {
  saleId: string
  current: {
    shipping_number: string | null
    country_of_dispatch: string | null
    notes: string | null
  }
}) {
  const [open, setOpen] = useState(false)
  const [shippingNumber, setShippingNumber] = useState(
    current.shipping_number ?? '',
  )
  const [countryOfDispatch, setCountryOfDispatch] = useState(
    current.country_of_dispatch ?? '',
  )
  const [notes, setNotes] = useState(current.notes ?? '')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const reset = () => {
    setShippingNumber(current.shipping_number ?? '')
    setCountryOfDispatch(current.country_of_dispatch ?? '')
    setNotes(current.notes ?? '')
    setError(null)
  }

  const save = () => {
    setError(null)
    startTransition(async () => {
      const result = await editSaleMetadataAction(saleId, {
        shipping_number: shippingNumber,
        country_of_dispatch: countryOfDispatch,
        notes,
      })
      if (result.error) {
        setError(result.error)
      } else {
        setOpen(false)
        router.refresh()
      }
    })
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
      >
        Edit details
      </button>
    )
  }

  return (
    <div className="rounded-md border border-slate-300 bg-slate-50 p-3 space-y-3 max-w-md">
      <p className="text-xs text-slate-600 leading-relaxed">
        Edit metadata. These don&apos;t affect volume or the chain — changes
        appear on the TC immediately. Leave a field blank to clear it.
      </p>

      <div>
        <label className="block text-xs font-medium text-slate-700 mb-1">
          Order/Shipping number
        </label>
        <input
          type="text"
          value={shippingNumber}
          onChange={(e) => setShippingNumber(e.target.value)}
          className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs"
          disabled={isPending}
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-700 mb-1">
          Country of dispatch
        </label>
        <input
          type="text"
          value={countryOfDispatch}
          onChange={(e) => setCountryOfDispatch(e.target.value)}
          className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs"
          disabled={isPending}
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-700 mb-1">
          Notes
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs"
          disabled={isPending}
        />
      </div>

      {error ? (
        <p className="text-xs text-red-700">Error: {error}</p>
      ) : null}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={isPending}
          className="rounded bg-[#063359] px-3 py-1 text-xs font-medium text-white hover:bg-[#0a4a7e] disabled:opacity-50"
        >
          {isPending ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={() => {
            reset()
            setOpen(false)
          }}
          disabled={isPending}
          className="rounded px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}