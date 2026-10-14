import maplibregl from 'maplibre-gl'
import type { CanvasSource } from 'maplibre-gl'
import { C } from '../theme'
import type { SatLoop } from './sat'
import type { AdvGeo, BestTrack, Places } from '../types'

// The opening as a pure function of time: given t (seconds), where the camera is, what the storm clock reads, and how
// visible each layer is. Intro.tsx runs the clock; this file owns the map. Seeking to any t gives the same frame,
// which is how the opening is reviewed and tested.

const BASE = location.href.replace(/[?#].*$/, '').replace(/[^/]*$/, '')

export const LOOP0 = 3, LOOP1 = 31, TERRAIN_AT = 40.5, TITLE_AT = 60.5, END = 63
/** Peak terrain exaggeration, reached as the camera settles over Puerto Rico. */
const RELIEF = 2.1
export const PR_BBOX: [number, number, number, number] = [-67.6, 17.6, -65.0, 18.75]

// Camera keyframes. Zoom is given as the share of the screen height the globe fills (fit) or as the degrees of
// longitude across the screen (span), so the shots frame the same on any projector.
interface Key { t: number; lon: number; lat: number; fit?: number; span?: number; pitch: number; bearing: number }
const KEYS: Key[] = [
  { t: 0, lon: -43, lat: 12, fit: 1.1, pitch: 0, bearing: 0 },
  { t: 5.5, lon: -47.5, lat: 15.5, fit: 1.9, pitch: 0, bearing: 0 },
  { t: 10.5, lon: -49.8, lat: 15.9, span: 30, pitch: 28, bearing: -6 },
  { t: 20, lon: -52.8, lat: 16.1, span: 25, pitch: 38, bearing: -10 },
  { t: 30, lon: -56.4, lat: 16.2, span: 23, pitch: 40, bearing: -10 },
  { t: 36.5, lon: -60.9, lat: 16.9, span: 21, pitch: 20, bearing: 0 },
  { t: 40.5, lon: -65.7, lat: 17.55, span: 6.5, pitch: 45, bearing: -10 },
  { t: 44, lon: -66.45, lat: 18.0, span: 2.35, pitch: 63, bearing: -16 },
  { t: 57.5, lon: -66.4, lat: 18.03, span: 2.15, pitch: 66, bearing: 14 },
  { t: END, lon: -66.45, lat: 18.2, span: 3.2, pitch: 0, bearing: 0 },
]

const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x))
const smooth = (a: number, b: number, x: number) => { const k = clamp((x - a) / (b - a)); return k * k * (3 - 2 * k) }
/** Fade in over [a, b], hold, fade out over [c, d]. */
const env = (t: number, a: number, b: number, c = Infinity, d = Infinity) => smooth(a, b, t) * (1 - smooth(c, d, t))

/** Monotone cubic through the keyframes: smooth, no stops at each key, no overshoot. */
function spline(ts: number[], vs: number[], t: number) {
  const n = ts.length
  if (t <= ts[0]) return vs[0]
  if (t >= ts[n - 1]) return vs[n - 1]
  let i = 0
  while (ts[i + 1] < t) i++
  const slope = (j: number) => (vs[j + 1] - vs[j]) / (ts[j + 1] - ts[j])
  const tan = (j: number) => {
    if (j === 0 || j === n - 1) return 0
    const a = slope(j - 1), b = slope(j)
    return a * b <= 0 ? 0 : (a + b) / 2
  }
  const h = ts[i + 1] - ts[i], s = (t - ts[i]) / h, s2 = s * s, s3 = s2 * s
  return (2 * s3 - 3 * s2 + 1) * vs[i] + (s3 - 2 * s2 + s) * tan(i) * h + (-2 * s3 + 3 * s2) * vs[i + 1] + (s3 - s2) * tan(i + 1) * h
}

export interface Deps {
  sat: SatLoop
  world: GeoJSON.FeatureCollection
  land: GeoJSON.FeatureCollection
  municipios: GeoJSON.FeatureCollection
  places: Places
  best: BestTrack
  adv: AdvGeo
  t0: number            // the first round's advisory time (ms): the loop ends here
  roads: Promise<GeoJSON.FeatureCollection | null>
}

export interface Frame { t: number; clock: number; storm: { lon: number; lat: number; status: string; wind: number } | null }

