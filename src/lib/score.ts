import type { Decision, Session, Target, Threat } from '../types'
import { data, muni, point } from '../data'
import { stateAt } from '../state'
import { km } from './geo'

// Points come in two kinds.
// Live, earned as the tables play (all knowable at the time):
//   deployed  +1  each standing decision
//   reasoned  +1  a reason given          + 1 a "revisit if" trigger written
//   held      +1  per new advisory a decision is kept standing through
//   reviewed  +1  each keep / change / drop when the forecast moves
//   called    +1  a threat call made in a round
//   round     +3  all four round goals met: threat call, a team deployed, every decision reviewed, a public message
// Bonus, revealed at the end against what happened:
//   on target +3  the place was hit hard: 15+ inches of rain nearby (inverse-distance mean of the NHC report's
//                 stations within 25 km) or a municipio in the top third for FEMA housing aid per household.
//                 Supplies: the site stayed usable and is near people hit hard.
//   right call +2 each round the table named rain and landslides as the biggest threat (the NHC report: flooding rain
//                 did the serious damage; surge 1-3 ft; strongest measured sustained wind 68 kt)

export const HEAVY_IN = 15
export const RIGHT_CALL: Threat = 'rain'

// ------------------------------------------------------------------------------------------------ outcomes

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

export function hit(t: Target): { hit: boolean; rain: number | null; hard: boolean } {
  const rain = rainAt(t.lat, t.lon)
  const m = t.type === 'municipio' ? t.id : t.muni ?? null
  const hard = !!m && hardHit().has(m)
  return { hit: (rain != null && rain >= HEAVY_IN) || hard, rain, hard }
}

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
  return [...hardHit()].some(id => { const m = muni(id); return m && km(t.lat, t.lon, m.lat, m.lon) <= 30 }) || hit(t).hit
}

/** The outcome bonus for one decision standing at the last round: 3 or 0, and why. */
export function targetBonus(d: Decision): { pts: number; why: 'rain' | 'aid' | 'usable' | null; rain: number | null } {
  if (d.kind === 'staging') return usable(d.target) && nearNeed(d.target) ? { pts: 3, why: 'usable', rain: rainAt(d.target.lat, d.target.lon) } : { pts: 0, why: null, rain: rainAt(d.target.lat, d.target.lon) }
  const h = hit(d.target)
  return h.hit ? { pts: 3, why: h.rain != null && h.rain >= HEAVY_IN ? 'rain' : 'aid', rain: h.rain } : { pts: 0, why: null, rain: h.rain }
}

// ------------------------------------------------------------------------------------------------ live points

export interface Goals { call: boolean; deploy: boolean; review: boolean; message: boolean }

/** The four round goals for a table at a round. */
export function goals(s: Session, table: string, r: number): Goals {
  const mine = s.decisions.filter(d => d.table === table && d.history[0].round <= r)
  const call = !!s.calls[table]?.[r]
  const deploy = mine.some(d => stateAt(d, r).active)
  const review = mine.filter(d => d.history[0].round < r && stateAt(d, r - 1).active).every(d => d.history.some(h => h.round === r && h.action !== 'add'))
  const message = !!s.messages[table]?.[r]?.trim()
  return { call, deploy, review, message }
}
export const allGoals = (g: Goals) => g.call && g.deploy && g.review && g.message

export interface Live { total: number; deployed: number; reasoned: number; held: number; reviewed: number; called: number; rounds: number; streak: number }

/** Live points for a table, as of round `upto` (the current round; rounds.length at the reveal). */
export function live(s: Session, table: string, upto = s.round): Live {
  const last = s.rounds.length - 1
  const R = Math.min(upto, last)
  const L: Live = { total: 0, deployed: 0, reasoned: 0, held: 0, reviewed: 0, called: 0, rounds: 0, streak: 0 }
  for (const d of s.decisions) {
    if (d.table !== table || d.history[0].round > R) continue
    if (stateAt(d, R).active) {
      L.deployed += 1
      if (d.reasons.length) L.reasoned += 1
      if (d.trigger.trim()) L.reasoned += 1
    }
    // held: each advisory released after it was placed, while it still stood (counted through the last advisory)
    for (let r = d.history[0].round + 1; r <= Math.min(upto, last); r++) if (stateAt(d, r).active) L.held += 1
    L.reviewed += d.history.filter(h => h.round <= R && h.action !== 'add').length
  }
  for (let r = 0; r <= R; r++) {
    if (s.calls[table]?.[r]) L.called += 1
    if (allGoals(goals(s, table, r))) L.rounds += 1
  }
  for (let r = R; r >= 0 && allGoals(goals(s, table, r)); r--) L.streak += 1
  L.total = L.deployed + L.reasoned + L.held + L.reviewed + L.called + 3 * L.rounds
  return L
}

// ------------------------------------------------------------------------------------------------ final

export interface Reveal { table: string; live: number; events: RevealEvent[]; bonus: number; total: number; badges: Badge[] }
export interface RevealEvent { kind: 'target' | 'call'; table: string; decision?: Decision; round?: number; pts: number; why?: string | null; rain?: number | null }
export type Badge = 'calledEarly' | 'firstMovers' | 'showedWork' | 'drySupplies' | 'changedCourse' | 'onTarget' | 'streak'

export function reveal(s: Session): Reveal[] {
  const last = s.rounds.length - 1
  return s.tables.map(tb => {
    const lv = live(s, tb.id, s.rounds.length)
    const standing = s.decisions.filter(d => d.table === tb.id && d.history[0].round <= last && stateAt(d, last).active)
    const events: RevealEvent[] = standing.map(d => { const b = targetBonus(d); return { kind: 'target', table: tb.id, decision: d, pts: b.pts, why: b.why, rain: b.rain } })
    for (let r = 0; r <= last; r++) {
      const c = s.calls[tb.id]?.[r]
      if (c) events.push({ kind: 'call', table: tb.id, round: r, pts: c === RIGHT_CALL ? 2 : 0 })
    }
    const bonus = events.reduce((a, e) => a + e.pts, 0)
    const badges: Badge[] = []
    if (events.some(e => e.kind === 'call' && e.pts && (e.round ?? 9) <= 1)) badges.push('calledEarly')
    if (standing.filter(d => d.history[0].round === 0).length >= 2) badges.push('firstMovers')
    if (standing.length >= 2 && standing.every(d => d.reasons.length && d.trigger.trim())) badges.push('showedWork')
    const st = events.filter(e => e.kind === 'target' && e.decision!.kind === 'staging')
    if (st.length && st.every(e => e.pts)) badges.push('drySupplies')
    if (s.decisions.some(d => d.table === tb.id && d.history.some(h => h.action === 'change' || h.action === 'drop'))) badges.push('changedCourse')
    const ns = events.filter(e => e.kind === 'target' && e.decision!.kind !== 'staging')
    if (ns.length >= 2 && ns.every(e => e.pts)) badges.push('onTarget')
    if (lv.rounds >= 3) badges.push('streak')
    return { table: tb.id, live: lv.total, events, bonus, total: lv.total + bonus, badges }
  })
}
