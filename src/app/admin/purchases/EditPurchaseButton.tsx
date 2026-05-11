// src/app/admin/purchases/EditPurchaseButton.tsx
//
// Inline edit form for a purchase. Lets admin fix typos on
// volume, fibre diameter, clip year, purchase date, batch
// number. Volume edit auto-rebalances volume_remaining by the
// delta and won't let you go below what's already been drawn
// into a batch.

'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { editPurchaseAction } from './actions'

type Current = {
  volume: number
  volume_remaining: number
  fibre_diameter: number | null
  year_of_clip: number | null
  purchase_date: string | null
  batch_number: string | null
  has_oc: boolean
}

export default function EditPurchaseButton({
  purchaseId,
  current,
}: {
  purchaseId: string
  current: Current
}) {
  const [open, setOpen] = useState(false)
  const [volume, setVolume] = useState(String(current.volume))
  const [fibreDiameter, setFibreDiameter] = useState(
    current.fibre_diameter != null ? String(current.fibre_diameter) : '',
  )
  const [yearOfClip, setYearOfClip] = useState(
    current.year_of_clip != null ? String(current.year_of_clip) : '',
  )
  const [purchaseDate, setPurchaseDate] = useState(current.purchase_date ?? '')
  const [batchNumber, setBatchNumber] = useState(current.batch_number ?? '')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const used = current.volume - current.volume_remaining
  const hasBeenDrawn = used > 0

  const reset = () => {
    setVolume(String(current.volume))
    setFibreDiameter(
      current.fibre_diameter != null ? String(current.fibre_diameter) : '',
    )
    setYearOfClip(
      current.year_of_clip != null ? String(current.year_of_clip) : '',
    )
    setPurchaseDate(current.purchase_date ?? '')
    setBatchNumber(current.batch_number ?? '')
    setError(null)
  }

  const save = () => {
    setError(null)
    startTransition(async () => {
      const result = await editPurchaseAction(purchaseId, {
        volume,
        fibre_diameter: fibreDiameter,
        year_of_clip: yearOfClip,
        purchase_date: purchaseDate,
        batch_number: batchNumber,
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
        Edit any field. Numeric fields left blank stay unchanged.
      </p>

      {hasBeenDrawn ? (
        <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 leading-relaxed">
          <strong>Note:</strong> {Number(used).toFixed(2)} of{' '}
          {Number(current.volume).toFixed(2)} tonnes from this purchase has
          already been drawn into a batch. New volume must be at least{' '}
          {Number(used).toFixed(2)} tonnes.
        </div>
      ) : null}

      {current.has_oc ? (
        <div className="rounded border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 leading-relaxed">
          An origin certificate has already been issued for this purchase.
          Changes to fibre or clip year update the trace view but{' '}
          <strong>do not</strong> change the already-issued OC (which has
          these snapshotted at issue time).
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
            Purchase date
          </label>
          <input
            type="date"
            value={purchaseDate}
            onChange={(e) => setPurchaseDate(e.target.value)}
            className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs"
            disabled={isPending}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">
            Fibre diameter (µm)
          </label>
          <input
            type="number"
            step="0.1"
            min="0"
            value={fibreDiameter}
            onChange={(e) => setFibreDiameter(e.target.value)}
            placeholder="e.g. 21.5"
            className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs"
            disabled={isPending}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">
            Year of clip
          </label>
          <input
            type="number"
            min="1900"
            max="2100"
            step="1"
            value={yearOfClip}
            onChange={(e) => setYearOfClip(e.target.value)}
            placeholder="e.g. 2026"
            className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs"
            disabled={isPending}
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-700 mb-1">
          Batch number / supplier ref
        </label>
        <input
          type="text"
          value={batchNumber}
          onChange={(e) => setBatchNumber(e.target.value)}
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