const TRAIL_START = 0 // index into best track: the depression forms at the first point

export class Director {
  private last: Record<string, number> = {}
  private relief = -1
  private satLive = true
  private width = 1
  private height = 1
  private zooms: number[] = []
  /** Where the title screen's slow turn of the globe left off: eased out over the first seconds. */
  lonOffset = 0
  readonly frames: number[]

  constructor(readonly map: maplibregl.Map, readonly d: Deps) {
    this.frames = d.sat.meta.frames.map(f => f.t)
    this.resize()
  }

  resize() {
    const c = this.map.getContainer()
    this.width = c.clientWidth || 1; this.height = c.clientHeight || 1
    this.zooms = KEYS.map(k => k.span != null ? Math.log2(360 * this.width / (512 * k.span)) : Math.log2((k.fit ?? 1) * this.height * Math.PI / 512))
  }

  /** Storm time (ms) at t. */
  clockAt(t: number) {
    const a = this.frames[0], b = this.d.t0
    return a + (b - a) * clamp((t - LOOP0) / (LOOP1 - LOOP0))
  }

  stormAt(ms: number): Frame['storm'] {
    const p = this.d.best.points
    if (ms < p[TRAIL_START].t) return null
    // the forecast's own position at the advisory time, so the cone starts where the storm is
    if (ms >= this.d.t0) { const c = (this.d.adv.points.features[0].geometry as GeoJSON.Point).coordinates; return { lon: c[0], lat: c[1], status: 'TS', wind: (this.d.adv.points.features[0].properties as any).wind_kt } }
    let i = TRAIL_START
    while (i < p.length - 1 && p[i + 1].t <= ms) i++
    const a = p[i], b = p[Math.min(i + 1, p.length - 1)]
    const k = b.t > a.t ? (ms - a.t) / (b.t - a.t) : 0
    return { lon: a.lon + (b.lon - a.lon) * k, lat: a.lat + (b.lat - a.lat) * k, status: a.status, wind: a.wind_kt }
  }

  camera(t: number) {
    const ts = KEYS.map(k => k.t)
    return {
      center: [spline(ts, KEYS.map(k => k.lon), t) + this.lonOffset * (1 - smooth(0, 4.5, t)), spline(ts, KEYS.map(k => k.lat), t)] as [number, number],
      zoom: spline(ts, this.zooms, t),
      pitch: spline(ts, KEYS.map(k => k.pitch), t),
      bearing: spline(ts, KEYS.map(k => k.bearing), t),
    }
  }

  // ------------------------------------------------------------------------------------------- build

  build() {
    const { map, d } = this
    // Each source's maxzoom caps how many zoom levels get their own tiles; past it, the last level is scaled up. Few
    // levels means little tiling work while the camera dives from zoom 6 to 9.
    const gj = (data: any, maxzoom: number) => ({ type: 'geojson' as const, data, maxzoom, buffer: 64 })
    map.addSource('grat', gj(graticule(), 4))
    map.addSource('world', gj(d.world, 5))
    map.addSource('land', gj(d.land, 9))
    map.addSource('sat', { type: 'canvas', canvas: d.sat.canvas, coordinates: d.sat.corners(), animate: true } as any)
    const dem = { type: 'raster-dem', tiles: [BASE + 'tiles/dem/{z}/{x}/{y}.png'], tileSize: 256, minzoom: 5, maxzoom: 10, encoding: 'terrarium', bounds: PR_BBOX } as const
    map.addSource('dem', dem as any)
    map.addSource('dem-shade', { ...dem, maxzoom: 9 } as any)
    const empty: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }
    for (const k of ['trail', 'storm', 'ftrack', 'fpts']) map.addSource(k, gj(empty, 6))
    map.addSource('roads', gj(empty, 9))
    map.addSource('cone', gj({ type: 'FeatureCollection', features: d.adv.cone }, 6))
    map.addSource('watch', gj(d.adv.warnings, 7))
    map.addSource('munis', gj(d.municipios, 9))
    const P = d.places
    map.addSource('dme', gj(fc(P.municipios.filter(m => m.empower).map(m => pt(m.lon, m.lat, { n: m.empower!.dme }))), 7))
    map.addSource('pts', gj(fc(P.points.filter(p => p.kind === 'shelter' || p.kind === 'hospital').map(p => pt(p.lon, p.lat, { k: p.kind }))), 7))
    map.addSource('cities', gj(fc(CITIES.map(([name, lon, lat]) => pt(lon, lat, { name }))), 6))
    d.roads.then(r => { if (r) (map.getSource('roads') as maplibregl.GeoJSONSource)?.setData(r) })

