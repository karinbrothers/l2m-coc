// src/app/certificates/[id]/VoidCertButton.tsx
//
// Admin-only button shown above the cert chrome. Click → inline
// confirm with a required reason → submit voids the cert. The
// page reloads to render the VOIDED banner.
//
// If the cert is already voided, this component instead offers
// an "Un-void" action in case admin made a mistake.

'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  voidCertificateAction,
  unvoidCertificateAction,
} from './actions'

export default function VoidCertButton({
  certId,
  alreadyVoided,
}: {
  certId: string
  alreadyVoided: boolean
}) {
  const [confirming, setConfirming] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const submitVoid = () => {
    setError(null)
    startTransition(async () => {
      const result = await voidCertificateAction(certId, reason)
      if (result.error) {
        setError(result.error)
      } else {
        setConfirming(false)
        setReason('')
        router.refresh()
      }
    })
  }

  const submitUnvoid = () => {
    setError(null)
    startTransition(async () => {
      const result = await unvoidCertificateAction(certId)
      if (result.error) {
        setError(result.error)
      } else {
        router.refresh()
      }
    })
  }

  if (alreadyVoided) {
    return (
      <div className="mb-4 flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-white px-4 py-2 print:hidden">
        <span className="text-xs text-slate-600">
          Admin action available
        </span>
        <button
          type="button"
          onClick={submitUnvoid}
          disabled={isPending}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {isPending ? 'Restoring…' : 'Un-void certificate'}
        </button>
        {error ? (
          <span className="text-xs text-red-700">{error}</span>
        ) : null}
      </div>
    )
  }

  if (!confirming) {
    return (
      <div className="mb-4 flex items-center justify-end gap-3 print:hidden">
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="rounded-md border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
        >
          Void certificate
        </button>
      </div>
    )
  }

  return (
    <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 print:hidden">
      <p className="text-xs text-red-900 leading-relaxed mb-2">
        Voiding this certificate marks it invalid going forward. The cert
        stays in the system for audit but is clearly flagged as void. Give a
        clear reason — it&apos;ll be visible on the cert.
      </p>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason (required) — e.g. wrong volume agreed; partner dispute resolved in their favour."
        rows={2}
        className="w-full rounded border border-red-200 bg-white px-2 py-1 text-xs"
        disabled={isPending}
      />
      {error ? (
        <p className="text-xs text-red-700 mt-2">Error: {error}</p>
      ) : null}
      <div className="flex items-center gap-2 mt-2">
        <button
          type="button"
          onClick={submitVoid}
          disabled={isPending || !reason.trim()}
          className="rounded bg-red-700 px-3 py-1 text-xs font-medium text-white hover:bg-red-800 disabled:opacity-50"
        >
          {isPending ? 'Voiding…' : 'Confirm void'}
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
          Cancel
        </button>
      </div>
    </div>
  )
}