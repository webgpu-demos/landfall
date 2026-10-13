import { useState } from 'preact/hooks'
import { session, activeTable, tableById, stateAt, review, editDecision, removeDecision, selected, pinMode, pendingReview, update, lang } from '../state'
import { muni, point, tract } from '../data'
import { t } from '../i18n'
import { band, dayTime } from '../lib/format'
import { deltas, windAt } from '../lib/conditions'
import { kindName, tractName } from '../lib/lens'
import { flyTo } from '../map/MapView'
import { ThreatCall, CallMark, TeamPips, RoundGoals, XpBadge } from './Game'
import { TableDot } from './common'
import type { Decision, DecisionKind } from '../types'

export const REASONS = ['wind', 'rain', 'slide', 'surge', 'people', 'power', 'access', 'facility'] as const
const KINDS: DecisionKind[] = ['outreach', 'staging', 'closer']

export function Decisions() {
  const s = session.value
  const [filter, setFilter] = useState<string | null>(null)
  const pend = pendingReview.value
  const shown = s.decisions.filter(d => d.history[0].round <= s.round && (!filter || d.table === filter))
    .filter(d => { const st = stateAt(d, s.round); return st.active || st.lastRound === s.round })

  return (
    <div class="decisions">
      <div class="dhead">
        <h2>{t('decisions')}</h2>
        <div class="table-chips" role="group" aria-label={t('tables')}>
          {s.tables.map((tb, i) => (
            <button class={'tchip' + (activeTable.value === tb.id ? ' active' : '')} style={{ '--tc': tb.color } as any}
              onClick={() => { activeTable.value = tb.id; setFilter(filter && filter !== tb.id ? tb.id : filter) }}
              onDblClick={() => setFilter(filter === tb.id ? null : tb.id)} title={tb.name}>
              <span class="tnum">{i + 1}</span><span class="tname">{tb.name}</span><CallMark table={tb.id} /><XpBadge table={tb.id} />
            </button>
          ))}
        </div>
        <RoundGoals />
        <ThreatCall />
        <div class="filter-row">
          <button class="link" aria-pressed={!filter} onClick={() => setFilter(null)}>{t('allTables')}</button>
          <button class="link" aria-pressed={filter === activeTable.value} onClick={() => setFilter(activeTable.value)}>{tableById.value[activeTable.value]?.name}</button>
        </div>
      </div>

      {pend.length > 0 && (
        <div class="review-banner" role="status">
          <b>{t('review', { n: pend.length })}</b> <span>{t('reviewHint')}</span>
        </div>
      )}

      <div class="scroll dlist">
        {KINDS.map(k => {
          const items = shown.filter(d => d.kind === k)
          return (
            <section class={'kind kind-' + k}>
              <h3><KindGlyph kind={k} /> {t(('kind_' + k) as any)} {s.budget ? <TeamPips kind={k} table={activeTable.value} /> : <span class="count">{items.filter(d => stateAt(d, s.round).active).length}</span>}</h3>
              {items.length === 0 && (
                <p class="empty">{t(('emptyKind_' + k) as any)} {k === 'staging' && <button class="link" onClick={() => (pinMode.value = true)}>{t('dropPin')}</button>}</p>
              )}
              <ul>{items.sort((a, b) => order(a) - order(b)).map(d => <DecisionRow d={d} />)}</ul>
              {k === 'staging' && items.length > 0 && <button class="link add-pin" onClick={() => (pinMode.value = true)}>+ {t('dropPin')}</button>}
            </section>
          )
        })}
        <Message />
      </div>
    </div>
  )
}

function order(d: Decision) {
  const st = stateAt(d, session.value.round)
  return (st.needsReview ? 0 : st.active ? 1 : 2) * 1000 + session.value.tables.findIndex(x => x.id === d.table)
}

export function KindGlyph({ kind }: { kind: DecisionKind }) {
  return (
    <svg class="kg" viewBox="-8 -8 16 16" width="16" height="16" aria-hidden="true">
      {kind === 'outreach' && <path d="M-6,-2 L-2.5,-2 L4.5,-6 L4.5,6 L-2.5,2 L-6,2 Z M-4.6,2 h2.4 v4 h-2.4 Z" fill="currentColor" />}
      {kind === 'staging' && <g fill="currentColor"><rect x="-6" y="-4.5" width="12" height="9.5" /><rect x="-6" y="-1.2" width="12" height="1.2" fill="var(--paper)" /><rect x="-0.6" y="-4.5" width="1.2" height="9.5" fill="var(--paper)" /></g>}
      {kind === 'closer' && <g fill="none" stroke="currentColor"><circle cx="-1.2" cy="-1.2" r="4.2" stroke-width="2.2" /><path d="M2,2 L6,6" stroke-width="3" stroke-linecap="round" /></g>}
    </svg>
  )
}

