// src/app/landbases/LandbaseMap.tsx
//
// Client-side Mapbox component. Plots one marker per landbase,
// colored by eligibility status. The map is initialised ONCE; when
// `pins` changes (e.g. filter applied), markers are swapped out
// and the map re-fits. When `selectedId` changes (e.g. user clicks
// a row in the table), the map flies to that pin and opens its
// popup.
//
// Requires NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN to be set.

'use client'

import { useEffect, useRef } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'

export type LandbasePin = {
  id: string
  name: string
  country: string | null
  eligibility_status: string
  verification_date: string | null
  expiration_date: string | null
  latitude: number
  longitude: number
}

const STATUS_COLOR: Record<string, string> = {
  eligible: '#059669',
  ineligible: '#dc2626',
  pending: '#d97706',
  expired: '#d97706',
  suspended: '#d97706',
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

type MarkerEntry = {
  marker: mapboxgl.Marker
  popup: mapboxgl.Popup
}

export default function LandbaseMap({
  pins,
  selectedId,
}: {
  pins: LandbasePin[]
  selectedId?: string | null
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const markersRef = useRef<Map<string, MarkerEntry>>(new Map())
  const mapLoadedRef = useRef(false)

  // ---------------------------------------------------------------
  // Effect 1: initialise the map exactly once
  // ---------------------------------------------------------------
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN
    if (!token) {
      console.error(
        '[LandbaseMap] NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN is not set',
      )
      return
    }
    mapboxgl.accessToken = token

    const map = new mapboxgl.Map({
      container: containerRef.current,
      // Default to satellite-streets so users see actual land at
      // load — much more compelling for L2M than a plain street
      // map. The toggle button switches to a clean light map for
      // when satellite is too busy.
      style: 'mapbox://styles/mapbox/satellite-streets-v12',
      center: [0, 20],
      zoom: 1.5,
    })
    mapRef.current = map

    map.addControl(new mapboxgl.NavigationControl(), 'top-right')
    map.addControl(new mapboxgl.FullscreenControl(), 'top-right')

    // Custom satellite/light toggle — starts on satellite (matches
    // the default style above), button label shows the OTHER mode
    // so the user knows what they'll get when they click.
    const styleSwitcher = document.createElement('div')
    styleSwitcher.className = 'mapboxgl-ctrl mapboxgl-ctrl-group'
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.textContent = 'Map'
    btn.style.padding = '6px 10px'
    btn.style.fontSize = '12px'
    btn.style.fontWeight = '500'
    let isSatellite = true
    btn.onclick = () => {
      isSatellite = !isSatellite
      map.setStyle(
        isSatellite
          ? 'mapbox://styles/mapbox/satellite-streets-v12'
          : 'mapbox://styles/mapbox/light-v11',
      )
      btn.textContent = isSatellite ? 'Map' : 'Satellite'
    }
    styleSwitcher.appendChild(btn)
    map.addControl(
      {
        onAdd: () => styleSwitcher,
        onRemove: () => {
          styleSwitcher.remove()
        },
      },
      'top-right',
    )

    map.on('load', () => {
      mapLoadedRef.current = true
    })

    return () => {
      map.remove()
      mapRef.current = null
      mapLoadedRef.current = false
      markersRef.current.clear()
    }
  }, [])

  // ---------------------------------------------------------------
  // Effect 2: rebuild markers whenever `pins` changes
  // ---------------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const applyMarkers = () => {
      // Clear out the previous set
      markersRef.current.forEach(({ marker }) => marker.remove())
      markersRef.current.clear()

      if (pins.length === 0) return

      const bounds = new mapboxgl.LngLatBounds()

      pins.forEach((pin) => {
        const status = pin.eligibility_status.toLowerCase()
        const color = STATUS_COLOR[status] ?? '#64748b'

        const el = document.createElement('div')
        el.style.width = '18px'
        el.style.height = '18px'
        el.style.borderRadius = '50%'
        el.style.background = color
        el.style.border = '2.5px solid #fff'
        el.style.boxShadow = '0 1px 4px rgba(0,0,0,0.3)'
        el.style.cursor = 'pointer'

        const popupHtml = `
          <div style="font-family: system-ui, sans-serif; padding: 2px 0; min-width: 220px;">
            <div style="font-weight: 600; color: #0f172a; font-size: 14px;">${escapeHtml(pin.name)}</div>
            ${pin.country ? `<div style="color: #64748b; font-size: 12px; margin-top: 2px;">${escapeHtml(pin.country)}</div>` : ''}
            <div style="margin-top: 8px;">
              <span style="display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 500; background: ${color}20; color: ${color};">${escapeHtml(capitalize(status))}</span>
            </div>
            <div style="margin-top: 8px; font-size: 12px; color: #475569;">
              <div>Verified: ${formatDate(pin.verification_date)}</div>
              <div>Expires: ${formatDate(pin.expiration_date)}</div>
            </div>
            <div style="margin-top: 10px;">
              <a href="/landbases/${pin.id}" style="color: #063359; font-size: 12px; font-weight: 500; text-decoration: underline;">View details →</a>
            </div>
          </div>
        `

        const popup = new mapboxgl.Popup({ offset: 14, closeButton: true }).setHTML(popupHtml)

        const marker = new mapboxgl.Marker({ element: el })
          .setLngLat([pin.longitude, pin.latitude])
          .setPopup(popup)
          .addTo(map)

        markersRef.current.set(pin.id, { marker, popup })
        bounds.extend([pin.longitude, pin.latitude])
      })

      if (!bounds.isEmpty()) {
        map.fitBounds(bounds, { padding: 60, maxZoom: 8, duration: 500 })
      }
    }

    if (mapLoadedRef.current) {
      applyMarkers()
    } else {
      map.once('load', applyMarkers)
    }
  }, [pins])

  // ---------------------------------------------------------------
  // Effect 3: fly to selectedId when it changes
  // ---------------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current
    if (!map || !selectedId) return
    const entry = markersRef.current.get(selectedId)
    if (!entry) return
    const lngLat = entry.marker.getLngLat()
    map.flyTo({
      center: [lngLat.lng, lngLat.lat],
      zoom: 9,
      duration: 1200,
      essential: true,
    })
    // Open popup once the fly animation settles. addTo is a no-op
    // if the popup is already open.
    setTimeout(() => {
      if (mapRef.current) entry.popup.addTo(mapRef.current)
    }, 1250)
  }, [selectedId])

  return (
    <div className="space-y-3">
      <div
        ref={containerRef}
        className="h-[500px] w-full rounded-lg border border-slate-200 shadow-sm"
        style={{ minHeight: '500px' }}
      />
      <div className="flex flex-wrap gap-4 text-xs text-slate-600">
        <LegendDot color={STATUS_COLOR.eligible} label="Eligible" />
        <LegendDot color={STATUS_COLOR.ineligible} label="Ineligible" />
        <LegendDot color={STATUS_COLOR.pending} label="Pending" />
      </div>
    </div>
  )
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-block h-3 w-3 rounded-full"
        style={{
          background: color,
          border: '2px solid #fff',
          boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
        }}
      />
      {label}
    </span>
  )
}