// src/app/landbases/map/LandbaseMap.tsx
//
// Client-side Mapbox component. Plots one marker per landbase,
// colored by eligibility status. Click a marker for a popup with
// name, country, current verification window, and a link to the
// landbase detail page.
//
// Requires NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN to be set in Vercel
// env vars. The token is a *public* Mapbox token — safe to ship
// to the browser; Mapbox enforces rate limits and (optionally)
// URL restrictions on their side.

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
  eligible: '#059669', // emerald-600
  ineligible: '#dc2626', // red-600
  expired: '#d97706', // amber-600
  suspended: '#d97706', // amber-600
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

export default function LandbaseMap({ pins }: { pins: LandbasePin[] }) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)

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
      style: 'mapbox://styles/mapbox/light-v11',
      center: [0, 20], // default world view; we'll fit to markers below
      zoom: 1.5,
    })
    mapRef.current = map

    map.addControl(new mapboxgl.NavigationControl(), 'top-right')
    map.addControl(new mapboxgl.FullscreenControl(), 'top-right')

    // Style switcher: light ↔ satellite. Implemented as a custom
    // control button in the top-right so users can flip to a
    // satellite view of the actual land — great for regenerative
    // landbases.
    const styleSwitcher = document.createElement('div')
    styleSwitcher.className = 'mapboxgl-ctrl mapboxgl-ctrl-group'
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.textContent = 'Satellite'
    btn.style.padding = '6px 10px'
    btn.style.fontSize = '12px'
    btn.style.fontWeight = '500'
    let isSatellite = false
    btn.onclick = () => {
      isSatellite = !isSatellite
      map.setStyle(
        isSatellite
          ? 'mapbox://styles/mapbox/satellite-streets-v12'
          : 'mapbox://styles/mapbox/light-v11',
      )
      btn.textContent = isSatellite ? 'Light' : 'Satellite'
    }
    styleSwitcher.appendChild(btn)
    map.addControl({ onAdd: () => styleSwitcher, onRemove: () => {} }, 'top-right')

    map.on('load', () => {
      if (pins.length === 0) return

      const bounds = new mapboxgl.LngLatBounds()

      pins.forEach((pin) => {
        const status = pin.eligibility_status.toLowerCase()
        const color = STATUS_COLOR[status] ?? '#64748b' // slate-500 fallback

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

        const popup = new mapboxgl.Popup({ offset: 14, closeButton: true })
          .setHTML(popupHtml)

        new mapboxgl.Marker({ element: el })
          .setLngLat([pin.longitude, pin.latitude])
          .setPopup(popup)
          .addTo(map)

        bounds.extend([pin.longitude, pin.latitude])
      })

      // Fit map to show all markers, with a comfortable padding
      // and a maxZoom so a single landbase doesn't zoom you down
      // to street level.
      if (!bounds.isEmpty()) {
        map.fitBounds(bounds, { padding: 60, maxZoom: 8, duration: 0 })
      }
    })

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [pins])

  return (
    <div className="space-y-3">
      <div
        ref={containerRef}
        className="h-[600px] w-full rounded-lg border border-slate-200 shadow-sm"
        style={{ minHeight: '600px' }}
      />
      <div className="flex flex-wrap gap-4 text-xs text-slate-600">
        <LegendDot color={STATUS_COLOR.eligible} label="Eligible" />
        <LegendDot color={STATUS_COLOR.ineligible} label="Ineligible" />
        <LegendDot color={STATUS_COLOR.expired} label="Expired / Suspended" />
      </div>
    </div>
  )
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-block h-3 w-3 rounded-full"
        style={{ background: color, border: '2px solid #fff', boxShadow: '0 1px 2px rgba(0,0,0,0.2)' }}
      />
      {label}
    </span>
  )
}

// Tiny html-escape for popup content (defends against odd
// characters in landbase names).
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}