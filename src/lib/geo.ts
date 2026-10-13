// Small geometry helpers: enough for clicks, pins and the reveal's overlap tests. No dependency.

type Ring = number[][]

function inRing(x: number, y: number, ring: Ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1]
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

export function inGeometry(lon: number, lat: number, g: GeoJSON.Geometry | null | undefined): boolean {
  if (!g) return false
  if (g.type === 'Polygon') {
    if (!inRing(lon, lat, g.coordinates[0])) return false
    for (let k = 1; k < g.coordinates.length; k++) if (inRing(lon, lat, g.coordinates[k])) return false
    return true
  }
  if (g.type === 'MultiPolygon') return g.coordinates.some(p => inGeometry(lon, lat, { type: 'Polygon', coordinates: p }))
  if (g.type === 'GeometryCollection') return g.geometries.some(x => inGeometry(lon, lat, x))
  return false
}

export function bbox(g: GeoJSON.Geometry): [number, number, number, number] {
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity
  const walk = (x: any) => {
    if (typeof x[0] === 'number') { a = Math.min(a, x[0]); b = Math.min(b, x[1]); c = Math.max(c, x[0]); d = Math.max(d, x[1]) }
    else for (const y of x) walk(y)
  }
  walk((g as any).coordinates ?? [])
  return [a, b, c, d]
}

export function km(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371, r = Math.PI / 180
  const dp = (lat2 - lat1) * r, dl = (lon2 - lon1) * r
  const h = Math.sin(dp / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dl / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/** The municipio a point falls in (Census boundaries as drawn on the map). */
export function muniAt(lon: number, lat: number, fc: GeoJSON.FeatureCollection | null): string | null {
  if (!fc) return null
  for (const f of fc.features) if (inGeometry(lon, lat, f.geometry)) return (f.properties as any).id
  return null
}