function targetSub(d: Decision) {
  const tg = d.target
  if (tg.type === 'municipio') return t('municipio')
  if (tg.type === 'tract') return muni(tg.muni)?.name ?? ''
  if (tg.type === 'point') { const p = point(tg.id); return p ? `${kindName(p.kind)}${p.muni ? ', ' + (muni(p.muni)?.name ?? '') : ''}` : '' }
  return muni(tg.muni)?.name ?? ''
}

function targetName(d: Decision) {
  if (d.target.type === 'tract') { const x = tract(d.target.id); return x ? tractName(x).split(',')[0] : d.target.name }
  return d.target.name
}

function DecisionRow({ d }: { d: Decision }) {
  const s = session.value
  const [open, setOpen] = useState(false)
  const tb = tableById.value[d.table]
  const st = stateAt(d, s.round)
  const fromRound = st.lastRound < s.round ? st.lastRound : (d.history.length > 1 ? d.history[d.history.length - 2].round : st.lastRound)
  const dl = fromRound < s.round ? deltas(d.target, s.rounds[fromRound], s.rounds[Math.min(s.round, s.rounds.length - 1)]) : []
  const thisRound = d.history.find(h => h.round === s.round)
  const nowNum = s.rounds[Math.min(s.round, s.rounds.length - 1)]
  const w = st.active ? windAt(d.target, nowNum) : null
  const statusLabel = !st.active ? t('dropped') : thisRound?.action === 'add' ? t('added') : thisRound?.action === 'keep' ? t('kept') : thisRound?.action === 'change' ? t('changedA') : st.needsReview ? '' : ''

  return (
    <li class={'drow' + (st.needsReview ? ' needs' : '') + (!st.active ? ' gone' : '') + (selected.value?.id === d.target.id ? ' sel' : '')} style={{ '--tc': tb?.color } as any}>
      <div class="dmain">
        <TableDot color={tb?.color ?? '#999'} title={tb?.name} />
        <button class="dname" onClick={() => { selected.value = d.target; flyTo(d.target) }}>
          <span>{targetName(d)}</span><small>{targetSub(d)}</small>
        </button>
        {w && w.a34 >= 0 && <span class={'clockchip' + (w.a34 <= 12 ? ' late' : '')} title={lang.value === 'es' ? 'Llegada pronosticada de vientos de 39 mph aquí (calculado con los radios del NHC)' : 'Forecast arrival of 39 mph winds here (computed from NHC radii)'}>
          <svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true"><circle cx="6" cy="6" r="5" fill="none" stroke="currentColor" stroke-width="1.5" /><path d="M6 3v3.2l2 1.2" fill="none" stroke="currentColor" stroke-width="1.5" /></svg>
          {w.a34 === 0 ? (lang.value === 'es' ? 'ya' : 'now') : `${w.a34} h`}</span>}
        {statusLabel && <span class={'dstat ' + (thisRound?.action ?? '')}>{statusLabel}</span>}
        <button class="ghost more" aria-expanded={open} onClick={() => setOpen(!open)} aria-label={t('note')}>
          <svg viewBox="0 0 16 16" width="14" height="14"><path d={open ? 'M3 10l5-5 5 5' : 'M3 6l5 5 5-5'} fill="none" stroke="currentColor" stroke-width="2" /></svg>
        </button>
      </div>
      {dl.length > 0 && (
        <ul class="dd">
          {dl.slice(0, 3).map(x => (
            <li class={x.worse ? 'worse' : 'better'}>
              {x.key === 'a34' ? (x.from < 0 || x.to < 0 ? (lang.value === 'es' ? (x.to >= 0 ? `vientos de 39 mph ahora previstos ${dayTime(x.to)}` : 'vientos de 39 mph ya no previstos en 72 h') : (x.to >= 0 ? `39 mph winds now forecast ${dayTime(x.to)}` : '39 mph winds no longer forecast within 72 h'))
                : `39 mph ${dayTime(x.from)} → ${dayTime(x.to)}`)
                : `${x.key === 'p34' ? '39+' : x.key === 'p50' ? '58+' : '74+'} mph ${band(x.from)} → ${band(x.to)}`}
              <span aria-hidden="true"> {x.worse ? '▲' : '▼'}</span>
            </li>
          ))}
        </ul>
      )}
      {d.reasons.length > 0 && !open && <p class="dreasons">{d.reasons.map(r => <span class="tag">{t(('r_' + r) as any)}</span>)}{d.note && <span class="dnote">{d.note}</span>}</p>}
      {d.trigger && !open && <p class="dtrigger"><b>{t('trigger')}:</b> {d.trigger}</p>}
      {st.needsReview && (
        <div class="dreview">
          <button onClick={() => review(d.id, 'keep')}>{t('keep')}</button>
          <button onClick={() => { review(d.id, 'change'); setOpen(true) }}>{t('change')}</button>
          <button class="drop" onClick={() => review(d.id, 'drop')}>{t('drop')}</button>
        </div>
      )}
      {!st.needsReview && st.lastRound === s.round && thisRound && thisRound.action !== 'add' && (
        <button class="link undo" onClick={() => review(d.id, thisRound.action)}>{lang.value === 'es' ? 'deshacer' : 'undo'}</button>
      )}
      {open && (
        <div class="dedit">
          <p class="lbl">{t('why')}</p>
          <div class="reasons">
            {REASONS.map(r => (
              <button aria-pressed={d.reasons.includes(r)} onClick={() => editDecision(d.id, x => { x.reasons = x.reasons.includes(r) ? x.reasons.filter(y => y !== r) : [...x.reasons, r] })}>{t(('r_' + r) as any)}</button>
            ))}
          </div>
          <label class="field"><span>{t('note')}</span>
            <input value={d.note} placeholder={t('notePh')} onInput={(e) => editDecision(d.id, x => { x.note = (e.target as HTMLInputElement).value })} /></label>
          <label class="field"><span>{t('trigger')}</span>
            <input value={d.trigger} placeholder={t('triggerPh')} onInput={(e) => editDecision(d.id, x => { x.trigger = (e.target as HTMLInputElement).value })} /></label>
          <div class="table-move">
            {session.value.tables.map(x => (
              <button aria-pressed={x.id === d.table} title={x.name} style={{ '--tc': x.color } as any} onClick={() => editDecision(d.id, y => { y.table = x.id })}><TableDot color={x.color} /></button>
            ))}
            <button class="link danger" onClick={() => { if (confirm(t('remove') + '?')) removeDecision(d.id) }}>{t('remove')}</button>
          </div>
        </div>
      )}
    </li>
  )
}

