// src/app/profile/actions.ts

'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/requireUser'
import { createClient } from '@/lib/supabase/server'

export async function updateFullName(formData: FormData) {
  await requireUser()
  const supabase = await createClient()

  const fullName = String(formData.get('full_name') ?? '').trim()
  if (!fullName) {
    redirect('/profile?error=name_required')
  }

  const { error } = await supabase.rpc('set_profile_full_name', {
    p_full_name: fullName,
  })

  if (error) {
    console.error('[updateFullName]', error)
    redirect(`/profile?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath('/profile')
  redirect('/profile?saved=1')
}