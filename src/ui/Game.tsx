import { useEffect, useState } from 'preact/hooks'
import { session, activeTable, tableById, setCall, teamsLeft, flash, lang, isReveal } from '../state'
import { data } from '../data'
import { t } from '../i18n'
import { mph, weekdayLong, clock, num } from '../lib/format'
import { earliestArrival, prStatus } from '../lib/conditions'
import { scoreTables, type TableScore, type Badge, RIGHT_CALL } from '../lib/score'
import { StatusChip, TableDot } from './common'
import { KindGlyph } from './Decisions'
import type { Advisory, DecisionKind, Threat } from '../types'

const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

/** Counts from `from` to `to` once, on mount. */
function useCount(to: number, from = 0, ms = 900, delay = 0) {
  const [v, setV] = useState(reduced() ? to : from)
  useEffect(() => {
    if (reduced()) { setV(to); return }
    let raf = 0; const t0 = performance.now() + delay
    const step = (now: number) => {
      const k = Math.min(1, Math.max(0, (now - t0) / ms))
      const e = 1 - Math.pow(1 - k, 3)
      setV(from + (to - from) * e)
      if (k < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [to, from])
  return v
}

// ------------------------------------------------------------------------------------------------ icons

export function ThreatIcon({ k, size = 18 }: { k: Threat; size?: number }) {
  return (
    <svg viewBox="-12 -12 24 24" width={size} height={size} aria-hidden="true" class="ti">
      {k === 'wind' && <g fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round">
        <path d="M-10,-4 H4 a3.5,3.5 0 1 0 -3.5,-3.5" /><path d="M-10,1 H8 a3.5,3.5 0 1 1 -3.5,3.5" /><path d="M-10,6 H-1" /></g>}
      {k === 'rain' && <g fill="currentColor">
        <path d="M-7,1 a5,5 0 0 1 1,-9.8 a6.5,6.5 0 0 1 12.3,1.6 a4.2,4.2 0 0 1 0.2,8.2 Z" />
        <path d="M-5,4 l-2,5 M0,4 l-2,5 M5,4 l-2,5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" /></g>}
      {k === 'surge' && <g fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
        <path d="M-11,1 q3,-4 6,0 t6,0 t6,0 t5,-1" /><path d="M-11,7 q3,-4 6,0 t6,0 t6,0 t5,-1" /><path d="M-4,-4 q2,-6 8,-6" /></g>}
    </svg>
  )
}

// ------------------------------------------------------------------------------------------ threat call

const THREATS: Threat[] = ['wind', 'rain', 'surge']

export function ThreatCall() {
  const s = session.value
  const tb = tableById.value[activeTable.value]
  if (!tb || isReveal.value) return null
  const cur = s.calls[tb.id]?.[s.round]
  return (
    <div class="threat" style={{ '--tc': tb.color } as any}>
      <p class="threat-q"><TableDot color={tb.color} /> {t('threatQ')}</p>
      <div class="threat-opts" role="radiogroup" aria-label={t('threatQ')}>
        {THREATS.map(k => (
          <button role="radio" aria-checked={cur === k} class={cur === k ? 'on' : ''} onClick={() => setCall(tb.id, k)}>
            <ThreatIcon k={k} size={22} /><span>{t(('th_' + k) as any)}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

/** The call each table made this round, as a small icon (for the table chips). */
export function CallMark({ table }: { table: string }) {
  const s = session.value
  const c = s.calls[table]?.[s.round]
  return c ? <span class="callmark" title={t(('th_' + c) as any)}><ThreatIcon k={c} size={13} /></span> : <span class="callmark none" title={t('callNone')}>?</span>
}

// ---------------------------------------------------------------------------------------------- team pips

export function TeamPips({ kind, table }: { kind: DecisionKind; table: string }) {
  const s = session.value
  const tb = tableById.value[table]
  if (!s.budget || !tb) return null
  const total = s.budget[kind], left = teamsLeft(table, kind)
  return (
    <span class="pips" title={t('teamsLeft', { n: left, m: total, what: t(('teams_' + kind) as any) })} style={{ '--tc': tb.color } as any}>
      {Array.from({ length: total }, (_, i) => <span class={'pip' + (i < left ? ' free' : '')}><KindGlyph kind={kind} /></span>)}
    </span>
  )
}

// --------------------------------------------------------------------------------------------- gauges

function WindGauge({ kt, prev, dark }: { kt: number; prev?: number | null; dark?: boolean }) {
  const short = !dark
  const v = useCount(mph(kt), prev != null ? mph(prev) : mph(kt))
  const max = 130
  const hu = mph(kt) >= 74
  return (
    <div class={'gauge' + (dark ? ' dark' : '')}>
      <span class="g-lbl">{short ? t('windShort') : t('windNear')}</span>
      <span class="g-val">{Math.round(v)}<small> mph</small>{prev != null && prev !== kt && <Delta up={kt > prev} />}</span>
      <span class="g-track">
        <span class={'g-fill' + (hu ? ' hu' : '')} style={{ width: `${(v / max) * 100}%` }} />
        <i class="g-tick" style={{ left: `${(39 / max) * 100}%` }} /><i class="g-tick" style={{ left: `${(74 / max) * 100}%` }} />
      </span>
      <span class="g-sub">{hu ? t('hu_cat') : t('ts_cat')}</span>
    </div>
  )
}

function RainGauge({ a, prev, dark }: { a: Advisory; prev?: Advisory | null; dark?: boolean }) {
  const r = a.rainPR
  if (!r) return null
  const p = prev?.rainPR
  const hi = useCount(r.high_in, p ? p.high_in : r.high_in)
  const lo = useCount(r.low_in, p ? p.low_in : r.low_in)
  const max = 30
  const worse = p ? (r.max_in ?? r.high_in) > (p.max_in ?? p.high_in) || r.high_in > p.high_in : false
  return (
    <div class={'gauge' + (dark ? ' dark' : '')}>
      <span class="g-lbl">{dark ? t('rainPR') : t('rainShort')}</span>
      <span class="g-val">{Math.round(lo)}–{Math.round(hi)}<small> {t('inUnit')}</small>{p && worse && <Delta up />}</span>
      <span class="g-track">
        <span class="g-range" style={{ left: `${(lo / max) * 100}%`, width: `${((hi - lo) / max) * 100}%` }} />
        {r.max_in && <i class="g-max" style={{ left: `${(r.max_in / max) * 100}%` }} />}
      </span>
      <span class="g-sub">{r.max_in ? t('localTo', { n: r.max_in }) : ' '}</span>
    </div>
  )
}

function ClockGauge({ a, prev, dark }: { a: Advisory; prev?: Advisory | null; dark?: boolean }) {
  const arr = earliestArrival(a.num)
  const h = arr ? Math.max(0, Math.round((arr - a.issued) / 3600e3)) : null
  const pa = prev ? earliestArrival(prev.num) : null
  const ph = prev && pa ? Math.max(0, Math.round((pa - prev.issued) / 3600e3)) : null
  const v = useCount(h ?? 0, ph ?? h ?? 0, 1100)
  const frac = Math.min(1, (v) / 72)
  const R = 30, C = 2 * Math.PI * R
  const urgent = h != null && h <= 24
  return (
    <div class={'gauge clockg' + (dark ? ' dark' : '') + (urgent ? ' urgent' : '')}>
      <span class="g-lbl" title={h === 0 ? t('tsNow') : t('tsIn')}>{dark ? (h === 0 ? t('tsNow') : t('tsIn')) : (h === 0 ? t('tsNowShort') : t('tsShort'))}</span>
      <svg viewBox="-36 -36 72 72" class="ring" aria-hidden="true">
        <circle r={R} class="ring-bg" />
        <circle r={R} class="ring-fg" stroke-dasharray={`${C * frac} ${C}`} transform="rotate(-90)" />
        <text y="2" text-anchor="middle" dominant-baseline="middle" class="ring-num">{h == null ? '–' : Math.round(v)}</text>
        <text y="17" text-anchor="middle" class="ring-unit">{t('hoursUnit')}</text>
      </svg>
      <span class="g-sub">{arr ? weekdayLong(arr).split(',')[0] + ' ' + clock(arr) : ' '}</span>
    </div>
  )
}

function Delta({ up }: { up: boolean }) {
  return <span class={'g-delta ' + (up ? 'up' : 'down')} aria-hidden="true">{up ? '▲' : '▼'}</span>
}

export function StormCard({ a, prev }: { a: Advisory; prev: Advisory | null }) {
  return (
    <div class="stormcard" key={a.num}>
      <WindGauge kt={a.nearPR.wind_kt} prev={prev?.nearPR.wind_kt ?? null} />
      <RainGauge a={a} prev={prev} />
      <ClockGauge a={a} prev={prev} />
    </div>
  )
}

// -------------------------------------------------------------------------------------- advisory card

export function RoundCard() {
  const f = flash.value
  const s = session.value
  const S = data.scenario.value
  useEffect(() => {
    if (f == null) return
    const k = (e: KeyboardEvent) => { if ([' ', 'Enter', 'Escape'].includes(e.key)) { e.preventDefault(); e.stopPropagation(); flash.value = null } }
    addEventListener('keydown', k, true)
    return () => removeEventListener('keydown', k, true)
  }, [f])
  if (f == null || !S) return null
  if (f === 'reveal') return <RevealCard />
  const a = S.advisories.find(x => x.num === s.rounds[f])!
  const prev = f > 0 ? S.advisories.find(x => x.num === s.rounds[f - 1])! : null
  const gap = prev ? Math.round((a.issued - prev.issued) / 3600e3) : null
  const s0 = prev ? prStatus(prev) : null, s1 = prStatus(a)
  return (
    <div class="roundcard" role="dialog" aria-label={t('advisory', { n: a.num })} onClick={() => (flash.value = null)}>
      <div class="rc-inner">
        <p class="rc-kicker">{t('round', { n: f + 1, m: s.rounds.length })}, {t('advisory', { n: a.num })}</p>
        <p class="rc-jump">{gap != null ? t('later', { h: gap }) : weekdayLong(a.issued).split(',')[0]}</p>
        <p class="rc-when">{weekdayLong(a.issued)}, {clock(a.issued)} AST</p>
        <div class="rc-status">
          {prev && s0 !== s1 && <><StatusChip code={s0} size="lg" /><span class="rc-arrow">→</span></>}
          <StatusChip code={s1} size="lg" />
        </div>
        <div class="rc-gauges">
          <WindGauge kt={a.nearPR.wind_kt} prev={prev?.nearPR.wind_kt ?? null} dark />
          <RainGauge a={a} prev={prev} dark />
          <ClockGauge a={a} prev={prev} dark />
        </div>
        <p class="rc-do">{t('callThenDecide')}</p>
        <button class="rc-go" onClick={(e) => { e.stopPropagation(); flash.value = null }} autoFocus>{t('continue')}</button>
      </div>
    </div>
  )
}

function RevealCard() {
  const S = data.scenario.value!
  const ob = data.observed.value
  const top = ob?.rain.gauges[0]
  const lf = S.landfall
  return (
    <div class="roundcard reveal-card" role="dialog" aria-label={t('reveal')} onClick={() => (flash.value = null)}>
      <div class="rc-inner">
        <p class="rc-kicker">{t('landfallCard')}</p>
        <p class="rc-jump">{t('revealCard1')}</p>
        <p class="rc-when">{weekdayLong(lf.t)}, {clock(lf.t)} AST, {mph(lf.wind_kt)} mph</p>
        {top && <p class="rc-big">{t('revealCard2', { in: num(top.in, 1) })}</p>}
        <button class="rc-go" onClick={(e) => { e.stopPropagation(); flash.value = null }} autoFocus>{t('continue')}</button>
      </div>
    </div>
  )
}

// ----------------------------------------------------------------------------------------- scoreboard

const BADGE_ICON: Record<Badge, string> = { calledEarly: '☂', firstMovers: '⚑', showedWork: '✎', drySupplies: '▣', changedCourse: '↻', onTarget: '◎' }

function ScoreRow({ sc, max, i }: { sc: TableScore; max: number; i: number }) {
  const tb = tableById.value[sc.table]
  const v = useCount(sc.total, 0, 1200, 250 + i * 180)
  return (
    <li class="sb-row" style={{ '--tc': tb?.color } as any}>
      <span class="sb-rank">{i + 1}</span>
      <span class="sb-name"><TableDot color={tb?.color ?? '#999'} /> {tb?.name}</span>
      <span class="sb-bar"><span style={{ width: `${max ? (v / max) * 100 : 0}%` }} /></span>
      <span class="sb-num">{Math.round(v)}</span>
      {sc.badges.length > 0 && <span class="sb-badges">{sc.badges.map(b => <span class="badge-pill" title={t(('b_' + b) as any)}><i aria-hidden="true">{BADGE_ICON[b]}</i>{t(('b_' + b) as any)}</span>)}</span>}
    </li>
  )
}

export function Scoreboard({ compact }: { compact?: boolean }) {
  const s = session.value
  if (!data.observed.value) return null
  const scores = scoreTables(s).sort((a, b) => b.total - a.total)
  const max = Math.max(1, ...scores.map(x => x.total))
  return (
    <section class={'scoreboard' + (compact ? ' compact' : '')}>
      <h3>{t('scoreboard')}</h3>
      <ol>{scores.map((sc, i) => <ScoreRow sc={sc} max={max} i={i} key={sc.table} />)}</ol>
      <details class="method">
        <summary>{t('howPoints')}</summary>
        <dl class="rules">
          {(['target', 'early', 'reason', 'call'] as const).map(k => <div><dt>{t(('pt_' + k) as any)}</dt><dd>{t(('pt_' + k + 'D') as any)}</dd></div>)}
        </dl>
        <p>{t('scoreNote')}</p>
      </details>
    </section>
  )
}

export function pointsChip(total: number, why: string[], rain: number | null) {
  const es = lang.value === 'es'
  const w = why.map(x => x === 'rain' ? t('why_rain', { in: num(rain ?? 0, 0) }) : x === 'aid' ? t('why_aid') : t('why_usable')).join(', ')
  return <span class={'ptchip' + (total ? '' : ' zero')} title={w || (es ? 'sin puntos de blanco' : 'no target points')}>+{total}</span>
}

export { RIGHT_CALL }
