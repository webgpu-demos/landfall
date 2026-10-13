import { signal } from '@preact/signals'
import type { Scenario, Places, AdvGeo, Observed, BestTrack } from './types'

// Everything is static JSON compiled by pipeline/ and served next to the app (relative URLs).

async function j<T>(path: string): Promise<T> {
  const r = await fetch(path)
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`)
  return r.json() as Promise<T>
}

export const data = {
  scenario: signal<Scenario | null>(null),
  places: signal<Places | null>(null),
  municipios: signal<GeoJSON.FeatureCollection | null>(null),
  tracts: signal<GeoJSON.FeatureCollection | null>(null),
  land: signal<GeoJSON.FeatureCollection | null>(null),
  roads: signal<GeoJSON.FeatureCollection | null>(null),
  bridges: signal<GeoJSON.FeatureCollection | null>(null),
  hillshade: signal<{ coordinates: [number, number][]; source: string } | null>(null),
  observed: signal<Observed | null>(null),
  bestTrack: signal<BestTrack | null>(null),
  garita: signal<{ seedVersion: string; built: string } | null>(null),
  error: signal<string | null>(null),
  ready: signal(false),
}

const advCache = new Map<number, Promise<AdvGeo>>()
export const advGeo = signal<Record<number, AdvGeo>>({})

export function loadAdv(num: number): Promise<AdvGeo> {
  let p = advCache.get(num)
  if (!p) {
    p = j<AdvGeo>(`data/geo/adv_${String(num).padStart(3, '0')}.json`).then(g => {
      advGeo.value = { ...advGeo.value, [num]: g }
      return g
    })
    advCache.set(num, p)
  }
  return p
}

export async function loadAll() {
  try {
    const [scenario, places, municipios, tracts, land, hillshade, garita] = await Promise.all([
      j<Scenario>('data/scenario.json'), j<Places>('data/places.json'),
      j<GeoJSON.FeatureCollection>('data/geo/municipios.json'), j<GeoJSON.FeatureCollection>('data/geo/tracts.json'),
      j<GeoJSON.FeatureCollection>('data/geo/land.json'), j<any>('data/geo/hillshade.json'),
      j<any>('data/garita-manifest.json').catch(() => null),
    ])
    data.scenario.value = scenario; data.places.value = places
    data.municipios.value = municipios; data.tracts.value = tracts; data.land.value = land
    data.hillshade.value = hillshade; data.garita.value = garita
    data.ready.value = true
    // second wave: not needed for the first frame
    j<GeoJSON.FeatureCollection>('data/geo/roads.json').then(v => (data.roads.value = v)).catch(() => {})
    j<GeoJSON.FeatureCollection>('data/geo/bridges.json').then(v => (data.bridges.value = v)).catch(() => {})
    j<BestTrack>('data/geo/besttrack.json').then(v => (data.bestTrack.value = v)).catch(() => {})
    j<Observed>('data/observed.json').then(v => (data.observed.value = v)).catch(() => {})
  } catch (e) {
    data.error.value = String(e)
  }
}

// ----------------------------------------------------------------------------------------- lookups

let _muni: Map<string, Places['municipios'][number]> | null = null
let _tract: Map<string, Places['tracts'][number]> | null = null
let _pt: Map<string, Places['points'][number]> | null = null

export function muni(id: string | null | undefined) {
  if (!id || !data.places.value) return undefined
  if (!_muni) _muni = new Map(data.places.value.municipios.map(m => [m.id, m]))
  return _muni.get(id)
}
export function tract(id: string) {
  if (!data.places.value) return undefined
  if (!_tract) _tract = new Map(data.places.value.tracts.map(t => [t.id, t]))
  return _tract.get(id)
}
export function point(id: string) {
  if (!data.places.value) return undefined
  if (!_pt) _pt = new Map(data.places.value.points.map(p => [p.id, p]))
  return _pt.get(id)
}
