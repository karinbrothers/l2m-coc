// src/app/admin/sales/EditSaleButton.tsx
//
// Inline edit form for every editable field on a sale: volume,
// sale date, shipping number, country of dispatch, notes.
//
// For pending sales, changing volume re-balances the inventory
// lot. For non-pending sales we surface a warning that volume
// and sale date changes don't propagate to the existing TC (the
// cert has these snapshotted at issue time).

'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { editSaleAction } from './actions'

type Current = {
  volume: number
  sale_date: string | null
  shipping_number: string | null
  country_of_dispatch: string | null
  notes: string | null
  status: 'pending' | 'accepted' | 'rejected' | 'expired'
}

export default function EditSaleButton({
  saleId,
  current,
}: {
  saleId: string
  current: Current
}) {
  const [open, setOpen] = useState(false)
  const [volume, setVolume] = useState(String(current.volume))
  const [saleDate, setSaleDate] = useState(current.sale_date ?? '')
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

  const isPendingSale = current.status === 'pending'

  const reset = () => {
    setVolume(String(current.volume))
    setSaleDate(current.sale_date ?? '')
    setShippingNumber(current.shipping_number ?? '')
    setCountryOfDispatch(current.country_of_dispatch ?? '')
    setNotes(current.notes ?? '')
    setError(null)
  }

  const save = () => {
    setError(null)
    startTransition(async () => {
      const result = await editSaleAction(saleId, {
        volume,
        sale_date: saleDate,
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
        Edit any field. Leave a metadata field blank to clear it.
      </p>

      {!isPendingSale ? (
        <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 leading-relaxed">
          <strong>Note:</strong> this sale has been accepted. Changing volume
          or sale date here updates the record but does NOT change the
          already-issued transaction certificate (which has these values
          snapshotted at issue time). For record-correction only.
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">
            Volume (tonnes)
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={volume}
            onChange={(e) => setVolume(e.target.value)}
            className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs"
            disabled={isPending}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">
            Sale date
          </label>
          <input
            type="date"
            value={saleDate}
            onChange={(e) => setSaleDate(e.target.value)}
            className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs"
            disabled={isPending}
          />
        </div>
      </div>

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