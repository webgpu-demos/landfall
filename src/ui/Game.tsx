import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks'
import { session, activeTable, tableById, setCall, teamsLeft, flash, lang, isReveal, selected } from '../state'
import { data } from '../data'
import { t } from '../i18n'
import { mph, weekdayLong, clock, num } from '../lib/format'
import { earliestArrival, prStatus } from '../lib/conditions'
import { reveal, live, goals, allGoals, type Badge, type RevealEvent } from '../lib/score'
import { play } from '../fx/sound'
import { floatAt, bump, confettiAt, reduced as fxReduced } from '../fx/fx'
import { point } from '../data'
import { flyTo } from '../map/MapView'
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
          <button role="radio" aria-checked={cur === k} class={cur === k ? 'on' : ''} onClick={() => { play('click'); setCall(tb.id, k) }}>
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
    play(f === 'reveal' ? 'whoosh' : 'release')
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

// ------------------------------------------------------------------------------------------ round goals

const GOALS = ['call', 'deploy', 'review', 'message'] as const

export function RoundGoals() {
  const s = session.value
  const tb = tableById.value[activeTable.value]
  if (!tb) return null
  const g = goals(s, tb.id, s.round)
  const n = GOALS.filter(k => g[k]).length
  const lv = live(s, tb.id)
  const done = allGoals(g)
  return (
    <div class={'goals' + (done ? ' done' : '')} style={{ '--tc': tb.color } as any}>
      <svg class="goals-ring" viewBox="-20 -20 40 40" aria-hidden="true">
        <circle r="16" class="gr-bg" />
        <circle r="16" class="gr-fg" stroke-dasharray={`${(n / 4) * 100.5} 100.5`} transform="rotate(-90)" />
        <text y="1" text-anchor="middle" dominant-baseline="middle">{done ? '✓' : `${n}/4`}</text>
      </svg>
      <div class="goals-list">
        <p class="goals-title">{done ? t('goalsDone') : t('goalsTitle')}{lv.streak >= 2 && <span class="streak" title={t('streakT', { n: lv.streak })}><Flame />{lv.streak}</span>}</p>
        <ul>{GOALS.map(k => <li class={'goal goal-' + k + (g[k] ? ' ok' : '')}><span class="gk">{g[k] ? '✓' : ''}</span>{t(('goal_' + k) as any)}</li>)}</ul>
      </div>
    </div>
  )
}

export function Flame() {
  return <svg viewBox="0 0 12 14" width="10" height="12" aria-hidden="true"><path d="M6 0C7 3 10 4.5 10 8.5A4 4 0 0 1 2 8.5C2 6.5 3.2 5.4 4 4.5C4 6 4.8 6.8 5.6 6.8C5.6 4.5 4.8 2.5 6 0Z" fill="currentColor" /></svg>
}

// ---------------------------------------------------------------------------------------- the points reveal

const BADGE_ICON: Record<Badge, string> = { calledEarly: '☂', firstMovers: '⚑', showedWork: '✎', drySupplies: '▣', changedCourse: '↻', onTarget: '◎', streak: '🔥' }
const played = new Set<number>()

interface Ev extends RevealEvent { i: number; calls?: { right: number; made: number } }

function events(): { evs: Ev[]; rev: ReturnType<typeof reveal> } {
  const rev = reveal(session.value)
  const evs: Ev[] = []
  for (const r of rev) {
    for (const e of r.events.filter(e => e.kind === 'target')) evs.push({ ...e, i: evs.length })
    const calls = r.events.filter(e => e.kind === 'call')
    if (calls.length) evs.push({ kind: 'call', table: r.table, pts: calls.reduce((a, e) => a + e.pts, 0), i: evs.length, calls: { right: calls.filter(e => e.pts).length, made: calls.length } })
  }
  return { evs, rev }
}

