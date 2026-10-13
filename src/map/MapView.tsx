import { useEffect, useRef } from 'preact/hooks'
import { effect, signal } from '@preact/signals'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { data, advGeo, loadAdv, muni, point, tract } from '../data'
import { session, layers, advNum, selected, lens, pinMode, tableById, activeDecisions, lang, isReveal } from '../state'
import { C, PROB, COMMUNITY, FLOOD_LEVEL, RAIN } from '../theme'
import { addIcons, decisionIcon, KIND_ICON } from './icons'
import * as F from './features'
import { LENSES } from '../lib/lens'
import { muniAt } from '../lib/geo'
import { dayTime, when } from '../lib/format'
import { t } from '../i18n'
import type { Target } from '../types'

export const mapRef = signal<maplibregl.Map | null>(null)
const BASE = location.href.replace(/[?#].*$/, '').replace(/[^/]*$/, '')

export const PR_BOUNDS: [number, number, number, number] = [-67.4, 17.82, -65.2, 18.6]
export const REGION_BOUNDS: [number, number, number, number] = [-72.8, 14.2, -53.5, 22.6]

const DEC_SLOTS: [number, number][] = [[0, -16], [17, -6], [-17, -6], [10, 12], [-10, 12], [0, -34]]
const empty: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }
const probColor: any = ['step', ['get', 'lo'], 'rgba(0,0,0,0)', ...PROB.flatMap(([v, c]) => [v, c])]

export function MapView() {
  const el = useRef<HTMLDivElement>(null)
  const tip = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const map = new maplibregl.Map({
      container: el.current!,
      style: {
        version: 8,
        glyphs: BASE + 'glyphs/{fontstack}/{range}.pbf',
        sources: {},
        layers: [{ id: 'sea', type: 'background', paint: { 'background-color': C.sea } }],
      },
      bounds: REGION_BOUNDS, fitBoundsOptions: { padding: 30 },
      minZoom: 4.5, maxZoom: 15, attributionControl: false, dragRotate: false, pitchWithRotate: false,
      maxBounds: [[-90, 2], [-35, 36]],
    })
    map.touchZoomRotate.disableRotation()
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right')
    map.addControl(new maplibregl.ScaleControl({ unit: lang.value === 'es' ? 'metric' : 'imperial', maxWidth: 110 }), 'bottom-right')
    const attrib = new maplibregl.AttributionControl({ compact: true, customAttribution: 'NOAA NHC, NWS, USGS, FEMA, CDC/ATSDR, HHS, US Census, HUD, PR Departamento de la Vivienda, © OpenStreetMap contributors, Natural Earth' })
    map.addControl(attrib, 'bottom-right')
    // start collapsed: the (i) opens it
    map.once('load', () => el.current?.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show'))
    ;(window as any).__map = map

    const ro = new ResizeObserver(() => map.resize())
    ro.observe(el.current!)
    const disposers: (() => void)[] = []

    map.on('load', () => {
      addIcons(map)
      build(map)
      mapRef.value = map
      disposers.push(...bind(map, tip.current!))
      ;(globalThis as any).__landfall.mapReady = true
      map.once('idle', () => { (globalThis as any).__landfall.mapIdle = true })
    })
    return () => { disposers.forEach(d => d()); ro.disconnect(); map.remove(); mapRef.value = null }
  }, [])

  return (
    <div class={'map-wrap' + (pinMode.value ? ' pinning' : '')}>
      <div ref={el} class="map" aria-label="Map" />
      <div ref={tip} class="map-tip" hidden />
      {pinMode.value && <div class="pin-hint">{t('dropPinHint')}</div>}
    </div>
  )
}

// ------------------------------------------------------------------------------------------------ layers

