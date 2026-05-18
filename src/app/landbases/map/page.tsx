// src/app/landbases/map/page.tsx
//
// Server component — fetches all landbases with coordinates and
// hands them to the client map component. Landbases without
// lat/long are skipped (not plottable) but counted, so users
// know if any are missing.

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import LandbaseMap, { type LandbasePin } from './LandbaseMap'

type LandbaseRow = {
  id: string
  name: string
  country: string | null
  eligibility_status: string
  verification_date: string | null
  expiration_date: string | null
  latitude: number | null
  longitude: number | null
}

export default async function LandbasesMapPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: landbases } = await supabase
    .from('landbases')
    .select(
      'id, name, country, eligibility_status, verification_date, expiration_date, latitude, longitude',
    )
    .order('name', { ascending: true })
    .returns<LandbaseRow[]>()

  const all = landbases ?? []
  const withCoords: LandbasePin[] = all
    .filter(
      (lb): lb is LandbaseRow & { latitude: number; longitude: number } =>
        typeof lb.latitude === 'number' && typeof lb.longitude === 'number',
    )
    .map((lb) => ({
      id: lb.id,
      name: lb.name,
      country: lb.country,
      eligibility_status: lb.eligibility_status,
      verification_date: lb.verification_date,
      expiration_date: lb.expiration_date,
      latitude: lb.latitude,
      longitude: lb.longitude,
    }))

  const missingCoords = all.length - withCoords.length

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs text-slate-500">
            <Link href="/landbases" className="hover:text-slate-700">
              ← Back to landbases
            </Link>
          </div>
          <h2 className="mt-2 text-2xl font-semibold text-slate-900">
            Landbases map
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            {withCoords.length} landbase{withCoords.length === 1 ? '' : 's'}{' '}
            shown.
            {missingCoords > 0
              ? ` ${missingCoords} landbase${missingCoords === 1 ? '' : 's'} hidden (no coordinates in Salesforce yet).`
              : ''}
          </p>
        </div>
      </div>

      <LandbaseMap pins={withCoords} />
    </div>
  )
}