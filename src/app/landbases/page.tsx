// src/app/landbases/page.tsx
//
// Server component — paginates the landbases table to fetch all
// rows (Supabase's REST API caps single queries at 1000), then
// hands the data to the client-side LandbasesView for search,
// filter, and map↔table interactivity.

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import LandbasesView, { type Landbase } from './LandbasesView'

async function fetchAllLandbases(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<Landbase[]> {
  const pageSize = 1000
  const all: Landbase[] = []
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('landbases')
      .select(
        'id, name, country, eligibility_status, monitoring_date, verification_date, expiration_date, eligibility_report_url, latitude, longitude',
      )
      .order('name', { ascending: true })
      .range(from, from + pageSize - 1)
      .returns<Landbase[]>()
    if (error) {
      console.error('[landbases page] fetch error:', error.message)
      break
    }
    const chunk = data ?? []
    all.push(...chunk)
    if (chunk.length < pageSize) break
    from += pageSize
  }
  return all
}

export default async function LandbasesPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const landbases = await fetchAllLandbases(supabase)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">Landbases</h2>
        <p className="mt-1 text-sm text-slate-600">
          All landbases visible to your organization, scoped by Row-Level
          Security.
        </p>
      </div>

      <LandbasesView landbases={landbases} />
    </div>
  )
}