    const add = (l: any) => map.addLayer(l)
    add({ id: 'grat', type: 'line', source: 'grat', paint: { 'line-color': '#2A4566', 'line-width': 0.7, 'line-opacity': 0 } })
    add({ id: 'world', type: 'fill', source: 'world', paint: { 'fill-color': '#1A2940' } })
    add({ id: 'land', type: 'fill', source: 'land', filter: ['!=', ['get', 'pr'], 2], paint: { 'fill-color': ['case', ['==', ['get', 'pr'], 1], '#1F3250', '#1A2940'] } })
    add({ id: 'shade', type: 'hillshade', source: 'dem-shade', paint: { 'hillshade-shadow-color': '#04080F', 'hillshade-highlight-color': '#8FA6C2', 'hillshade-accent-color': '#2A3E5C',
      'hillshade-exaggeration': 0, 'hillshade-illumination-direction': 320, 'hillshade-illumination-anchor': 'map' } })
    add({ id: 'coast', type: 'line', source: 'world', paint: { 'line-color': '#34507A', 'line-width': 0.8, 'line-opacity': ['interpolate', ['linear'], ['zoom'], 2, 0.6, 5, 0] } })
    add({ id: 'coast-detail', type: 'line', source: 'land', filter: ['!=', ['get', 'pr'], 2], paint: { 'line-color': '#3D5B86', 'line-width': ['interpolate', ['linear'], ['zoom'], 4, 0.5, 8, 1.1], 'line-opacity': ['interpolate', ['linear'], ['zoom'], 3.5, 0, 5, 0.9] } })
    add({ id: 'roads-all', type: 'line', source: 'roads', paint: { 'line-color': '#6E86A8', 'line-width': 0.7, 'line-opacity': 0 } })
    add({ id: 'roads-slide', type: 'line', source: 'roads', filter: ['>', ['get', 's'], 0], layout: { 'line-cap': 'round' },
      paint: { 'line-color': ['interpolate', ['linear'], ['get', 's'], 0, '#C98A4B', 0.3, '#FF9F43', 0.6, '#FF7A2E'], 'line-width': ['interpolate', ['linear'], ['get', 's'], 0, 1.2, 0.5, 2.6], 'line-opacity': 0 } })
    add({ id: 'munis', type: 'line', source: 'munis', paint: { 'line-color': '#C9D7EA', 'line-width': 0.8, 'line-opacity': 0 } })
    add({ id: 'sat', type: 'raster', source: 'sat', paint: { 'raster-opacity': 0, 'raster-fade-duration': 0, 'raster-resampling': 'linear' } })
    add({ id: 'cone-fill', type: 'fill', source: 'cone', paint: { 'fill-color': '#FFFFFF', 'fill-opacity': 0 } })
    add({ id: 'cone-line', type: 'line', source: 'cone', paint: { 'line-color': '#FFFFFF', 'line-width': 1.2, 'line-opacity': 0, 'line-dasharray': [3, 2] } })
    add({ id: 'watch', type: 'line', source: 'watch', layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': ['match', ['get', 'code'], 'HWR', C.HWR, 'HWA', C.HWA, 'TWR', C.TWR, C.TWA], 'line-width': ['interpolate', ['linear'], ['zoom'], 4, 3, 7, 6], 'line-opacity': 0 } })
    add({ id: 'ftrack', type: 'line', source: 'ftrack', layout: { 'line-cap': 'round' }, paint: { 'line-color': '#FFFFFF', 'line-width': 1.6, 'line-opacity': 0.9, 'line-dasharray': [1, 1.6] } })
    add({ id: 'fpts', type: 'circle', source: 'fpts', paint: { 'circle-radius': 3.2, 'circle-color': '#0A1422', 'circle-stroke-color': '#FFFFFF', 'circle-stroke-width': 1.4 } })
    add({ id: 'fpts-label', type: 'symbol', source: 'fpts', layout: { 'text-field': ['get', 'label'], 'text-font': ['Open Sans Semibold'], 'text-size': 12, 'text-anchor': 'top', 'text-offset': [0, 0.7], 'text-allow-overlap': false },
      paint: { 'text-color': '#E4ECF7', 'text-halo-color': '#0A1422', 'text-halo-width': 1.4 } })
    add({ id: 'trail-case', type: 'line', source: 'trail', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#0A1422', 'line-width': 5, 'line-opacity': 0 } })
    add({ id: 'trail', type: 'line', source: 'trail', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#FF6B78', 'line-width': 2.4, 'line-opacity': 0 } })
    add({ id: 'storm-glow', type: 'circle', source: 'storm', paint: { 'circle-radius': 20, 'circle-color': '#FF4D5E', 'circle-opacity': 0.22, 'circle-blur': 0.8 } })
    add({ id: 'storm', type: 'circle', source: 'storm', paint: { 'circle-radius': 6.5, 'circle-color': '#FF4D5E', 'circle-stroke-color': '#FFFFFF', 'circle-stroke-width': 2 } })
    add({ id: 'storm-label', type: 'symbol', source: 'storm', layout: { 'text-field': ['get', 'label'], 'text-font': ['Open Sans Bold'], 'text-size': 16, 'text-anchor': 'bottom-left', 'text-offset': [0.7, -0.5], 'text-allow-overlap': true, 'text-max-width': 30 },
      paint: { 'text-color': '#FFFFFF', 'text-halo-color': 'rgba(6,12,22,0.9)', 'text-halo-width': 2, 'text-halo-blur': 0.5 } })
    add({ id: 'dme', type: 'circle', source: 'dme', paint: { 'circle-radius': ['interpolate', ['linear'], ['sqrt', ['get', 'n']], 0, 2, 80, 30], 'circle-color': '#FFB547', 'circle-opacity': 0, 'circle-stroke-color': '#FFD28A', 'circle-stroke-width': 1, 'circle-stroke-opacity': 0, 'circle-pitch-alignment': 'map' } })
    add({ id: 'shelters', type: 'circle', source: 'pts', filter: ['==', ['get', 'k'], 'shelter'], paint: { 'circle-radius': 2.6, 'circle-color': '#62D2FF', 'circle-opacity': 0, 'circle-stroke-width': 0 } })
    add({ id: 'hospitals', type: 'circle', source: 'pts', filter: ['==', ['get', 'k'], 'hospital'], paint: { 'circle-radius': 4, 'circle-color': '#FF6B81', 'circle-opacity': 0, 'circle-stroke-color': '#FFFFFF', 'circle-stroke-width': 1.2, 'circle-stroke-opacity': 0 } })
    add({ id: 'cities', type: 'symbol', source: 'cities', layout: { 'text-field': ['get', 'name'], 'text-font': ['Open Sans Semibold'], 'text-size': 13, 'text-letter-spacing': 0.04 },
      paint: { 'text-color': '#DCE6F3', 'text-halo-color': 'rgba(8,14,26,0.9)', 'text-halo-width': 1.4, 'text-opacity': 0 } })
    // atmosphere: a glow around the globe from space; over Puerto Rico, the far land and sea fade into a cool haze
    // and a lighter band sits on the horizon. None of it touches the data's colours up close.
    map.setSky({ 'sky-color': '#081528', 'horizon-color': '#2B4C76', 'fog-color': '#132A47', 'sky-horizon-blend': 0.55, 'horizon-fog-blend': 0.8, 'fog-ground-blend': 0.25,
      'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 4, 0.9, 7, 0] } as any)
    // Terrain is on from the start, flat (exaggeration 0) until the descent, then the mountains rise. Switching terrain
    // on mid-flight rebuilds the renderer's draping and reloads the elevation tiles: a visible stutter.
    map.setTerrain({ source: 'dem', exaggeration: 0 })
  }

  // ------------------------------------------------------------------------------------------- frame

  private paint(layer: string, prop: string, v: number) {
    const key = layer + '|' + prop
    if (Math.abs((this.last[key] ?? -1) - v) < 0.004) return
    this.last[key] = v
    this.map.setPaintProperty(layer, prop, v)
  }
  private vis(layer: string, on: boolean) {
    const key = layer + '|vis'
    if (this.last[key] === +on) return
    this.last[key] = +on
    this.map.setLayoutProperty(layer, 'visibility', on ? 'visible' : 'none')
  }
  private set(src: string, data: GeoJSON.FeatureCollection | GeoJSON.Feature, key: string) {
    if ((this.last as any)['data|' + src] === key) return
    ;(this.last as any)['data|' + src] = key
    ;(this.map.getSource(src) as maplibregl.GeoJSONSource).setData(data as any)
  }

  /** Put the map in the state for time t. Returns the storm clock and position for the captions. */
  apply(t: number, labels: { td: string; ts: string; mph: (kt: number) => number; when: (ms: number) => string }, still = false, camera?: maplibregl.JumpToOptions): Frame {
    const { map, d } = this
    map.jumpTo(camera ?? this.camera(still ? stillTime(t) : t))

    // relief rises as the camera comes down over the island
    const relief = RELIEF * smooth(39.5, 47, t)
    const terrain = (map as any).terrain as { exaggeration: number } | null
    if (terrain && Math.abs(relief - this.relief) > 0.002) { terrain.exaggeration = relief; this.relief = relief; map.triggerRepaint() }

    // satellite loop
    const clock = this.clockAt(t)
    const satA = 0.96 * env(t, 0.2, 2.6, 36.5, 40)
    this.paint('sat', 'raster-opacity', satA)
    this.vis('sat', satA > 0.005)
    const src = map.getSource('sat') as CanvasSource | undefined
    // upload the loop's canvas only when a new picture was drawn into it (after the first round it holds still)
    const drawn = satA > 0.005 && d.sat.draw(d.sat.posAt(clock))
    if (drawn !== this.satLive) { this.satLive = drawn; drawn ? src?.play() : src?.pause() }
    this.paint('grat', 'line-opacity', 0.55 * env(t, 0, 2, 34, 39))

    // the storm so far: best track to the clock
    const storm = this.stormAt(clock)
    const trackA = env(t, 7.5, 8.6, 40, 42.5)
    if (storm) {
      const p = d.best.points.filter(q => q.t <= clock).map(q => [q.lon, q.lat])
      const coords = clock >= d.t0 ? [...p, [storm.lon, storm.lat]] : [...p, [storm.lon, storm.lat]]
      const label = `${storm.status === 'TD' ? labels.td : labels.ts} · ${labels.mph(storm.wind)} mph`
      this.set('trail', { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords.length > 1 ? coords : [coords[0], coords[0]] } }, `${Math.round(clock / 6e4)}`)
      this.set('storm', fc([pt(storm.lon, storm.lat, { label })]), `${Math.round(clock / 6e4)}|${label}`)
    } else {
      this.set('trail', fc([]), 'none'); this.set('storm', fc([]), 'none')
    }
    this.paint('trail', 'line-opacity', trackA); this.paint('trail-case', 'line-opacity', 0.55 * trackA)
    this.paint('storm', 'circle-opacity', trackA)
    this.paint('storm', 'circle-stroke-opacity', trackA)
    this.paint('storm-glow', 'circle-opacity', 0.22 * trackA)
    this.paint('storm-label', 'text-opacity', trackA * (1 - smooth(31, 32.5, t)))

    // the first advisory's forecast: cone, track drawn out, watches and warnings
    const coneA = env(t, 31, 33.5, 40.5, 43.5)
    this.paint('cone-fill', 'fill-opacity', 0.1 * coneA)
    this.paint('cone-line', 'line-opacity', 0.75 * coneA)
    const draw = smooth(31.4, 35.5, t)
    const ft = (d.adv.track[0]?.geometry as GeoJSON.LineString | undefined)?.coordinates ?? []
    this.set('ftrack', fc(draw > 0 ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: slice(ft, draw) } }] : []), draw.toFixed(3))
    const pts = d.adv.points.features.filter((f, i) => i > 0 && i / (d.adv.points.features.length - 1) <= draw + 1e-6)
      .map(f => ({ ...f, properties: { label: labels.when((f.properties as any).t) } }))
    this.set('fpts', fc(pts as any), `${pts.length}`)
    this.paint('ftrack', 'line-opacity', 0.9 * coneA)
    this.paint('fpts', 'circle-opacity', coneA); this.paint('fpts', 'circle-stroke-opacity', coneA)
    this.paint('fpts-label', 'text-opacity', coneA * (1 - smooth(38, 40, t)))
    const pulse = t > 33 && t < 39 ? 0.75 + 0.25 * Math.sin((t - 33) * 5) : 1
    this.paint('watch', 'line-opacity', env(t, 33, 34.5, 42, 45) * pulse)

    // Puerto Rico, today
    this.paint('shade', 'hillshade-exaggeration', 0.7 * smooth(38, 44, t))
    this.paint('munis', 'line-opacity', 0.6 * env(t, 43.2, 45, 47, 49) + 0.18 * smooth(47, 49, t) * (1 - smooth(TITLE_AT, TITLE_AT + 1.5, t)))
    this.paint('cities', 'text-opacity', 0.9 * env(t, 43.5, 45, TITLE_AT - 0.5, TITLE_AT + 1))
    this.paint('shelters', 'circle-opacity', 0.95 * env(t, 47, 48.5, 51.3, 52.5) + 0.25 * smooth(51.3, 52.5, t) * (1 - smooth(TITLE_AT, TITLE_AT + 1.5, t)))
    const hosp = env(t, 47.6, 49, 51.3, 52.5)
    this.paint('hospitals', 'circle-opacity', hosp); this.paint('hospitals', 'circle-stroke-opacity', hosp)
    const dme = env(t, 51.5, 53, 55.3, 56.5)
    this.paint('dme', 'circle-opacity', 0.38 * dme); this.paint('dme', 'circle-stroke-opacity', 0.9 * dme)
    this.paint('roads-all', 'line-opacity', 0.35 * env(t, 43.5, 46, TITLE_AT, TITLE_AT + 1.5))
    this.paint('roads-slide', 'line-opacity', 0.95 * env(t, 55.5, 57, TITLE_AT + 0.5, TITLE_AT + 2) + 0.35 * smooth(TITLE_AT + 0.5, TITLE_AT + 2, t))
    return { t, clock, storm }
  }
}

/** Reduced motion: the camera holds each shot and cuts to the next instead of flying. */
function stillTime(t: number) {
  let k = KEYS[0].t
  for (const x of KEYS) if (x.t <= t + 0.6) k = x.t
  return k
}

// ------------------------------------------------------------------------------------------- helpers

// town centres for orientation (a municipio's centroid can sit offshore: Mayagüez includes Mona)
const CITIES: [string, number, number][] = [['San Juan', -66.1057, 18.4655], ['Ponce', -66.6141, 18.0111], ['Mayagüez', -67.1397, 18.2013], ['Arecibo', -66.7157, 18.4724],
  ['Caguas', -66.0485, 18.2341], ['Humacao', -65.8274, 18.1497], ['Utuado', -66.7005, 18.2655]]

function fc(features: GeoJSON.Feature[]): GeoJSON.FeatureCollection { return { type: 'FeatureCollection', features } }
function pt(lon: number, lat: number, properties: Record<string, unknown>): GeoJSON.Feature { return { type: 'Feature', properties, geometry: { type: 'Point', coordinates: [lon, lat] } } }

function graticule(): GeoJSON.FeatureCollection {
  const f: GeoJSON.Feature[] = []
  for (let lon = -180; lon < 180; lon += 10) f.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: Array.from({ length: 33 }, (_, i) => [lon, -80 + i * 5]) } })
  for (let lat = -80; lat <= 80; lat += 10) f.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: Array.from({ length: 73 }, (_, i) => [-180 + i * 5, lat]) } })
  return fc(f)
}

/** The first share `k` of a line, by length. */
function slice(c: number[][], k: number): number[][] {
  if (c.length < 2) return c
  const seg = c.slice(1).map((p, i) => Math.hypot(p[0] - c[i][0], p[1] - c[i][1]))
  let left = seg.reduce((a, b) => a + b, 0) * clamp(k)
  const out = [c[0]]
  for (let i = 0; i < seg.length; i++) {
    if (left >= seg[i]) { out.push(c[i + 1]); left -= seg[i]; continue }
    const r = seg[i] ? left / seg[i] : 0
    out.push([c[i][0] + (c[i + 1][0] - c[i][0]) * r, c[i][1] + (c[i + 1][1] - c[i][1]) * r])
    break
  }
  return out.length > 1 ? out : [c[0], c[0]]
}
