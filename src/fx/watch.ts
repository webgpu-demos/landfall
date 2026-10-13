import { effect } from '@preact/signals'
import { session, flash, activeTable, view, tableById } from '../state'
import { data } from '../data'
import { live, goals, allGoals, type Goals } from '../lib/score'
import { play } from './sound'
import { floatAtSelector, pulseMap, bump, confettiAt } from './fx'

// Watches the session and turns every change into feedback: points popping off the table chips, a pulse on the map
// where a team was deployed, a tick for each round goal, a burst when a round is complete. Nothing here changes
// state; it only reacts.

let prevXp: Record<string, number> | null = null
let prevIds: Set<string> | null = null
let prevGoals: { key: string; g: Goals } | null = null
let sessionKey = 0
let queued: Record<string, number> = {}
let combo = 0, comboAt = 0

function popXp(table: string, delta: number, delay = 0) {
  setTimeout(() => {
    if (delta > 0) {
      const now = performance.now()
      combo = now - comboAt < 1500 ? combo + 1 : 0; comboAt = now
      play('coin', Math.min(combo, 7) * 2)
      floatAtSelector(`[data-xp="${table}"]`, `+${delta}`, tableById.value[table]?.color ?? '#2F6B3B', delta >= 3)
    } else {
      floatAtSelector(`[data-xp="${table}"]`, `${delta}`, '#8A94A3')
    }
    bump(`[data-xp="${table}"]`)
  }, delay)
}

export function startFx() {
  effect(() => {
    const s = session.value
    const f = flash.value
    const v = view.value
    if (!data.ready.value) return
    if (s.created !== sessionKey || v === 'setup' || v === 'debrief') {
      sessionKey = s.created; prevXp = null; prevIds = null; prevGoals = null; queued = {}
    }
    // ---- points
    const xp = Object.fromEntries(s.tables.map(t => [t.id, live(s, t.id).total]))
    if (prevXp && v === 'exercise') {
      for (const t of s.tables) {
        const d = xp[t.id] - (prevXp[t.id] ?? xp[t.id])
        if (!d) continue
        if (f != null) queued[t.id] = (queued[t.id] ?? 0) + d
        else popXp(t.id, d)
      }
    }
    if (f == null && Object.keys(queued).length) {
      // after an advisory card: the "held" points arrive table by table
      Object.entries(queued).forEach(([t, d], i) => d && popXp(t, d, 450 + i * 260))
      queued = {}
    }
    prevXp = xp
    // ---- new deployments
    const ids = new Set(s.decisions.map(d => d.id))
    if (prevIds && v === 'exercise') {
      for (const d of s.decisions) if (!prevIds.has(d.id)) {
        play('deploy')
        pulseMap(d.target.lon, d.target.lat, tableById.value[d.table]?.color ?? '#14213D')
        bump(`.pips .pip`)
      }
    }
    prevIds = ids
    // ---- round goals of the table in front
    const key = `${activeTable.value}:${s.round}`
    const g = goals(s, activeTable.value, s.round)
    if (prevGoals && prevGoals.key === key && v === 'exercise' && f == null) {
      const p = prevGoals.g
      const newly = (['call', 'deploy', 'review', 'message'] as const).filter(k => g[k] && !p[k])
      if (newly.length) {
        if (allGoals(g)) {
          setTimeout(() => { play('complete'); confettiAt('.goals', [tableById.value[activeTable.value]?.color ?? '#0E7C86', '#F2C500', '#fff'], 70) }, 120)
          bump('.goals')
        } else setTimeout(() => play('tick'), 60)
        newly.forEach(k => bump(`.goal-${k}`))
      }
    }
    prevGoals = { key, g }
  })
}