function build(map: maplibregl.Map) {
  const P = data.places.value!
  const g = F.graticule()
  const munis = F.enrichMunis(data.municipios.value!, P)
  const tracts = F.enrichTracts(data.tracts.value!, P)

  map.addSource('graticule', { type: 'geojson', data: g.lines })
  map.addSource('graticule-labels', { type: 'geojson', data: g.labels })
  map.addSource('land', { type: 'geojson', data: data.land.value! })
  map.addSource('munis', { type: 'geojson', data: munis, promoteId: 'id' })
  map.addSource('tracts', { type: 'geojson', data: tracts, promoteId: 'id' })
  map.addSource('muni-labels', { type: 'geojson', data: F.muniLabels(P) })
  map.addSource('places', { type: 'geojson', data: F.placesFC(P), promoteId: 'id' })
  for (const k of ['prob', 'cone', 'track', 'fpoints', 'warnings', 'radii', 'center', 'ghost-cones', 'ghost-tracks', 'dec', 'dec-areas', 'roads', 'bridges', 'best', 'landfall', 'ffw', 'rain', 'rivers', 'fcst-tracks'])
    map.addSource(k, { type: 'geojson', data: empty })
  if (data.hillshade.value) map.addSource('hillshade', { type: 'image', url: BASE + 'data/geo/hillshade.png', coordinates: data.hillshade.value.coordinates as any })
  for (const c of ['c1', 'c2', 'c3', 'c4', 'c5'])
    map.addSource('surge-' + c, { type: 'raster', tiles: [BASE + `tiles/surge/${c}/{z}/{x}/{y}.png`], tileSize: 256, minzoom: 8, maxzoom: 13, bounds: [-67.95, 17.85, -65.2, 18.55] })
  map.addSource('slide', { type: 'raster', tiles: [BASE + 'tiles/slide/{z}/{x}/{y}.png'], tileSize: 256, minzoom: 8, maxzoom: 13, bounds: [-67.28, 17.9, -65.58, 18.52] })

  const add = (l: any) => map.addLayer(l)
  add({ id: 'graticule', type: 'line', source: 'graticule', paint: { 'line-color': C.graticule, 'line-width': ['case', ['get', 'major'], 1, 0.5], 'line-opacity': ['interpolate', ['linear'], ['zoom'], 5, 0.9, 9, 0.5, 11, 0] } })
  add({ id: 'land-other', type: 'fill', source: 'land', filter: ['==', ['get', 'pr'], 0], paint: { 'fill-color': C.land } })
  // Puerto Rico's watch/warning as a band just off its own coast (the land fill above hides the inner half)
  add({ id: 'pr-warning', type: 'line', source: 'land', minzoom: 7.4, filter: ['==', ['get', 'pr'], 2], layout: { 'line-join': 'round', visibility: 'none' },
    paint: { 'line-color': C.HWR, 'line-width': ['interpolate', ['linear'], ['zoom'], 7.4, 7, 10, 12], 'line-opacity': ['interpolate', ['linear'], ['zoom'], 7.4, 0, 7.8, 1] } })
  add({ id: 'land-pr', type: 'fill', source: 'land', filter: ['==', ['get', 'pr'], 1], paint: { 'fill-color': C.landPR } })
  if (data.hillshade.value) add({ id: 'hillshade', type: 'raster', source: 'hillshade', paint: { 'raster-opacity': ['interpolate', ['linear'], ['zoom'], 6, 0.35, 8.5, 0.85, 12, 0.6], 'raster-fade-duration': 0, 'raster-resampling': 'linear' } })
  add({ id: 'land-pr-edge', type: 'line', source: 'land', filter: ['==', ['get', 'pr'], 1], paint: { 'line-color': '#7E8C9B', 'line-width': ['interpolate', ['linear'], ['zoom'], 6, 0.5, 10, 1.1] } })

  // community choropleths
  const ramp = (prop: string, max = 1): any => ['interpolate', ['linear'], ['get', prop], ...COMMUNITY.flatMap(([v, c]) => [v * max, c])]
  add({ id: 'tract-fill', type: 'fill', source: 'tracts', layout: { visibility: 'none' }, paint: { 'fill-color': ramp('svi'), 'fill-opacity': 0.85 } })
  add({ id: 'muni-fill-community', type: 'fill', source: 'munis', layout: { visibility: 'none' }, paint: { 'fill-color': ramp('empower', 40), 'fill-opacity': 0.85 } })
  add({ id: 'muni-fill-ia', type: 'fill', source: 'munis', layout: { visibility: 'none' },
    paint: { 'fill-color': ['interpolate', ['linear'], ['get', 'ia'], 0, '#F4F1F6', 40, '#D2C2DB', 80, '#A98CBC', 120, '#7B5A98', 160, '#4E3270'], 'fill-opacity': 0.8 } })

  // static hazard rasters
  for (const c of ['c1', 'c2', 'c3', 'c4', 'c5']) add({ id: 'surge-' + c, type: 'raster', source: 'surge-' + c, layout: { visibility: 'none' }, paint: { 'raster-opacity': 0.85, 'raster-fade-duration': 0, 'raster-resampling': 'nearest' } })
  add({ id: 'slide', type: 'raster', source: 'slide', layout: { visibility: 'none' }, paint: { 'raster-opacity': 0.8, 'raster-fade-duration': 0, 'raster-resampling': 'nearest' } })

  // wind probabilities: filled bands, or contour lines when a community map is underneath
  add({ id: 'prob-fill', type: 'fill', source: 'prob', paint: { 'fill-color': probColor, 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 5, 0.62, 9, 0.5, 11, 0.38], 'fill-antialias': false } })
  add({ id: 'prob-line', type: 'line', source: 'prob', paint: { 'line-color': probColor, 'line-width': ['interpolate', ['linear'], ['get', 'lo'], 5, 0.6, 50, 1.6, 90, 2.6], 'line-opacity': 0.9 } })

  // coastlines of the other islands stay legible over the probability shading
  add({ id: 'land-other-line', type: 'line', source: 'land', filter: ['==', ['get', 'pr'], 0], paint: { 'line-color': '#6F7D8C', 'line-width': ['interpolate', ['linear'], ['zoom'], 5, 0.6, 9, 1.1] } })

  // lens highlight
  add({ id: 'muni-hl', type: 'fill', source: 'munis', paint: { 'fill-color': '#F2B705', 'fill-opacity': ['case', ['boolean', ['feature-state', 'hl'], false], 0.32, 0] } })
  add({ id: 'tract-hl', type: 'fill', source: 'tracts', paint: { 'fill-color': '#F2B705', 'fill-opacity': ['case', ['boolean', ['feature-state', 'hl'], false], 0.45, 0] } })
  add({ id: 'tract-hl-line', type: 'line', source: 'tracts', paint: { 'line-color': '#8A6500', 'line-width': ['case', ['boolean', ['feature-state', 'hl'], false], 1.1, 0] } })

  // reveal: NWS flood warnings
  add({ id: 'ffw-fill', type: 'fill', source: 'ffw', paint: { 'fill-color': ['match', ['get', 'kind'], 'FF.W', '#8B0000', '#1E8A3A'], 'fill-opacity': 0.12 } })
  add({ id: 'ffw-line', type: 'line', source: 'ffw', paint: { 'line-color': ['match', ['get', 'kind'], 'FF.W', '#8B0000', '#1E8A3A'], 'line-width': ['case', ['get', 'emergency'], 3.4, 1.4] } })

  // boundaries
  add({ id: 'muni-fill', type: 'fill', source: 'munis', paint: { 'fill-color': '#000', 'fill-opacity': 0 } })
  add({ id: 'tract-line', type: 'line', source: 'tracts', layout: { visibility: 'none' }, minzoom: 9.5, paint: { 'line-color': '#FFFFFF', 'line-width': 0.5, 'line-opacity': 0.8 } })
  add({ id: 'muni-line', type: 'line', source: 'munis', paint: { 'line-color': C.boundary, 'line-width': ['interpolate', ['linear'], ['zoom'], 7, 0.3, 9, 0.8, 12, 1.4], 'line-opacity': ['interpolate', ['linear'], ['zoom'], 6.5, 0, 7.5, 1] } })
  add({ id: 'muni-hl-line', type: 'line', source: 'munis', paint: { 'line-color': '#8A6500', 'line-width': ['case', ['boolean', ['feature-state', 'hl'], false], 1.6, 0] } })
  add({ id: 'muni-sel', type: 'line', source: 'munis', paint: { 'line-color': C.ink, 'line-width': ['case', ['boolean', ['feature-state', 'sel'], false], 3, 0] } })
  add({ id: 'tract-sel', type: 'line', source: 'tracts', paint: { 'line-color': C.ink, 'line-width': ['case', ['boolean', ['feature-state', 'sel'], false], 2.5, 0] } })

  // roads and exposed bridges
  add({ id: 'roads-case', type: 'line', source: 'roads', layout: { visibility: 'none', 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#FFFFFF', 'line-width': ['interpolate', ['linear'], ['zoom'], 8, ['match', ['get', 'c'], 1, 2.6, 2, 2, 1.4], 12, ['match', ['get', 'c'], 1, 6, 2, 4.5, 3.5]] } })
  add({ id: 'roads', type: 'line', source: 'roads', layout: { visibility: 'none', 'line-join': 'round', 'line-cap': 'round' },
    paint: { 'line-color': ['case', ['>=', ['get', 's'], 0.25], '#B5541B', '#56657A'], 'line-width': ['interpolate', ['linear'], ['zoom'], 8, ['match', ['get', 'c'], 1, 1.4, 2, 1, 0.6], 12, ['match', ['get', 'c'], 1, 3.6, 2, 2.6, 1.8]] } })
  add({ id: 'bridges', type: 'circle', source: 'bridges', layout: { visibility: 'none' }, minzoom: 8.5,
    paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 8.5, 1.8, 12, 4.5], 'circle-color': ['case', ['>=', ['get', 's'], 3], '#B5541B', '#2563C9'], 'circle-stroke-color': '#fff', 'circle-stroke-width': 0.8 } })

  // forecast
  add({ id: 'ghost-cones', type: 'line', source: 'ghost-cones', paint: { 'line-color': C.inkSoft, 'line-width': 1, 'line-dasharray': [3, 3], 'line-opacity': ['interpolate', ['linear'], ['get', 'age'], 1, 0.55, 4, 0.2] } })
  add({ id: 'ghost-tracks', type: 'line', source: 'ghost-tracks', paint: { 'line-color': C.inkSoft, 'line-width': 1.4, 'line-opacity': ['interpolate', ['linear'], ['get', 'age'], 1, 0.6, 4, 0.22] } })
  add({ id: 'cone-fill', type: 'fill', source: 'cone', paint: { 'fill-color': C.cone, 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 5, 0.42, 9, 0.22] } })
  add({ id: 'cone-line', type: 'line', source: 'cone', paint: { 'line-color': C.ink, 'line-width': 1.4, 'line-opacity': 0.85 } })
  add({ id: 'radii-fill', type: 'fill', source: 'radii', layout: { visibility: 'none' }, paint: { 'fill-color': ['match', ['get', 'kt'], 64, '#C8102E', 50, '#E86A1F', '#F2B705'], 'fill-opacity': 0.18 } })
  add({ id: 'radii-line', type: 'line', source: 'radii', layout: { visibility: 'none' }, paint: { 'line-color': ['match', ['get', 'kt'], 64, '#C8102E', 50, '#E86A1F', '#C99700'], 'line-width': 1.4 } })
  add({ id: 'warnings-case', type: 'line', source: 'warnings', maxzoom: 7.6, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#FFFFFF', 'line-width': ['interpolate', ['linear'], ['zoom'], 5, 5, 7.5, 7] } })
  add({ id: 'warnings', type: 'line', source: 'warnings', maxzoom: 7.6, layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': ['match', ['get', 'code'], 'HWR', C.HWR, 'HWA', C.HWA, 'TWR', C.TWR, C.TWA], 'line-width': ['interpolate', ['linear'], ['zoom'], 5, 3.4, 7.5, 5] } })
  add({ id: 'fcst-tracks', type: 'line', source: 'fcst-tracks', paint: { 'line-color': ['get', 'color'], 'line-width': 1.6, 'line-opacity': 0.75, 'line-dasharray': [2, 1.5] } })
  add({ id: 'track', type: 'line', source: 'track', paint: { 'line-color': C.track, 'line-width': 2, 'line-dasharray': [1, 0] } })
  add({ id: 'best', type: 'line', source: 'best', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#C8102E', 'line-width': 3.4 } })
  add({ id: 'fpoints', type: 'circle', source: 'fpoints', paint: { 'circle-radius': 6.5, 'circle-color': ['case', ['==', ['get', 'hu'], 1], '#C8102E', '#FFFFFF'], 'circle-stroke-color': ['case', ['==', ['get', 'hu'], 1], '#C8102E', C.ink], 'circle-stroke-width': 1.6 } })
  add({ id: 'fpoints-letter', type: 'symbol', source: 'fpoints', layout: { 'text-field': ['get', 'letter'], 'text-font': ['Open Sans Bold'], 'text-size': 10, 'text-allow-overlap': true }, paint: { 'text-color': ['case', ['==', ['get', 'hu'], 1], '#FFFFFF', C.ink] } })
  add({ id: 'fpoints-label', type: 'symbol', source: 'fpoints', layout: { 'text-field': ['get', 'text'], 'text-font': ['Open Sans Semibold'], 'text-size': 11.5, 'text-anchor': 'left', 'text-offset': [0.95, 0], 'text-justify': 'left', 'text-line-height': 1.15, 'text-optional': true },
    paint: { 'text-color': C.ink, 'text-halo-color': 'rgba(255,255,255,0.92)', 'text-halo-width': 1.6 } })

  // labels
  add({ id: 'muni-labels', type: 'symbol', source: 'muni-labels', minzoom: 7.6,
    layout: { 'text-field': ['get', 'name'], 'text-font': ['Open Sans Semibold'], 'text-size': ['interpolate', ['linear'], ['zoom'], 8, 10, 10, 12.5, 12, 15], 'symbol-sort-key': ['-', 0, ['get', 'pop']], 'text-padding': 3, 'text-max-width': 7 },
    paint: { 'text-color': '#334155', 'text-halo-color': 'rgba(246,246,242,0.9)', 'text-halo-width': 1.4 } })

  // decisions on areas
  add({ id: 'dec-areas', type: 'line', source: 'dec-areas', paint: { 'line-color': ['get', 'color'], 'line-width': 2.6, 'line-opacity': 0.95 } })
  add({ id: 'dec-areas-fill', type: 'fill', source: 'dec-areas', paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.08 } })

  // places
  const vis = (g: string): any => ['==', ['get', 'group'], g]
  add({ id: 'places-halo', type: 'circle', source: 'places', paint: {
    'circle-radius': ['case', ['boolean', ['feature-state', 'sel'], false], 16, ['boolean', ['feature-state', 'hl'], false], 13, 0],
    'circle-color': ['case', ['boolean', ['feature-state', 'sel'], false], 'rgba(20,33,61,0.18)', 'rgba(242,183,5,0.55)'],
    'circle-stroke-color': ['case', ['boolean', ['feature-state', 'sel'], false], C.ink, '#8A6500'], 'circle-stroke-width': ['case', ['boolean', ['feature-state', 'sel'], false], 2, ['boolean', ['feature-state', 'hl'], false], 1.2, 0] } })
  add({ id: 'places-dots', type: 'circle', source: 'places', filter: vis('shelters'), minzoom: 7, maxzoom: 9.6,
    paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 7, 1.6, 9.5, 3.2], 'circle-color': ['match', ['get', 'group'], 'health', '#C8102E', 'shelters', C.ink, '#56657A'],
      'circle-stroke-color': '#fff', 'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 7, 0.6, 9.5, 1.2] } })
  add({ id: 'places-icons', type: 'symbol', source: 'places', filter: vis('shelters'), minzoom: 9.6,
    layout: { 'icon-image': ['match', ['get', 'kind'], ...Object.entries(KIND_ICON).flat(), 'i-shelter'],
      'icon-size': ['interpolate', ['linear'], ['zoom'], 9.6, 0.8, 12, 1.05], 'icon-allow-overlap': ['step', ['zoom'], false, 11, true], 'icon-padding': 1,
      'symbol-sort-key': ['get', 'rank'], 'text-field': ['step', ['zoom'], '', 11.5, ['get', 'name']], 'text-font': ['Open Sans Regular'], 'text-size': 11,
      'text-anchor': 'top', 'text-offset': [0, 1.0], 'text-optional': true, 'text-max-width': 9 },
    paint: { 'text-color': C.ink, 'text-halo-color': 'rgba(255,255,255,0.9)', 'text-halo-width': 1.3 } })

  // reveal: what was measured
  add({ id: 'rivers', type: 'circle', source: 'rivers', paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 7, 4, 11, 8], 'circle-color': ['match', ['get', 'level'], 'major', FLOOD_LEVEL.major, 'moderate', FLOOD_LEVEL.moderate, 'minor', FLOOD_LEVEL.minor, 'action', FLOOD_LEVEL.action, '#9AA5B1'],
    'circle-stroke-color': '#fff', 'circle-stroke-width': 1.4 } })
  add({ id: 'rain', type: 'circle', source: 'rain', paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 7, ['interpolate', ['linear'], ['get', 'in'], 0, 2, 20, 5, 35, 8], 10, ['interpolate', ['linear'], ['get', 'in'], 0, 4, 20, 10, 35, 15]],
    'circle-color': ['interpolate', ['linear'], ['get', 'in'], ...RAIN.flatMap(([v, c]) => [v, c])], 'circle-stroke-color': '#fff', 'circle-stroke-width': 1.2, 'circle-opacity': 0.92 } })
  add({ id: 'rain-label', type: 'symbol', source: 'rain', filter: ['>=', ['get', 'in'], 15], layout: { 'text-field': ['concat', ['to-string', ['round', ['get', 'in']]], '″'], 'text-font': ['Open Sans Bold'], 'text-size': 11, 'text-allow-overlap': false },
    paint: { 'text-color': '#fff' } })

  add({ id: 'ffw-emergency', type: 'symbol', source: 'ffw', filter: ['==', ['get', 'emergency'], true],
    layout: { 'text-field': lang.value === 'es' ? 'Emergencia por inundación repentina' : 'Flash flood emergency', 'text-font': ['Open Sans Bold'], 'text-size': 12, 'text-max-width': 9, 'text-anchor': 'top', 'text-offset': [0, 1.4] },
    paint: { 'text-color': '#8B0000', 'text-halo-color': '#fff', 'text-halo-width': 1.8 } })

  // decisions as marks
  // several tables on one target fan out: one layer per slot, each with its own offset
  DEC_SLOTS.forEach((off, i) => add({ id: 'dec-' + i, type: 'symbol', source: 'dec', filter: ['==', ['get', 'slot'], i],
    layout: { 'icon-image': ['get', 'icon'], 'icon-allow-overlap': true, 'icon-ignore-placement': true, 'icon-offset': off, 'icon-size': ['interpolate', ['linear'], ['zoom'], 7, 0.8, 10, 1] } }))

  // storm
  add({ id: 'center', type: 'symbol', source: 'center', layout: { 'icon-image': ['get', 'icon'], 'icon-allow-overlap': true, 'icon-size': 1.15 } })
  add({ id: 'landfall', type: 'symbol', source: 'landfall', layout: { 'icon-image': 'landfall', 'icon-allow-overlap': true, 'text-field': ['get', 'text'], 'text-font': ['Open Sans Bold'], 'text-size': 12.5, 'text-anchor': 'top-left', 'text-offset': [0.9, 0.5], 'text-max-width': 14 },
    paint: { 'text-color': '#8E0A1F', 'text-halo-color': '#fff', 'text-halo-width': 1.8 } })
  add({ id: 'graticule-labels', type: 'symbol', source: 'graticule-labels', maxzoom: 8.5, layout: { 'text-field': ['get', 't'], 'text-font': ['Open Sans Regular'], 'text-size': 10.5,
      'text-anchor': ['match', ['get', 'axis'], 'lat', 'bottom-left', 'top-left'], 'text-offset': ['match', ['get', 'axis'], 'lat', ['literal', [0.3, -0.1]], ['literal', [0.3, 0.2]]], 'text-padding': 0 },
    paint: { 'text-color': '#6B8594', 'text-halo-color': C.sea, 'text-halo-width': 1.5 } })
}

// ------------------------------------------------------------------------------------------- reactivity

function bind(map: maplibregl.Map, tipEl: HTMLDivElement) {
  const src = (id: string) => map.getSource(id) as maplibregl.GeoJSONSource
  const visible = (id: string, on: boolean) => { if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none') }
  const out: (() => void)[] = []

  // forecast of the advisory on screen
  out.push(effect(() => {
    const n = advNum.value
    const L = layers.value
    const g = advGeo.value[n]
    const S = data.scenario.value!
    if (!g) { loadAdv(n); return }
    src('prob').setData({ type: 'FeatureCollection', features: L.wind === 'off' || isReveal.value ? [] : [...g.prob[L.wind]].sort((a, b) => (a.properties as any).lo - (b.properties as any).lo) })
    src('cone').setData({ type: 'FeatureCollection', features: L.cone ? g.cone : [] })
    src('track').setData({ type: 'FeatureCollection', features: g.track })
    src('warnings').setData(g.warnings)
    src('radii').setData(F.radiiNow(g))
    src('center').setData(F.centerFC(S, n))
    const lg = lang.value
    src('fpoints').setData(F.forecastPointsFC(g, lg, dayTime))
    const a = S.advisories.find(x => x.num === n)
    const code = a ? prStatusCode(a.prWarnings) : null
    if (code) { map.setPaintProperty('pr-warning', 'line-color', ({ HWR: C.HWR, HWA: C.HWA, TWR: C.TWR, TWA: C.TWA } as any)[code]); visible('pr-warning', !isReveal.value) }
    else visible('pr-warning', false)
    const community = L.community !== 'off'
    visible('prob-fill', !community); visible('prob-line', community)
    visible('radii-fill', L.radii); visible('radii-line', L.radii)
  }))

  // earlier forecasts (ghosts) and, at the reveal, every round's track against the actual one
  out.push(effect(() => {
    const s = session.value
    const geos = advGeo.value
    const upto = Math.min(s.round, s.rounds.length)
    s.rounds.slice(0, upto).forEach(n => { if (!geos[n]) loadAdv(n) })
    const shown = s.rounds.indexOf(advNum.value)
    const gh = F.ghostsFC(s.rounds, isReveal.value ? 0 : Math.max(0, shown), geos)
    const on = layers.value.ghosts && !isReveal.value
    src('ghost-cones').setData(on ? gh.cones : empty)
    src('ghost-tracks').setData(on ? gh.tracks : empty)
    if (isReveal.value) {
      const cols = ['#8FA3BF', '#6C84A8', '#4C6790', '#2F4B78', '#14213D', '#0B1426']
      src('fcst-tracks').setData({ type: 'FeatureCollection', features: s.rounds.flatMap((n, i) => (geos[n]?.track ?? []).map(f => ({ ...f, properties: { color: cols[Math.min(i, cols.length - 1)], num: n } }))) })
    } else src('fcst-tracks').setData(empty)
  }))

  // the reveal
  out.push(effect(() => {
    const on = isReveal.value
    const bt = data.bestTrack.value, ob = data.observed.value, S = data.scenario.value!
    src('best').setData(on && bt ? { type: 'FeatureCollection', features: [bt.line] } : empty)
    src('landfall').setData(on ? { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { text: `${t('landfall')} ${when(S.landfall.t)} AST` }, geometry: { type: 'Point', coordinates: [S.landfall.lon, S.landfall.lat] } }] } : empty)
    src('ffw').setData(on && ob ? ob.warnings : empty)
    src('rain').setData(on && ob ? { type: 'FeatureCollection', features: ob.rain.gauges.map(r => ({ type: 'Feature', properties: { in: r.in, name: r.name }, geometry: { type: 'Point', coordinates: [r.lon, r.lat] } })) } : empty)
    src('rivers').setData(on && ob ? { type: 'FeatureCollection', features: ob.rivers.gauges.map(r => ({ type: 'Feature', properties: { level: r.level ?? 'none', name: r.name }, geometry: { type: 'Point', coordinates: [r.lon, r.lat] } })) } : empty)
    visible('muni-fill-ia', on && revealLayers.value.ia)
    for (const id of ['cone-fill', 'cone-line', 'track', 'fpoints', 'fpoints-letter', 'fpoints-label', 'center', 'warnings', 'warnings-case', 'prob-fill', 'prob-line']) if (on) visible(id, false)
    if (!on) { for (const id of ['cone-fill', 'cone-line', 'track', 'fpoints', 'fpoints-letter', 'fpoints-label', 'center', 'warnings', 'warnings-case']) visible(id, true) }
    visible('ffw-fill', on && revealLayers.value.ffw); visible('ffw-line', on && revealLayers.value.ffw); visible('ffw-emergency', on && revealLayers.value.ffw)
    visible('rain', on && revealLayers.value.rain); visible('rain-label', on && revealLayers.value.rain)
    visible('rivers', on && revealLayers.value.rivers)
    visible('fcst-tracks', on && revealLayers.value.tracks); visible('best', on); visible('landfall', on)
  }))

  // static layers
  out.push(effect(() => {
    const L = layers.value
    for (const c of ['c1', 'c2', 'c3', 'c4', 'c5']) visible('surge-' + c, L.surge === c)
    visible('slide', L.slide)
    visible('roads', L.roads); visible('roads-case', L.roads); visible('bridges', L.roads)
    if (L.roads && data.roads.value) src('roads').setData(data.roads.value)
    if (L.roads && data.bridges.value) src('bridges').setData(data.bridges.value)
    const com = L.community
    visible('tract-fill', com !== 'off' && com !== 'empower'); visible('tract-line', com !== 'off' && com !== 'empower')
    visible('muni-fill-community', com === 'empower')
    if (com !== 'off' && com !== 'empower') {
      const max = com === 'svi' ? 1 : com === 'age65' ? 0.4 : com === 'noveh' ? 0.4 : 0.35
      map.setPaintProperty('tract-fill', 'fill-color', ['case', ['<', ['get', com], 0], '#E5E7EB', ['interpolate', ['linear'], ['get', com], ...COMMUNITY.flatMap(([v, c]) => [v * max, c])]])
    }
    const groups = (['shelters', 'health', 'utilities', 'transport', 'housing', 'venues', 'responders'] as const).filter(k => L[k])
    const f: any = ['in', ['get', 'group'], ['literal', groups]]
    map.setFilter('places-icons', f); map.setFilter('places-halo', f); map.setFilter('places-dots', f)
  }))

  // decisions
  out.push(effect(() => {
    const ds = activeDecisions.value
    const tb = tableById.value
    src('dec').setData(F.decisionsFC(ds, tb, (k, c) => decisionIcon(map, k, c)))
    src('dec-areas').setData(F.decisionAreasFC(ds, tb, data.municipios.value, data.tracts.value))
  }))

  // selection
  let lastSel: { src: string; id: string } | null = null
  out.push(effect(() => {
    const s = selected.value
    if (lastSel) map.setFeatureState({ source: lastSel.src, id: lastSel.id }, { sel: false })
    lastSel = null
    if (!s) return
    const sid = s.type === 'municipio' ? 'munis' : s.type === 'tract' ? 'tracts' : s.type === 'point' ? 'places' : null
    if (sid) { map.setFeatureState({ source: sid, id: s.id }, { sel: true }); lastSel = { src: sid, id: s.id } }
  }))

  // lens highlight
  let lastHl: { src: string; ids: string[] } | null = null
  out.push(effect(() => {
    const id = lens.value
    const n = advNum.value
    const s = session.value
    if (lastHl) for (const x of lastHl.ids) map.setFeatureState({ source: lastHl.src, id: x }, { hl: false })
    lastHl = null
    if (!id) return
    const L = LENSES.find(l => l.id === id)
    if (!L) return
    const r = s.rounds.indexOf(n)
    const res = L.run(n, r > 0 ? s.rounds[r - 1] : null)
    const sid = res.map.level === 'muni' ? 'munis' : res.map.level === 'tract' ? 'tracts' : 'places'
    for (const x of res.map.ids) map.setFeatureState({ source: sid, id: x }, { hl: true })
    lastHl = { src: sid, ids: res.map.ids }
    if (res.map.level === 'point') {
      // make sure the highlighted kinds are visible
      const kinds = new Set(res.map.ids.map(i => point(i)?.kind))
      const L2 = { ...layers.value }
      if (kinds.has('shelter')) L2.shelters = true
      if (kinds.has('hospital')) L2.health = true
      if (kinds.has('water') || kinds.has('power')) L2.utilities = true
      if (kinds.has('airport') || kinds.has('seaport')) L2.transport = true
      if (JSON.stringify(L2) !== JSON.stringify(layers.value)) layers.value = L2
    }
  }))

  // camera follows the round: storm far away -> region; near -> Puerto Rico
  let lastRound = -1
  out.push(effect(() => {
    const r = session.value.round
    const rv = isReveal.value
    if (r === lastRound) return
    lastRound = r
    const S = data.scenario.value!
    const a = S.advisories.find(x => x.num === session.value.rounds[Math.min(r, session.value.rounds.length - 1)])
    const pad = { top: 50, bottom: 40, left: 60, right: 60 }
    if (rv) { map.fitBounds([[-67.45, 17.75], [-65.2, 18.65]], { padding: pad, duration: 900 }); return }
    if (!a) return
    const d = a.center.lon - PR_BOUNDS[2]
    if (d > 2) map.fitBounds([[-68.4, Math.min(15.2, a.center.lat - 2)], [Math.min(-52.5, a.center.lon + 3), Math.max(21, a.center.lat + 3)]], { padding: pad, duration: r === 0 ? 0 : 900 })
    else map.fitBounds([[Math.min(PR_BOUNDS[0], a.center.lon - 0.6), Math.min(PR_BOUNDS[1], a.center.lat - 0.6)], [Math.max(PR_BOUNDS[2], a.center.lon + 0.6), Math.max(PR_BOUNDS[3], a.center.lat + 0.3)]], { padding: pad, duration: 900 })
  }))

  // clicks
  const clickLayers = [...DEC_SLOTS.map((_, i) => 'dec-' + i), 'places-icons', 'places-dots', 'tract-fill', 'muni-fill']
  map.on('click', (e) => {
    if (pinMode.value) {
      const m = muniAt(e.lngLat.lng, e.lngLat.lat, data.municipios.value)
      const mm = muni(m)
      selected.value = { type: 'pin', id: 'pin-' + Date.now().toString(36), name: mm ? t('pinIn', { m: mm.name }) : t('pin'), lon: +e.lngLat.lng.toFixed(5), lat: +e.lngLat.lat.toFixed(5), muni: m }
      pinMode.value = false
      return
    }
    const fs = map.queryRenderedFeatures(e.point, { layers: clickLayers.filter(l => map.getLayer(l) && map.getLayoutProperty(l, 'visibility') !== 'none') })
    const f = fs[0]
    if (!f) { selected.value = null; return }
    const p = f.properties as any
    if (f.layer.id.startsWith('dec-')) {
      const d = activeDecisions.value.find(x => x.id === p.id)
      if (d) selected.value = d.target
      return
    }
    if (f.layer.id === 'places-icons' || f.layer.id === 'places-dots') {
      const pt = point(p.id)
      if (pt) selected.value = { type: 'point', id: pt.id, name: pt.name, lon: pt.lon, lat: pt.lat, muni: pt.muni, kind: pt.kind }
      return
    }
    if (f.layer.id === 'tract-fill') {
      const tr = tract(p.id)
      if (tr) selected.value = { type: 'tract', id: tr.id, name: tr.id, lon: tr.lon, lat: tr.lat, muni: tr.muni }
      return
    }
    const m = muni(p.id)
    if (m) selected.value = { type: 'municipio', id: m.id, name: m.name, lon: m.lon, lat: m.lat, muni: m.id }
  })
  map.on('mousemove', (e) => {
    if (pinMode.value) { map.getCanvas().style.cursor = 'crosshair'; tipEl.hidden = true; return }
    const fs = map.queryRenderedFeatures(e.point, { layers: [...DEC_SLOTS.map((_, i) => 'dec-' + i), 'places-icons', 'places-dots', 'rain', 'rivers'].filter(l => map.getLayer(l) && map.getLayoutProperty(l, 'visibility') !== 'none') })
    const f = fs[0]
    map.getCanvas().style.cursor = f ? 'pointer' : ''
    if (!f) { tipEl.hidden = true; return }
    const p = f.properties as any
    let text = p.name
    if (f.layer.id.startsWith('dec-')) { const d = activeDecisions.value.find(x => x.id === p.id); text = d ? `${tableById.value[d.table]?.name}: ${d.target.name}` : '' }
    if (f.layer.id === 'rain') text = `${p.name}: ${Number(p.in).toFixed(1)} in`
    if (f.layer.id === 'rivers') text = `${p.name}: ${p.level === 'none' ? (lang.value === 'es' ? 'bajo acción' : 'below action stage') : p.level}`
    tipEl.textContent = text
    tipEl.hidden = !text
    tipEl.style.transform = `translate(${e.point.x + 14}px, ${e.point.y + 12}px)`
  })
  map.on('mouseout', () => { tipEl.hidden = true })
  return out
}

