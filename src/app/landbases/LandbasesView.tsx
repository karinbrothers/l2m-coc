// src/app/landbases/LandbasesView.tsx
//
// Client-side wrapper around the landbases map + table. Holds the
// search query, status filter, and "selected pin" state. Clicking
// a row in the table flies the map to that landbase and opens its
// popup. Typing in the search or changing the filter narrows both
// the table and the map at the same time.

'use client'

import { useMemo, useState } from 'react'
import LandbaseMap, { type LandbasePin } from './LandbaseMap'

export type Landbase = {
  id: string
  name: string
  country: string | null
  eligibility_status: string
  monitoring_date: string | null
  verification_date: string | null
  expiration_date: string | null
  eligibility_report_url: string | null
  latitude: number | null
  longitude: number | null
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export default function LandbasesView({ landbases }: { landbases: Landbase[] }) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // Build the unique status set actually present in the data —
  // means the dropdown only shows filters that'll return rows.
  const statusOptions = useMemo(() => {
    const set = new Set<string>()
    for (const lb of landbases) set.add(lb.eligibility_status)
    return Array.from(set).sort()
  }, [landbases])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return landbases.filter((lb) => {
      if (statusFilter !== 'all' && lb.eligibility_status !== statusFilter) {
        return false
      }
      if (q && !lb.name.toLowerCase().includes(q)) return false
      return true
    })
  }, [landbases, search, statusFilter])

  const pins: LandbasePin[] = useMemo(
    () =>
      filtered
        .filter(
          (lb): lb is Landbase & { latitude: number; longitude: number } =>
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
        })),
    [filtered],
  )

  const missingCoords = filtered.length - pins.length

  return (
    <div className="space-y-4">
      {/* Map (top of page) */}
      {pins.length > 0 ? (
        <div className="space-y-2">
          <LandbaseMap pins={pins} selectedId={selectedId} />
          {missingCoords > 0 ? (
            <p className="text-xs text-slate-500">
              {missingCoords} landbase{missingCoords === 1 ? '' : 's'} not shown
              on the map (no coordinates in Salesforce yet).
            </p>
          ) : null}
        </div>
      ) : (
        <div className="rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          No mappable landbases match the current filter.
        </div>
      )}

      {/* Search + filter bar — sits under the map and drives both
          the map's pins and the table below */}
      <div className="flex flex-wrap items-center gap-3 pt-2">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by landbase name…"
          className="min-w-[260px] flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm placeholder:text-slate-400 focus:border-[#063359] focus:outline-none focus:ring-1 focus:ring-[#063359]"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-[#063359] focus:outline-none focus:ring-1 focus:ring-[#063359]"
        >
          <option value="all">All statuses</option>
          {statusOptions.map((s) => (
            <option key={s} value={s}>
              {s.charAt(0).toUpperCase() + s.slice(1)} only
            </option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
        {filtered.length === 0 ? (
          <p className="px-6 py-6 text-sm text-slate-500">
            No landbases match your search.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-6 py-2 font-medium">Name</th>
                <th className="px-6 py-2 font-medium">Country</th>
                <th className="px-6 py-2 font-medium">Status</th>
                <th className="px-6 py-2 font-medium">Verified</th>
                <th className="px-6 py-2 font-medium">Expires</th>
                <th className="px-6 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((lb) => {
                const isSelected = selectedId === lb.id
                const hasCoords =
                  typeof lb.latitude === 'number' &&
                  typeof lb.longitude === 'number'
                // For ineligible landbases, don't show stale
                // verification dates or the old eligibility report
                // — those refer to a previous (no-longer-valid)
                // verification window and reading them as current
                // is misleading. Once verification history lands
                // we can show them under a "History" section
                // instead.
                const isIneligible = lb.eligibility_status === 'ineligible'
                return (
                  <tr
                    key={lb.id}
                    onClick={() => {
                      if (hasCoords) setSelectedId(lb.id)
                    }}
                    className={`${
                      hasCoords ? 'cursor-pointer' : ''
                    } ${isSelected ? 'bg-slate-100' : 'hover:bg-slate-50'}`}
                    title={
                      hasCoords
                        ? 'Click to fly the map to this landbase'
                        : 'No coordinates in Salesforce — not mappable'
                    }
                  >
                    <td className="px-6 py-3 text-slate-900">
                      {lb.name}
                      {isSelected ? (
                        <span className="ml-2 text-xs text-emerald-700">
                          on map ↑
                        </span>
                      ) : null}
                    </td>
                    <td className="px-6 py-3 text-slate-700">
                      {lb.country ?? '—'}
                    </td>
                    <td className="px-6 py-3">
                      <StatusBadge status={lb.eligibility_status} />
                    </td>
                    <td className="px-6 py-3 text-slate-500">
                      {isIneligible ? '—' : formatDate(lb.verification_date)}
                    </td>
                    <td className="px-6 py-3 text-slate-500">
                      {isIneligible ? '—' : formatDate(lb.expiration_date)}
                    </td>
                    <td
                      className="px-6 py-3 text-right"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {isIneligible ? (
                        <span className="text-xs text-slate-400">—</span>
                      ) : (
                        <ReportLink url={lb.eligibility_report_url} />
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      <p className="text-xs text-slate-400">
        Showing {filtered.length} of {landbases.length} landbases
        {selectedId ? (
          <>
            {' '}·{' '}
            <button
              type="button"
              onClick={() => setSelectedId(null)}
              className="hover:text-slate-700 underline"
            >
              Clear selection
            </button>
          </>
        ) : null}
      </p>
    </div>
  )
}

function ReportLink({ url }: { url: string | null }) {
  if (!url) {
    return <span className="text-xs text-slate-400">No report</span>
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="text-xs font-medium hover:underline"
      style={{ color: '#063359' }}
    >
      View eligibility report →
    </a>
  )
}

function StatusBadge({ status }: { status: string }) {
  const label = status.charAt(0).toUpperCase() + status.slice(1)
  const tone =
    status === 'eligible'
      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
      : status === 'ineligible'
        ? 'bg-red-50 text-red-800 border-red-200'
        : status === 'pending'
          ? 'bg-amber-50 text-amber-800 border-amber-200'
          : status === 'expired'
            ? 'bg-amber-50 text-amber-800 border-amber-200'
            : status === 'suspended'
              ? 'bg-amber-50 text-amber-800 border-amber-200'
              : 'bg-slate-50 text-slate-700 border-slate-200'
  return (
    <span
      className={`inline-flex rounded border px-2 py-0.5 text-xs font-medium ${tone}`}
    >
      {label}
    </span>
  )
}