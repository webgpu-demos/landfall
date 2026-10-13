import type { Places, Decision, Table, AdvGeo, Scenario } from '../types'

const fc = (features: GeoJSON.Feature[]): GeoJSON.FeatureCollection => ({ type: 'FeatureCollection', features })

/** 1-degree lines over the region, with label anchors: the hurricane tracking chart's grid. */
export function graticule(): { lines: GeoJSON.FeatureCollection; labels: GeoJSON.FeatureCollection } {
  const lines: GeoJSON.Feature[] = [], labels: GeoJSON.Feature[] = []
  for (let lon = -80; lon <= -45; lon++) {
    lines.push({ type: 'Feature', properties: { major: lon % 5 === 0 }, geometry: { type: 'LineString', coordinates: [[lon, 5], [lon, 32]] } })
    // labels where a tracking chart puts them: along a southern parallel, clear of Puerto Rico
    for (const lat of [12.4, 24.6]) labels.push({ type: 'Feature', properties: { t: `${-lon}°W`, axis: 'lon' }, geometry: { type: 'Point', coordinates: [lon, lat] } })
  }
  for (let lat = 5; lat <= 32; lat++) {
    lines.push({ type: 'Feature', properties: { major: lat % 5 === 0 }, geometry: { type: 'LineString', coordinates: [[-80, lat], [-45, lat]] } })
    for (const lon of [-71.9, -53.9]) labels.push({ type: 'Feature', properties: { t: `${lat}°N`, axis: 'lat' }, geometry: { type: 'Point', coordinates: [lon, lat] } })
  }
  return { lines: fc(lines), labels: fc(labels) }
}

/** Municipio polygons with the numbers the map colours by, joined from places.json. */
export function enrichMunis(geo: GeoJSON.FeatureCollection, P: Places): GeoJSON.FeatureCollection {
  const by = new Map(P.municipios.map(m => [m.id, m]))
  return fc(geo.features.map(f => {
    const m = by.get((f.properties as any).id)!
    return { ...f, properties: { id: m.id, name: m.name,
      svi: m.svi, age65: m.age65 / 100, noveh: m.noveh / 100, disab: m.disab / 100,
      empower: m.empower ? m.empower.dme / Math.max(1, m.pop) * 1000 : 0,
      ia: m.ia ? m.ia.reg / Math.max(1, m.hh) * 100 : 0 } }
  }))
}

export function enrichTracts(geo: GeoJSON.FeatureCollection, P: Places): GeoJSON.FeatureCollection {
  const by = new Map(P.tracts.map(t => [t.id, t]))
  return fc(geo.features.flatMap(f => {
    const t = by.get((f.properties as any).id)
    if (!t) return []
    return [{ ...f, properties: { id: t.id, svi: t.svi ?? -1, age65: t.age65 / 100, noveh: t.noveh / 100, disab: t.disab / 100 } }]
  }))
}

export function muniLabels(P: Places): GeoJSON.FeatureCollection {
  return fc(P.municipios.map(m => ({ type: 'Feature', properties: { id: m.id, name: m.name, pop: m.pop },
    geometry: { type: 'Point', coordinates: [m.lon, m.lat] } })))
}

const GROUP: Record<string, string> = {
  shelter: 'shelters', hospital: 'health', clinic: 'health', water: 'utilities', power: 'utilities', substation: 'utilities',
  airport: 'transport', seaport: 'transport', housing: 'housing', venue: 'venues', fire: 'responders', police: 'responders',
}
const RANK: Record<string, number> = { hospital: 1, shelter: 2, airport: 2, seaport: 2, power: 3, water: 3, venue: 4, housing: 5, clinic: 6, fire: 6, police: 6, substation: 7 }

export function placesFC(P: Places): GeoJSON.FeatureCollection {
  return fc(P.points.map(p => ({ type: 'Feature', properties: { id: p.id, kind: p.kind, group: GROUP[p.kind], name: p.name, rank: RANK[p.kind] ?? 9 },
    geometry: { type: 'Point', coordinates: [p.lon, p.lat] } })))
}

/** Every decision as a mark at its target; marks on the same target fan out so each table's colour shows. */
export function decisionsFC(ds: Decision[], tables: Record<string, Table>, iconFor: (kind: string, color: string) => string) {
  const at = new Map<string, number>()
  const feats: GeoJSON.Feature[] = []
  for (const d of ds) {
    const k = `${d.target.type}:${d.target.id}`
    const n = at.get(k) ?? 0; at.set(k, n + 1)
    const color = tables[d.table]?.color ?? '#555'
    feats.push({ type: 'Feature', properties: { id: d.id, table: d.table, kind: d.kind, color, icon: iconFor(d.kind, color), slot: Math.min(n, 5), tt: d.target.type },
      geometry: { type: 'Point', coordinates: [d.target.lon, d.target.lat] } })
  }
  return fc(feats)
}

export function decisionAreasFC(ds: Decision[], tables: Record<string, Table>, munis: GeoJSON.FeatureCollection | null, tracts: GeoJSON.FeatureCollection | null) {
  const mi = new Map(munis?.features.map(f => [(f.properties as any).id, f]) ?? [])
  const ti = new Map(tracts?.features.map(f => [(f.properties as any).id, f]) ?? [])
  const feats: GeoJSON.Feature[] = []
  for (const d of ds) {
    const g = d.target.type === 'municipio' ? mi.get(d.target.id) : d.target.type === 'tract' ? ti.get(d.target.id) : null
    if (!g) continue
    feats.push({ type: 'Feature', properties: { color: tables[d.table]?.color ?? '#555' }, geometry: g.geometry })
  }
  return fc(feats)
}

/** Cones and tracks from earlier rounds: how the forecast moved. */
export function ghostsFC(rounds: number[], upto: number, geos: Record<number, AdvGeo>) {
  const cones: GeoJSON.Feature[] = [], tracks: GeoJSON.Feature[] = []
  rounds.slice(0, upto).forEach((n, i) => {
    const g = geos[n]
    if (!g) return
    const age = upto - i // 1 = previous round
    for (const c of g.cone) cones.push({ ...c, properties: { age, num: n } })
    for (const t of g.track) tracks.push({ ...t, properties: { age, num: n } })
  })
  return { cones: fc(cones), tracks: fc(tracks) }
}

export function radiiNow(g: AdvGeo) {
  return fc(g.radii.filter(f => (f.properties as any).tau === 0).sort((a, b) => (a.properties as any).kt - (b.properties as any).kt))
}

export function centerFC(S: Scenario, num: number) {
  const a = S.advisories.find(x => x.num === num)
  if (!a) return fc([])
  const p = a.points[0]
  return fc([{ type: 'Feature', properties: { icon: p.type === 'HU' || p.type === 'MH' ? 's-hu' : p.type === 'TD' ? 's-td' : 's-ts' },
    geometry: { type: 'Point', coordinates: [a.center.lon, a.center.lat] } }])
}

export function forecastPointsFC(g: AdvGeo, lang: 'en' | 'es', fmt: (t: number) => string) {
  return fc(g.points.features.filter(f => (f.properties as any).tau > 0 && (f.properties as any).tau <= 72).map(f => {
    const p = f.properties as any
    const mph = Math.round(p.wind_kt * 1.15078 / 5) * 5
    return { ...f, properties: { ...p, letter: p.dvlbl, text: `${fmt(p.t)}\n${mph} mph`, hu: p.dvlbl === 'H' || p.dvlbl === 'M' ? 1 : 0, lang } }
  }))
}