function prStatusCode(w: string[]) { const R: Record<string, number> = { HWR: 4, HWA: 3, TWR: 2, TWA: 1 }; return [...w].sort((a, b) => R[b] - R[a])[0] ?? null }

export const revealLayers = signal({ ffw: true, rain: true, rivers: false, ia: false, tracks: true })

export function flyTo(tg: Target) {
  const map = mapRef.value
  if (!map) return
  if (tg.type === 'municipio' || tg.type === 'tract') {
    const fc = tg.type === 'municipio' ? data.municipios.value : data.tracts.value
    const f = fc?.features.find(x => (x.properties as any).id === tg.id)
    if (f) {
      const b = bboxOf(f.geometry)
      map.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: 120, maxZoom: tg.type === 'tract' ? 12.5 : 10.5, duration: 700 })
      return
    }
  }
  map.easeTo({ center: [tg.lon, tg.lat], zoom: Math.max(map.getZoom(), 11), duration: 700 })
}

function bboxOf(g: GeoJSON.Geometry) {
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity
  const walk = (x: any) => { if (typeof x[0] === 'number') { a = Math.min(a, x[0]); b = Math.min(b, x[1]); c = Math.max(c, x[0]); d = Math.max(d, x[1]) } else x.forEach(walk) }
  walk((g as any).coordinates)
  return [a, b, c, d]
}

export function fitView(which: 'region' | 'pr') {
  const map = mapRef.value
  if (!map) return
  if (which === 'pr') map.fitBounds([[PR_BOUNDS[0], PR_BOUNDS[1]], [PR_BOUNDS[2], PR_BOUNDS[3]]], { padding: 30, duration: 700 })
  else map.fitBounds([[REGION_BOUNDS[0], REGION_BOUNDS[1]], [REGION_BOUNDS[2], REGION_BOUNDS[3]]], { padding: 30, duration: 700 })
}