function BoardRow({ table, value, rank, max, winner, badges, showBadges }: { table: string; value: number; rank: number; max: number; winner: boolean; badges: Badge[]; showBadges: boolean }) {
  const tb = tableById.value[table]
  const [shown, setShown] = useState(value)
  useEffect(() => {
    if (fxReduced()) { setShown(value); return }
    const from = shown, t0 = performance.now(), ms = 380
    let raf = 0
    const step = (now: number) => { const k = Math.min(1, (now - t0) / ms); setShown(from + (value - from) * (1 - Math.pow(1 - k, 3))); if (k < 1) raf = requestAnimationFrame(step) }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [value])
  return (
    <li class={'sb-row' + (winner ? ' winner' : '')} data-board={table} style={{ '--tc': tb?.color } as any}>
      <span class="sb-rank">{winner ? <span class="crown" aria-label="1">♛</span> : rank}</span>
      <span class="sb-name"><TableDot color={tb?.color ?? '#999'} /> {tb?.name}</span>
      <span class="sb-bar"><span style={{ width: `${max ? (shown / max) * 100 : 0}%` }} /></span>
      <span class="sb-num">{Math.round(shown)}</span>
      {showBadges && badges.length > 0 && <span class="sb-badges">{badges.map((b, i) => <span class="badge-pill" style={{ animationDelay: `${i * 140}ms` }} title={t(('b_' + b) as any)}><i aria-hidden="true">{BADGE_ICON[b]}</i>{t(('b_' + b) as any)}</span>)}</span>}
    </li>
  )
}

/** The reveal's points: live points first, then every standing decision flips to hit or miss, then the calls. */
export function Jackpot() {
  const s = session.value
  const key = s.created
  const { evs, rev } = events()
  const [step, setStep] = useState(played.has(key) ? evs.length : -1)
  const running = step >= 0 && step < evs.length
  const done = step >= evs.length
  const ready = flash.value == null && !!data.observed.value

  // start once the reveal card is gone
  useEffect(() => {
    if (!ready || step !== -1) return
    const t0 = setTimeout(() => { play('whoosh'); setStep(0) }, 700)
    return () => clearTimeout(t0)
  }, [ready, step])

  // advance
  useEffect(() => {
    if (!running) return
    const e = evs[step]
    const el = document.querySelector(`[data-ev="${step}"]`)
    el?.scrollIntoView({ block: 'nearest', behavior: fxReduced() ? 'auto' : 'smooth' })
    const color = tableById.value[e.table]?.color ?? '#2F6B3B'
    if (e.pts > 0) { play('hit', Math.min(step, 12)); floatAt(el?.querySelector('.evchip') ?? el, `+${e.pts}`, color, true) } else play('miss')
    bump(`[data-board="${e.table}"] .sb-num`)
    const t0 = setTimeout(() => setStep(step + 1), e.pts > 0 ? 460 : 300)
    return () => clearTimeout(t0)
  }, [step, running])

  // finish
  useEffect(() => {
    if (!done || played.has(key)) return
    played.add(key)
    // back to the top of the panel so the winner is in view, then the fanfare
    document.querySelector('.scoreboard.jackpot')?.scrollIntoView({ block: 'start', behavior: fxReduced() ? 'auto' : 'smooth' })
    const t0 = setTimeout(() => {
      play('fanfare')
      confettiAt('.sb-row.winner', undefined, 160)
      setTimeout(() => play('badge'), 900)
    }, 650)
    return () => clearTimeout(t0)
  }, [done])

  // rows glide to their new places when the order changes
  const olRef = useRef<HTMLOListElement>(null)
  const pos = useRef<Record<string, number>>({})
  useLayoutEffect(() => {
    const next: Record<string, number> = {}
    olRef.current?.querySelectorAll<HTMLElement>('[data-board]').forEach(li => {
      const k = li.dataset.board!, y = li.offsetTop
      next[k] = y
      const dy = (pos.current[k] ?? y) - y
      if (dy && !fxReduced() && li.animate) li.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: 600, easing: 'cubic-bezier(.2,.8,.2,1)' })
    })
    pos.current = next
  })

  const revealedBonus: Record<string, number> = {}
  for (const r of rev) revealedBonus[r.table] = 0
  evs.forEach(e => { if (e.i < Math.max(step, 0) || done) revealedBonus[e.table] += e.pts })
  const rows = rev.map(r => ({ table: r.table, value: r.live + (revealedBonus[r.table] ?? 0), final: r.total, badges: r.badges }))
  const sorted = done ? [...rows].sort((a, b) => b.final - a.final) : rows
  const max = Math.max(1, ...rows.map(r => r.final))
  const top = Math.max(...rows.map(r => r.final))
  const es = lang.value === 'es'

  return (
    <>
      <section class={'scoreboard jackpot' + (done ? ' done' : '')}>
        <div class="sb-head">
          <h3>{done ? t('finalPoints') : t('scoreboard')}</h3>
          {running && <button class="link" onClick={() => setStep(evs.length)}>{t('skip')}</button>}
          {done && <button class="link" onClick={() => { played.delete(key); setStep(-1) }}>{t('replay')}</button>}
        </div>
        <ol ref={olRef}>{sorted.map((r, i) => <BoardRow key={r.table} table={r.table} value={r.value} rank={i + 1} max={max} winner={done && r.final === top && top > 0} badges={r.badges} showBadges={done} />)}</ol>
        <p class="sb-legend">{running ? t('revealing') : done ? t('scoreNote') : t('livePointsSoFar')}</p>
        <details class="method">
          <summary>{t('howPoints')}</summary>
          <dl class="rules">{(['live', 'target', 'call'] as const).map(k => <div><dt>{t(('pt_' + k) as any)}</dt><dd>{t(('pt_' + k + 'D') as any)}</dd></div>)}</dl>
        </details>
      </section>
      {rev.map(r => {
        const tb = tableById.value[r.table]
        const mine = evs.filter(e => e.table === r.table)
        if (!mine.length) return null
        return (
          <section class="kind">
            <h3><TableDot color={tb?.color ?? '#999'} /> {tb?.name}</h3>
            <ul>
              {mine.map(e => {
                const shown = done || e.i < step
                const active = e.i === step
                if (e.kind === 'call') return (
                  <li class={'drow ev' + (active ? ' active' : '') + (shown ? (e.pts ? ' hitrow' : ' missrow') : '')} data-ev={e.i} style={{ '--tc': tb?.color } as any}>
                    <div class="dmain"><span class="kgw"><ThreatIcon k="rain" size={16} /></span>
                      <span class="dname static"><span>{t('pt_call')}</span><small>{shown ? t('callsRight', { n: e.calls!.right, m: e.calls!.made }) : '…'}</small></span>
                      <span class={'evchip' + (shown ? (e.pts ? ' hit' : ' miss') : '')}>{shown ? `+${e.pts}` : '?'}</span></div>
                  </li>)
                const d = e.decision!
                const name = d.target.type === 'point' ? point(d.target.id)?.name ?? d.target.name : d.target.name
                const why = e.why === 'rain' ? t('why_rain', { in: num(e.rain ?? 0, 0) }) : e.why === 'aid' ? t('why_aid') : e.why === 'usable' ? t('why_usable') : (e.rain != null ? (es ? `${num(e.rain, 0)} pulg de lluvia cerca` : `${num(e.rain, 0)} in of rain nearby`) : (es ? 'sin estación cerca' : 'no station nearby'))
                return (
                  <li class={'drow ev' + (active ? ' active' : '') + (shown ? (e.pts ? ' hitrow' : ' missrow') : '')} data-ev={e.i} style={{ '--tc': tb?.color } as any}>
                    <div class="dmain">
                      <span class="kgw"><KindGlyph kind={d.kind} /></span>
                      <button class="dname" onClick={() => { selected.value = d.target; flyTo(d.target) }}><span>{name}</span><small>{shown ? why : '…'}</small></button>
                      <span class={'evchip' + (shown ? (e.pts ? ' hit' : ' miss') : '')}>{shown ? (e.pts ? `+${e.pts}` : t('miss')) : '?'}</span>
                    </div>
                  </li>)
              })}
            </ul>
          </section>
        )
      })}
    </>
  )
}

