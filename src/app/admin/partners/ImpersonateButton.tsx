// src/app/admin/partners/ImpersonateButton.tsx
//
// Click "Sign in as" → calls server action → displays the
// generated magic link with a copy-to-clipboard button and
// instructions to open it in an incognito window. We don't
// auto-open in a new tab because that would replace the admin's
// session cookie on the same domain.

'use client'

import { useState, useTransition } from 'react'
import { generateImpersonationLink } from './actions'

export default function ImpersonateButton({
  email,
  label,
}: {
  email: string
  label: string
}) {
  const [link, setLink] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [isPending, startTransition] = useTransition()

  const generate = () => {
    setError(null)
    setLink(null)
    setCopied(false)
    startTransition(async () => {
      const result = await generateImpersonationLink(email)
      if (result.error) setError(result.error)
      else setLink(result.link)
    })
  }

  const copy = async () => {
    if (!link) return
    await navigator.clipboard.writeText(link)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={generate}
        disabled={isPending}
        className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
      >
        {isPending ? 'Generating…' : `Sign in as ${label}`}
      </button>

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      ) : null}

      {link ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-3 text-xs space-y-2">
          <p className="text-emerald-900 leading-relaxed">
            <strong>Copy this link and open it in an incognito window</strong>
            {' '}— if you open it in a regular tab on this browser, your admin
            session will be replaced with{' '}
            <span className="font-mono">{email}</span>&apos;s session.
            The link is single-use and expires in about 1 hour.
          </p>
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={link}
              className="flex-1 rounded border border-emerald-200 bg-white px-2 py-1 text-xs font-mono text-slate-700"
              onFocus={(e) => e.currentTarget.select()}
            />
            <button
              type="button"
              onClick={copy}
              className="rounded bg-[#063359] px-3 py-1 text-xs font-medium text-white hover:bg-[#0a4a7e]"
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}