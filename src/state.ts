import { signal, computed, effect } from '@preact/signals'
import type { Session, Decision, DecisionKind, Target, Action, Table } from './types'
import { data } from './data'

// --------------------------------------------------------------------------------------------- session
// One exercise run lives in localStorage on the facilitator's machine. Export/import moves it elsewhere.

const KEY = 'landfall.session.v1'

export const TABLE_COLORS = ['#0E7C86', '#D9730D', '#6B4FBB', '#4E8A1E', '#2F5DA8', '#C2417A']

export const DEFAULT_ROUNDS = [6, 9, 12, 13, 16]

export function defaultTables(lang: 'en' | 'es'): Table[] {
  const names = lang === 'es'
    ? ['Manejo de emergencias municipal', 'Salud y servicios médicos', 'Vivienda y refugios', 'Energía, agua y carreteras']
    : ['Municipal emergency management', 'Health and medical', 'Housing and shelters', 'Power, water and roads']
  return names.map((name, i) => ({ id: 't' + (i + 1), name, color: TABLE_COLORS[i] }))
}

export function newSession(lang: 'en' | 'es'): Session {
  return {
    v: 1, title: lang === 'es' ? '72 horas antes de tocar tierra' : '72 Hours Before Landfall',
    codename: 'X', showName: false,
    tables: defaultTables(lang), rounds: [...DEFAULT_ROUNDS], round: 0, decisions: [], messages: {},
    timerMin: 8, timerEnd: null, timerLeft: null, created: Date.now(), started: false,
  }
}

function load(): Session | null {
  try {
    const s = localStorage.getItem(KEY)
    if (!s) return null
    const v = JSON.parse(s) as Session
    return v && v.v === 1 ? v : null
  } catch { return null }
}

export const lang = signal<'en' | 'es'>(((): 'en' | 'es' => {
  try {
    const q = new URLSearchParams(location.search).get('lang')
    if (q === 'es' || q === 'en') return q
    const s = localStorage.getItem('landfall.lang')
    if (s === 'es' || s === 'en') return s
  } catch { /* storage blocked */ }
  return navigator.language?.startsWith('es') ? 'es' : 'en'
})())
effect(() => { try { localStorage.setItem('landfall.lang', lang.value) } catch { /* ignore */ } document.documentElement.lang = lang.value })

export const session = signal<Session>(load() ?? newSession(lang.value))
effect(() => { try { localStorage.setItem(KEY, JSON.stringify(session.value)) } catch { /* ignore */ } })

export function update(fn: (s: Session) => void) {
  const s = structuredClone(session.value)
  fn(s)
  session.value = s
}

// ------------------------------------------------------------------------------------------------- ui

export type View = 'setup' | 'exercise' | 'reveal' | 'debrief'
export const view = signal<View>(session.value.started ? (session.value.round >= session.value.rounds.length ? 'reveal' : 'exercise') : 'setup')
export const activeTable = signal<string>(session.value.tables[0]?.id ?? 't1')
export const selected = signal<Target | null>(null)
export const lens = signal<string | null>(null)
export const leftTab = signal<'brief' | 'ask'>('brief')
export const peek = signal<number | null>(null)       // an earlier round's advisory being looked at (index into rounds)
export const pinMode = signal(false)
export const bigText = signal(false)
export const textDrawer = signal<null | 'public' | 'discussion' | 'probabilities' | 'hls'>(null)
export const focusMap = signal(false)

export interface Layers {
  wind: 'off' | '34' | '50' | '64'
  cone: boolean; ghosts: boolean; radii: boolean
  community: 'off' | 'svi' | 'age65' | 'noveh' | 'disab' | 'empower'
  surge: 'off' | 'c1' | 'c2' | 'c3' | 'c4' | 'c5'
  slide: boolean; roads: boolean
  shelters: boolean; health: boolean; utilities: boolean; transport: boolean; housing: boolean; venues: boolean; responders: boolean
}
export const layers = signal<Layers>({
  wind: '34', cone: true, ghosts: true, radii: false, community: 'off', surge: 'off', slide: false, roads: false,
  shelters: true, health: true, utilities: false, transport: false, housing: false, venues: false, responders: false,
})
export function setLayer<K extends keyof Layers>(k: K, v: Layers[K]) { layers.value = { ...layers.value, [k]: v } }

// ----------------------------------------------------------------------------------------- derived

