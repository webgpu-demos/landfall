import type { Decision, Session, Target, Threat } from '../types'
import { data, muni, point } from '../data'
import { stateAt } from '../state'
import { km } from './geo'

// Game points, scored against what happened. The rules are few and printed on the board:
//   on target   +3  the place you chose was hit hard (or, for supplies, the site stayed usable and near people hit hard)
//   early       +1  per round the decision stood before the last one (up to +4)
//   reasoned    +1  it carries a reason and a "revisit if" trigger
//   threat call +2  per round the table named rain and landslides as the biggest threat (the NHC report: flooding
//                   rain did the serious damage; surge was 1-3 ft and the strongest measured wind 68 kt)
// "Hit hard" uses two measured outcomes: storm-total rain of 15 inches or more near the place (inverse-distance mean
// of the NHC report's stations within 25 km), or a municipio in the top third for FEMA housing aid per household.

export const HEAVY_IN = 15
export const RIGHT_CALL: Threat = 'rain'

export interface DecisionScore { d: Decision; target: number; early: number; reasoned: number; total: number; why: string[] }
export interface TableScore {
  table: string; total: number; decisions: DecisionScore[]; calls: number; callRounds: number[]
  badges: Badge[]
}
export type Badge = 'calledEarly' | 'firstMovers' | 'showedWork' | 'drySupplies' | 'changedCourse' | 'onTarget'

let _hard: Set<string> | null = null
export function hardHit(): Set<string> {
  if (_hard) return _hard
  const ms = (data.places.value?.municipios ?? []).filter(m => m.ia && m.hh)
  const r = ms.map(m => ({ id: m.id, v: m.ia!.approved / m.hh })).sort((a, b) => b.v - a.v)
  _hard = new Set(r.slice(0, Math.round(r.length / 3)).map(x => x.id))
  return _hard
}

export function rainAt(lat: number, lon: number): number | null {
  const g = data.observed.value?.rain.gauges ?? []
  let w = 0, s = 0
  for (const x of g) {
    const d = km(lat, lon, x.lat, x.lon)
    if (d > 25) continue
    const k = 1 / Math.max(d, 1) ** 2
    w += k; s += k * x.in
  }
  return w ? s / w : null
}

/** Was this place hit hard, and how do we know. */
export function hit(t: Target): { hit: boolean; rain: number | null; hard: boolean } {
  const rain = rainAt(t.lat, t.lon)
  const m = t.type === 'municipio' ? t.id : t.muni ?? null
  const hard = !!m && hardHit().has(m)
  return { hit: (rain != null && rain >= HEAVY_IN) || hard, rain, hard }
}

/** A supply site is usable if no static hazard map flags it; a dropped pin, outside the heaviest rain (20 in). */
export function usable(t: Target): boolean {
  if (t.type === 'point') {
    const p = point(t.id)
    if (!p) return false
    const sfha = !!p.flood && /^(A|V)/.test(p.flood)
    const slide = /high/i.test(p.slide25 ?? p.slide ?? '')
    const low = p.elev != null && p.elev <= 3
    return !sfha && !slide && !low && !p.surge
  }
  const r = rainAt(t.lat, t.lon)
  return r == null || r < 20
}

function nearNeed(t: Target): boolean {
  const H = hardHit()
  return [...H].some(id => { const m = muni(id); return m && km(t.lat, t.lon, m.lat, m.lon) <= 30 }) || hit(t).hit
}

export function scoreDecision(d: Decision, s: Session): DecisionScore | null {
  const last = s.rounds.length - 1
  if (d.history[0].round > last || !stateAt(d, last).active) return null
  const why: string[] = []
  let target = 0
  if (d.kind === 'staging') {
    if (usable(d.target) && nearNeed(d.target)) { target = 3; why.push('usable') }
  } else {
    const h = hit(d.target)
    if (h.hit) { target = 3; why.push(h.rain != null && h.rain >= HEAVY_IN ? 'rain' : 'aid') }
  }
  const early = Math.min(4, last - d.history[0].round)
  const reasoned = d.reasons.length > 0 && d.trigger.trim().length > 0 ? 1 : 0
  return { d, target, early, reasoned, total: target + early + reasoned, why }
}

export function scoreTables(s: Session): TableScore[] {
  const out = s.tables.map(tb => {
    const ds = s.decisions.filter(d => d.table === tb.id).map(d => scoreDecision(d, s)).filter((x): x is DecisionScore => !!x)
    const callRounds = Object.entries(s.calls[tb.id] ?? {}).filter(([r, c]) => +r < s.rounds.length && c === RIGHT_CALL).map(([r]) => +r)
    const calls = callRounds.length * 2
    const badges: Badge[] = []
    if (callRounds.some(r => r <= 1)) badges.push('calledEarly')
    if (ds.filter(x => x.d.history[0].round === 0).length >= 2) badges.push('firstMovers')
    if (ds.length >= 2 && ds.every(x => x.reasoned)) badges.push('showedWork')
    const st = ds.filter(x => x.d.kind === 'staging')
    if (st.length >= 1 && st.every(x => x.target > 0)) badges.push('drySupplies')
    if (s.decisions.some(d => d.table === tb.id && d.history.some(h => h.action === 'change' || h.action === 'drop'))) badges.push('changedCourse')
    const nonStaging = ds.filter(x => x.d.kind !== 'staging')
    if (nonStaging.length >= 2 && nonStaging.every(x => x.target > 0)) badges.push('onTarget')
    return { table: tb.id, total: ds.reduce((a, x) => a + x.total, 0) + calls, decisions: ds, calls, callRounds, badges }
  })
  return out
}