/** Final points, no animation (debrief). */
export function FinalBoard() {
  const rev = reveal(session.value)
  const sorted = [...rev].sort((a, b) => b.total - a.total)
  const max = Math.max(1, ...rev.map(r => r.total))
  const top = sorted[0]?.total ?? 0
  return (
    <section class="scoreboard">
      <h3>{t('finalPoints')}</h3>
      <ol>{sorted.map((r, i) => <BoardRow key={r.table} table={r.table} value={r.total} rank={i + 1} max={max} winner={r.total === top && top > 0} badges={r.badges} showBadges />)}</ol>
      <details class="method"><summary>{t('howPoints')}</summary>
        <dl class="rules">{(['live', 'target', 'call'] as const).map(k => <div><dt>{t(('pt_' + k) as any)}</dt><dd>{t(('pt_' + k + 'D') as any)}</dd></div>)}</dl>
        <p>{t('scoreNote')}</p></details>
    </section>
  )
}

/** A table's live points, for its chip. */
export function XpBadge({ table }: { table: string }) {
  const lv = live(session.value, table)
  return (
    <span class="txp" data-xp={table} title={t('xpTitle', { n: lv.total })}>
      {lv.streak >= 2 && <span class="streak mini"><Flame /></span>}{lv.total}
    </span>
  )
}
