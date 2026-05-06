// src/components/EmptyState.tsx
//
// Reusable getting-started panel shown on pages that have no data
// yet (empty /purchases, empty /sales, empty /inbox, empty
// /processing). Replaces the bare empty-table experience with
// stage-appropriate guidance and a primary CTA.
//
// Usage:
//   <EmptyState
//     icon="📦"
//     title="No purchases yet"
//     body={<>Recording a purchase from a landbase is the first
//             step in the chain.</>}
//     primaryCta={{ label: 'Record a purchase', href: '/purchases/new' }}
//     secondaryCta={{ label: 'Read the guide', href: '/help' }}
//   />

import Link from 'next/link'
import type { ReactNode } from 'react'

type CTA = { label: string; href: string }

export default function EmptyState({
  icon,
  title,
  body,
  primaryCta,
  secondaryCta,
}: {
  icon?: string
  title: string
  body: ReactNode
  primaryCta?: CTA
  secondaryCta?: CTA
}) {
  return (
    <div className="border border-dashed border-gray-300 rounded-2xl bg-white px-8 py-12 text-center max-w-2xl mx-auto">
      {icon && (
        <div
          aria-hidden
          className="text-4xl mb-3 select-none"
        >
          {icon}
        </div>
      )}
      <h2 className="text-lg font-semibold text-gray-900 mb-2">{title}</h2>
      <div className="text-gray-600 leading-relaxed text-[15px] max-w-md mx-auto">
        {body}
      </div>

      {(primaryCta || secondaryCta) && (
        <div className="mt-6 flex items-center justify-center gap-3">
          {primaryCta && (
            <Link
              href={primaryCta.href}
              className="inline-flex items-center gap-2 rounded-lg bg-[#063359] px-4 py-2 text-white text-sm font-medium hover:bg-[#0a4a7e] transition"
            >
              {primaryCta.label}
              <span aria-hidden>→</span>
            </Link>
          )}
          {secondaryCta && (
            <Link
              href={secondaryCta.href}
              className="inline-flex items-center text-sm font-medium text-[#063359] hover:underline"
            >
              {secondaryCta.label}
            </Link>
          )}
        </div>
      )}
    </div>
  )
}