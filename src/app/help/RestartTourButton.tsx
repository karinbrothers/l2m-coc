// src/app/help/RestartTourButton.tsx
//
// Tiny client wrapper around the resetOnboarding server action.
// Flips has_completed_onboarding back to false, then forces a hard
// reload to the dashboard so the WelcomeModal (which lives in
// layout.tsx and persists across client-side navigations) re-runs
// its bootstrap logic and re-shows itself.

'use client'

import { useTransition } from 'react'
import { resetOnboarding } from '../onboarding/actions'

export default function RestartTourButton() {
  const [isPending, startTransition] = useTransition()

  const restart = () => {
    startTransition(async () => {
      await resetOnboarding()
      // Hard reload — router.push/refresh leaves the client-side
      // WelcomeModal mounted with show=false in state. We need
      // the component to re-bootstrap from scratch.
      window.location.href = '/'
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