export const roundIdx = computed(() => session.value.round)
export const isReveal = computed(() => session.value.round >= session.value.rounds.length)
/** The advisory on screen: the current round's, or an earlier one being peeked at. */
export const advNum = computed(() => {
  const s = session.value
  const r = peek.value ?? Math.min(s.round, s.rounds.length - 1)
  return s.rounds[r]
})
export const advisory = computed(() => data.scenario.value?.advisories.find(a => a.num === advNum.value) ?? null)
/** Index of the shown advisory in the per-place wind arrays. */
export const advIndex = computed(() => data.places.value?.advisories.indexOf(advNum.value) ?? -1)
export const prevAdvNum = computed(() => {
  const s = session.value
  const r = peek.value ?? Math.min(s.round, s.rounds.length - 1)
  return r > 0 ? s.rounds[r - 1] : null
})

export const tableById = computed(() => Object.fromEntries(session.value.tables.map(t => [t.id, t])))

// ---------------------------------------------------------------------------------------- decisions

function uid() { return Math.random().toString(36).slice(2, 9) }

export function addDecision(kind: DecisionKind, target: Target, table = activeTable.value): Decision {
  const d: Decision = { id: uid(), table, kind, target, reasons: [], note: '', trigger: '',
    history: [{ round: session.value.round, action: 'add', t: Date.now() }] }
  update(s => { s.decisions.push(d) })
  return d
}

export function editDecision(id: string, fn: (d: Decision) => void) {
  update(s => { const d = s.decisions.find(x => x.id === id); if (d) fn(d) })
}

export function removeDecision(id: string) {
  update(s => { s.decisions = s.decisions.filter(d => d.id !== id) })
}

/** Record keep / change / drop for this round. A second click on the same action undoes it. */
export function review(id: string, action: Action, note?: string) {
  editDecision(id, d => {
    const r = session.value.round
    const last = d.history[d.history.length - 1]
    if (last.round === r && last.action !== 'add') {
      if (last.action === action) { d.history.pop(); return }
      d.history[d.history.length - 1] = { round: r, action, note, t: Date.now() }
    } else if (!(last.round === r && last.action === 'add')) {
      d.history.push({ round: r, action, note, t: Date.now() })
    }
  })
}

/** active = not dropped (as of the given round). */
export function stateAt(d: Decision, round: number): { active: boolean; last: Action; lastRound: number; needsReview: boolean } {
  let active = false, last: Action = 'add', lastRound = 0
  for (const h of d.history) {
    if (h.round > round) break
    last = h.action; lastRound = h.round
    active = h.action !== 'drop'
  }
  const added = d.history[0].round
  const needsReview = active && added < round && lastRound < round
  return { active, last, lastRound, needsReview }
}

export const activeDecisions = computed(() => session.value.decisions.filter(d => d.history[0].round <= session.value.round && stateAt(d, session.value.round).active))
export const pendingReview = computed(() => session.value.decisions.filter(d => stateAt(d, session.value.round).needsReview))

// ------------------------------------------------------------------------------------------ rounds

export function advance() {
  peek.value = null
  update(s => {
    s.round = Math.min(s.rounds.length, s.round + 1)
    s.timerEnd = null; s.timerLeft = null
  })
  if (session.value.round >= session.value.rounds.length) view.value = 'reveal'
}

export function goBack() {
  peek.value = null
  update(s => { s.round = Math.max(0, s.round - 1); s.timerEnd = null; s.timerLeft = null })
  view.value = 'exercise'
}

export function startTimer() {
  update(s => {
    const left = s.timerLeft ?? s.timerMin * 60000
    s.timerEnd = Date.now() + left; s.timerLeft = null
  })
}
export function pauseTimer() {
  update(s => { if (s.timerEnd) { s.timerLeft = Math.max(0, s.timerEnd - Date.now()); s.timerEnd = null } })
}
export function resetTimer() { update(s => { s.timerEnd = null; s.timerLeft = null }) }

// --------------------------------------------------------------------------------------- export/import

export function exportSession(): Blob {
  return new Blob([JSON.stringify({ app: 'landfall', exported: new Date().toISOString(), session: session.value }, null, 1)], { type: 'application/json' })
}

export async function importSession(file: File) {
  const j = JSON.parse(await file.text())
  const s = (j.session ?? j) as Session
  if (!s || s.v !== 1 || !Array.isArray(s.decisions)) throw new Error('not a Landfall session file')
  session.value = s
  activeTable.value = s.tables[0]?.id ?? 't1'
  view.value = s.started ? (s.round >= s.rounds.length ? 'reveal' : 'exercise') : 'setup'
}

export function resetSession() {
  session.value = newSession(lang.value)
  activeTable.value = 't1'
  selected.value = null; lens.value = null; peek.value = null
  view.value = 'setup'
}
