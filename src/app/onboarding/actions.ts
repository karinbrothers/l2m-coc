// src/app/onboarding/actions.ts
//
// Server actions for the welcome tour. Two simple wrappers around
// the SQL RPCs: one to mark the tour complete (called by the modal
// when the user finishes), one to reset (handy for QA + a "show me
// the tour again" button on the Help page).

'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function markOnboardingComplete() {
  const supabase = await createClient()
  const { error } = await supabase.rpc('mark_onboarding_complete')
  if (error) {
    console.error('mark_onboarding_complete failed', error)
    throw new Error(error.message)
  }
  revalidatePath('/', 'layout')
}

export async function resetOnboarding() {
  const supabase = await createClient()
  const { error } = await supabase.rpc('reset_onboarding')
  if (error) {
    console.error('reset_onboarding failed', error)
    throw new Error(error.message)
  }
  revalidatePath('/', 'layout')
}