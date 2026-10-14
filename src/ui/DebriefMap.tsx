import { useEffect, useRef } from 'preact/hooks'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { data } from '../data'
import { session, tableById, stateAt, lang } from '../state'
import { t } from '../i18n'
import { when } from '../lib/format'
import { C, RAIN } from '../theme'
import { addIcons, decisionIcon } from '../map/icons'
import { targetBonus } from '../lib/score'

// The debrief's picture: every decision the tables made, over what the storm actually did (its track, landfall and
// the rain measured at the NHC report's stations). Standing decisions that were on target get a green ring; decisions
// dropped before landfall are faded. Still, and kept in the drawing buffer so it prints.

const BASE = location.href.replace(/[?#].*$/, '').replace(/[^/]*$/, '')
const SLOTS: [number, number][] = [[0, 0], [14, -6], [-14, -6], [9, 12], [-9, 12], [0, -16]]

export function DebriefMap() {
  const el = useRef<HTMLDivElement>(null)
  const shot = useRef<HTMLImageElement>(null)
  const s = session.value
  const best = data.bestTrack.value
  const obs = data.observed.value

  useEffect(() => {
    if (!best || !obs) return
    const map = new maplibregl.Map({
      container: el.current!,
      style: { version: 8, glyphs: BASE + 'glyphs/{fontstack}/{range}.pbf', sources: {}, layers: [{ id: 'sea', type: 'background', paint: { 'background-color': C.sea } }] },
      bounds: [-67.35, 17.82, -65.2, 18.56], fitBoundsOptions: { padding: { top: 24, bottom: 24, left: 24, right: 24 } },
      interactive: false, attributionControl: false, fadeDuration: 0,
      canvasContextAttributes: { preserveDrawingBuffer: true },
    })
    // a still of the map for printing: a canvas resized for paper would be blank until it redraws
    map.on('idle', () => {
      if (matchMedia('print').matches || (el.current?.clientWidth ?? 0) < 200) return
      try { if (shot.current) shot.current.src = map.getCanvas().toDataURL('image/png') } catch { /* ignore */ }
    })
    const ro = new ResizeObserver(() => { if (!matchMedia('print').matches && (el.current?.clientWidth ?? 0) >= 200) map.resize() })
    ro.observe(el.current!)
    map.on('load', () => {
      addIcons(map)
      const last = s.rounds.length - 1
      const tb = tableById.value
      const slotOf: Record<string, number> = {}
      const decs = s.decisions.map(d => {
        const k = `${d.target.lon.toFixed(3)},${d.target.lat.toFixed(3)}`
        const slot = slotOf[k] = (slotOf[k] ?? -1) + 1
        const standing = stateAt(d, last).active
        return { type: 'Feature' as const, geometry: { type: 'Point' as const, coordinates: [d.target.lon, d.target.lat] },
          properties: { icon: decisionIcon(map, d.kind, tb[d.table]?.color ?? '#555'), standing, hit: standing && targetBonus(d).pts > 0, off: SLOTS[slot % SLOTS.length] } }
      })
      map.addSource('land', { type: 'geojson', data: data.land.value! })
      map.addSource('munis', { type: 'geojson', data: data.municipios.value! })
      if (data.hillshade.value) map.addSource('shade', { type: 'image', url: BASE + 'data/geo/hillshade.png', coordinates: data.hillshade.value.coordinates as any })
      map.addSource('rain', { type: 'geojson', data: { type: 'FeatureCollection', features: obs.rain.gauges.map(g => ({ type: 'Feature', properties: { in: g.in }, geometry: { type: 'Point', coordinates: [g.lon, g.lat] } })) } })
      map.addSource('best', { type: 'geojson', data: best.line })
      map.addSource('landfall', { type: 'geojson', data: { type: 'Feature', properties: { text: `${t('landfall')} ${when(data.scenario.value!.landfall.t)}` }, geometry: { type: 'Point', coordinates: [data.scenario.value!.landfall.lon, data.scenario.value!.landfall.lat] } } })
      map.addSource('dec', { type: 'geojson', data: { type: 'FeatureCollection', features: decs } })
      const add = (l: any) => map.addLayer(l)
      add({ id: 'land', type: 'fill', source: 'land', filter: ['!=', ['get', 'pr'], 2], paint: { 'fill-color': ['case', ['==', ['get', 'pr'], 1], C.landPR, C.land] } })
      if (data.hillshade.value) add({ id: 'shade', type: 'raster', source: 'shade', paint: { 'raster-opacity': 0.7, 'raster-fade-duration': 0 } })
      add({ id: 'munis', type: 'line', source: 'munis', paint: { 'line-color': '#9AA6B4', 'line-width': 0.6, 'line-opacity': 0.7 } })
      add({ id: 'coast', type: 'line', source: 'land', filter: ['==', ['get', 'pr'], 1], paint: { 'line-color': '#2E3B4E', 'line-width': 1.1 } })
      add({ id: 'rain', type: 'circle', source: 'rain', paint: { 'circle-radius': ['interpolate', ['linear'], ['get', 'in'], 0, 3, 15, 7, 32, 13],
        'circle-color': ['interpolate', ['linear'], ['get', 'in'], ...RAIN.flatMap(([v, c]) => [v, c])], 'circle-stroke-color': '#fff', 'circle-stroke-width': 1, 'circle-opacity': 0.85 } })
      add({ id: 'best-case', type: 'line', source: 'best', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#fff', 'line-width': 6.5 } })
      add({ id: 'best', type: 'line', source: 'best', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#C8102E', 'line-width': 3.4 } })
      add({ id: 'landfall', type: 'symbol', source: 'landfall', layout: { 'icon-image': 'landfall', 'icon-allow-overlap': true, 'text-field': ['get', 'text'], 'text-font': ['Open Sans Bold'], 'text-size': 12.5, 'text-anchor': 'top-left', 'text-offset': [0.9, 0.4], 'text-max-width': 12 },
        paint: { 'text-color': '#8B0000', 'text-halo-color': '#fff', 'text-halo-width': 1.8 } })
      if (!map.hasImage('hit-ring')) {
        const R = 2, n = 38, cv = document.createElement('canvas'); cv.width = cv.height = n * R
        const c = cv.getContext('2d')!; c.scale(R, R); c.strokeStyle = '#2F7D45'; c.lineWidth = 3.2
        c.beginPath(); c.arc(n / 2, n / 2, n / 2 - 2.5, 0, Math.PI * 2); c.stroke()
        map.addImage('hit-ring', c.getImageData(0, 0, n * R, n * R), { pixelRatio: R })
      }
      add({ id: 'dec-hit', type: 'symbol', source: 'dec', filter: ['get', 'hit'], layout: { 'icon-image': 'hit-ring', 'icon-allow-overlap': true, 'icon-ignore-placement': true, 'icon-offset': ['get', 'off'] } })
      add({ id: 'dec', type: 'symbol', source: 'dec', layout: { 'icon-image': ['get', 'icon'], 'icon-allow-overlap': true, 'icon-ignore-placement': true, 'icon-offset': ['get', 'off'], 'symbol-sort-key': ['case', ['get', 'standing'], 1, 0] },
        paint: { 'icon-opacity': ['case', ['get', 'standing'], 1, 0.35] } })
    })
    return () => { ro.disconnect(); map.remove() }
  }, [best, obs, s.decisions, lang.value])

  if (!best || !obs) return <div class="db-map loading" />
  return (
    <figure class="db-mapfig">
      <div ref={el} class="db-map" role="img" aria-label={t('dbMapTitle')} />
      <img ref={shot} class="db-map-print" alt={t('dbMapTitle')} />
      <figcaption class="db-key">
        <span><i class="k-track" />{t('dbKeyTrack')}</span>
        <span><i class="k-ramp">{RAIN.slice(1).map(([, c]) => <b style={{ background: c }} />)}</i>{t('dbKeyRain')}</span>
        <span><i class="k-hit" />{t('dbKeyHit')}</span>
        <span><i class="k-faded" />{t('dbKeyDropped')}</span>
      </figcaption>
    </figure>
  )
}
