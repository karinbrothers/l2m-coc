// src/app/help/RestartTourButton.tsx
//
// Tiny client wrapper around the resetOnboarding server action.
// Flips has_completed_onboarding back to false and reloads so the
// welcome modal appears immediately. Lives on the Help page.

'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { resetOnboarding } from '../onboarding/actions'

export default function RestartTourButton() {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const restart = () => {
    startTransition(async () => {
      await resetOnboarding()
      router.push('/')
      router.refresh()
    })
  }

  return (
    <button
      type="button"
      onClick={restart}
      disabled={isPending}
      className="inline-flex items-center gap-2 rounded-lg bg-[#063359] px-4 py-2 text-white text-sm font-medium hover:bg-[#0a4a7e] transition disabled:opacity-50"
    >
      {isPending ? 'Restarting…' : 'Restart the tour'}
      <span aria-hidden>↻</span>
    </button>
  )
}