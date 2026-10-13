import type { Target, Wind, AdvGeo, Kt, Advisory } from '../types'
import { data, muni, tract, point, advGeo } from '../data'
import { inGeometry } from './geo'

export interface WindNow { p34: number; p50: number; p64: number; a34: number; a64: number; basis: 'place' | 'pin' }

/** The wind numbers for a target at an advisory. Pins are tested against that advisory's probability contours. */
export function windAt(t: Target, num: number): WindNow | null {
  const P = data.places.value
  if (!P) return null
  const i = P.advisories.indexOf(num)
  if (i < 0) return null
  const pick = (w: Wind): WindNow => ({ p34: w.p34[i], p50: w.p50[i], p64: w.p64[i], a34: w.a34[i], a64: w.a64[i], basis: 'place' })
  if (t.type === 'municipio') { const m = muni(t.id); return m ? pick(m.w) : null }
  if (t.type === 'tract') { const x = tract(t.id); return x ? pick(x.w) : null }
  if (t.type === 'point') { const x = point(t.id); return x ? pick(x.w) : null }
  // pin: probabilities from the contours; arrival from its municipio (the radii reach a municipio as a whole)
  const g = advGeo.value[num]
  const m = t.muni ? muni(t.muni) : undefined
  const pb = (kt: Kt) => g ? bandAt(g, kt, t.lon, t.lat) : (m ? m.w[`p${kt}` as 'p34'][i] : 0)
  return { p34: pb('34'), p50: pb('50'), p64: pb('64'), a34: m ? m.w.a34[i] : -1, a64: m ? m.w.a64[i] : -1, basis: 'pin' }
}

export function bandAt(g: AdvGeo, kt: Kt, lon: number, lat: number) {
  let best = 0
  for (const f of g.prob[kt] ?? []) {
    const lo = (f.properties as any).lo as number
    if (lo > best && inGeometry(lon, lat, f.geometry)) best = lo
  }
  return best
}

export type Trend = 'up' | 'down' | 'same'
export interface Delta { key: 'p34' | 'p50' | 'p64' | 'a34'; from: number; to: number; trend: Trend; worse: boolean }

/** What moved for this target between two advisories, most important first. */
export function deltas(t: Target, fromNum: number, toNum: number): Delta[] {
  const a = windAt(t, fromNum), b = windAt(t, toNum)
  if (!a || !b) return []
  const out: Delta[] = []
  for (const k of ['p64', 'p50', 'p34'] as const) {
    if (a[k] !== b[k]) out.push({ key: k, from: a[k], to: b[k], trend: b[k] > a[k] ? 'up' : 'down', worse: b[k] > a[k] })
  }
  // arrival: compare absolute times, not hours-after-advisory
  const adv = (n: number) => data.scenario.value!.advisories.find(x => x.num === n)!
  const ta = a.a34 >= 0 ? adv(fromNum).issued + a.a34 * 3600e3 : null
  const tb = b.a34 >= 0 ? adv(toNum).issued + b.a34 * 3600e3 : null
  if (ta != null && tb != null && Math.abs(ta - tb) >= 3 * 3600e3) {
    out.push({ key: 'a34', from: ta, to: tb, trend: tb < ta ? 'up' : 'down', worse: tb < ta })
  } else if ((ta == null) !== (tb == null)) {
    out.push({ key: 'a34', from: ta ?? -1, to: tb ?? -1, trend: tb != null ? 'up' : 'down', worse: tb != null })
  }
  return out
}

const RANK: Record<string, number> = { HWR: 4, HWA: 3, TWR: 2, TWA: 1 }
export function prStatus(a: Advisory | null | undefined): string | null {
  if (!a || !a.prWarnings.length) return null
  return [...a.prWarnings].sort((x, y) => RANK[y] - RANK[x])[0]
}

export interface AdvDelta { kind: 'warning' | 'rain' | 'intensity' | 'track' | 'arrival'; from: string | number | null; to: string | number | null; worse: boolean }

/** Island-wide changes between two advisories: warnings, rain forecast, intensity and distance near Puerto Rico. */
export function advDeltas(a: Advisory, b: Advisory): AdvDelta[] {
  const out: AdvDelta[] = []
  const sa = prStatus(a), sb = prStatus(b)
  if (sa !== sb) out.push({ kind: 'warning', from: sa, to: sb, worse: (RANK[sb ?? ''] ?? 0) > (RANK[sa ?? ''] ?? 0) })
  const ra = a.rainPR, rb = b.rainPR
  if (ra && rb && (ra.high_in !== rb.high_in || ra.max_in !== rb.max_in || ra.low_in !== rb.low_in)) {
    out.push({ kind: 'rain', from: `${ra.low_in}–${ra.high_in}${ra.max_in ? ` (${ra.max_in})` : ''}`, to: `${rb.low_in}–${rb.high_in}${rb.max_in ? ` (${rb.max_in})` : ''}`,
      worse: (rb.max_in ?? rb.high_in) > (ra.max_in ?? ra.high_in) || rb.high_in > ra.high_in })
  }
  if (a.nearPR.wind_kt !== b.nearPR.wind_kt) out.push({ kind: 'intensity', from: a.nearPR.wind_kt, to: b.nearPR.wind_kt, worse: b.nearPR.wind_kt > a.nearPR.wind_kt })
  if (Math.abs(a.nearPR.km - b.nearPR.km) >= 15) out.push({ kind: 'track', from: a.nearPR.km, to: b.nearPR.km, worse: b.nearPR.km < a.nearPR.km })
  return out
}

/** Earliest forecast arrival of tropical-storm-force winds anywhere in Puerto Rico (from the municipio values). */
export function earliestArrival(num: number): number | null {
  const P = data.places.value, S = data.scenario.value
  if (!P || !S) return null
  const i = P.advisories.indexOf(num)
  const hs = P.municipios.map(m => m.w.a34[i]).filter(h => h >= 0)
  if (!hs.length) return null
  const adv = S.advisories.find(a => a.num === num)!
  return adv.issued + Math.min(...hs) * 3600e3
}
