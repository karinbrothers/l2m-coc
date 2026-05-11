// src/app/admin/sales/CancelSaleButton.tsx
//
// Inline confirmation flow for cancelling a pending sale.
// First click expands a small confirm panel asking for an
// optional reason; second click submits via server action.

'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { cancelPendingSaleAction } from './actions'

export default function CancelSaleButton({
  saleId,
  saleCode,
}: {
  saleId: string
  saleCode: string
}) {
  const [confirming, setConfirming] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const submit = () => {
    setError(null)
    startTransition(async () => {
      const result = await cancelPendingSaleAction(saleId, reason)
      if (result.error) {
        setError(result.error)
      } else {
        setConfirming(false)
        setReason('')
        router.refresh()
      }
    })
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="rounded-md border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
      >
        Cancel sale
      </button>
    )
  }

  return (
    <div className="rounded-md border border-red-200 bg-red-50 p-3 space-y-2 max-w-md">
      <p className="text-xs text-red-900 leading-relaxed">
        Cancel sale{' '}
        <span className="font-mono font-semibold">{saleCode}</span>? Volume
        returns to the seller&apos;s inventory and the sale is marked
        rejected with your reason attached.
      </p>
      <input
        type="text"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason (shown to seller)"
        className="w-full rounded border border-red-200 bg-white px-2 py-1 text-xs"
        disabled={isPending}
      />
      {error ? (
        <p className="text-xs text-red-700">Error: {error}</p>
      ) : null}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={isPending}
          className="rounded bg-red-700 px-3 py-1 text-xs font-medium text-white hover:bg-red-800 disabled:opacity-50"
        >
          {isPending ? 'Cancelling…' : 'Confirm cancel'}
        </button>
        <button
          type="button"
          onClick={() => {
            setConfirming(false)
            setReason('')
            setError(null)
          }}
          disabled={isPending}
          className="rounded px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
        >
          Keep sale
        </button>
      </div>
    </div>
  )
}