const CHECKS: { k: string; re: RegExp }[] = [
  { k: 'mc_hazard', re: /\b(rain|flood|flooding|landslide|mudslide|wind|surge|river|lluvia|inundaci|deslizamiento|derrumbe|viento|marejada|r[ií]o)/i },
  { k: 'mc_where', re: /\b(north|south|east|west|central|coast|mountain|interior|island|norte|sur|este|oeste|centro|costa|monta|isla|municipio)|[A-Z][a-zá-ú]+ (and|y) [A-Z]/ },
  { k: 'mc_when', re: /\b(today|tonight|tomorrow|morning|afternoon|evening|monday|tuesday|wednesday|thursday|friday|saturday|sunday|hoy|esta noche|mañana|tarde|lunes|martes|miércoles|jueves|viernes|sábado|domingo|\d{1,2}\s?(am|pm|a\. ?m\.|p\. ?m\.)|hours?|horas?)\b/i },
  { k: 'mc_sure', re: /\b(likely|possible|possibly|could|may|might|chance|expected|probable|posible|podr[ií]a|puede|probabilidad|se espera|%|percent|por ciento)/i },
  { k: 'mc_do', re: /\b(prepare|move|leave|go|stay|avoid|check|charge|secure|evacuate|call|have|know|prep[aá]r|mu[eé]v|sal(ga|ir)|qu[eé]d|evit|revis|carg|asegur|desaloj|llam|tenga|conozca)/i },
]

function Message() {
  const s = session.value
  const tb = tableById.value[activeTable.value]
  const txt = s.messages[activeTable.value]?.[s.round] ?? ''
  return (
    <section class="message">
      <h3>{t('message')} <TableDot color={tb?.color ?? '#999'} /> <small>{tb?.name}</small></h3>
      <textarea rows={3} value={txt} placeholder={t('messagePh')} onInput={(e) => update(x => {
        x.messages[activeTable.value] = { ...(x.messages[activeTable.value] ?? {}), [x.round]: (e.target as HTMLTextAreaElement).value }
      })} />
      <p class="checks"><span>{t('messageCheck')}</span>
        {CHECKS.map(c => <span class={'chk' + (c.re.test(txt) ? ' ok' : '')}>{c.re.test(txt) ? '✓' : '○'} {t(c.k as any)}</span>)}
      </p>
    </section>
  )
}


