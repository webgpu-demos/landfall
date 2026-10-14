import { session, update, view, lang, TABLE_COLORS, DEFAULT_ROUNDS, DEFAULT_BUDGET, resetSession, importSession, activeTable, offline, about, flash, introOn, updateReady, updater } from '../state'
import { data } from '../data'
import { t } from '../i18n'
import { when } from '../lib/format'
import { prStatus } from '../lib/conditions'
import { StatusChip } from './common'
import { useRef } from 'preact/hooks'

const GUIDE_EN: [string, string][] = [
  ['Before', 'Open this page on the laptop that drives the projector, set the tables and rounds, and wait for "Saved for offline use". Seat each agency at a table; one facilitator enters everything.'],
  ['Each round, about 10 minutes', 'Read the headline and "For the tables" aloud (2 min). Tables decide where to act first and why; click the place on the map and add it for that table, with a reason (5 min). Each table reports one decision and its trigger to revisit (3 min).'],
  ['Between rounds', 'Press Next advisory (or N). Earlier decisions ask to be kept, changed or dropped; the arrows show what moved for each one. Ask the tables what changed their minds, and what did not.'],
  ['The reveal, about 10 minutes', 'After the last round, show what happened: the storm\'s name, its actual track, the flood warnings, the rain, and where each table acted. Judge the reasoning, not the luck.'],
  ['Debrief, about 10 minutes', 'Walk the session\'s action list and the five questions; print it or save it as a CSV for the room.'],
]
const GUIDE_ES: [string, string][] = [
  ['Antes', 'Abran esta página en la computadora del proyector, preparen mesas y rondas, y esperen a "Guardado para usar sin conexión". Sienten a cada agencia en una mesa; una persona facilitadora registra todo.'],
  ['Cada ronda, unos 10 minutos', 'Lean en voz alta el titular y "Para las mesas" (2 min). Las mesas deciden dónde actuar primero y por qué; hagan clic en el lugar en el mapa y añádanlo para esa mesa, con una razón (5 min). Cada mesa reporta una decisión y su detonante para revisarla (3 min).'],
  ['Entre rondas', 'Opriman Próxima advertencia (o N). Las decisiones anteriores piden mantener, cambiar o descartar; las flechas muestran qué cambió en cada una. Pregunten qué les hizo cambiar de opinión y qué no.'],
  ['La revelación, unos 10 minutos', 'Después de la última ronda, muestren lo que pasó: el nombre de la tormenta, su trayectoria real, los avisos de inundaciones, la lluvia y dónde actuó cada mesa. Juzguen el razonamiento, no la suerte.'],
  ['Repaso, unos 10 minutos', 'Recorran la lista de acciones de la sesión y las cinco preguntas; imprímanla o guárdenla como CSV.'],
]

export function Setup() {
  const s = session.value
  const S = data.scenario.value!
  const file = useRef<HTMLInputElement>(null)
  const inProgress = s.started && s.decisions.length > 0
  const resumable = s.started && (s.round > 0 || s.decisions.length > 0)
  const atReveal = s.started && s.round >= s.rounds.length
  const roundNo = Math.min(s.round + 1, s.rounds.length)
  const start = () => {
    update(x => { x.started = true; if (!inProgress) { x.round = 0 } })
    activeTable.value = session.value.tables[0]?.id ?? 't1'
    view.value = session.value.round >= session.value.rounds.length ? 'reveal' : 'exercise'
    if (view.value === 'exercise') flash.value = session.value.round
  }
  const startOver = () => { if (confirm(t('confirmNew'))) resetSession() }
  const nd = s.decisions.length === 1 ? t('oneDecision') : t('nDecisions', { n: s.decisions.length })
  const startLabel = atReveal ? t('toReveal') : resumable ? t('resume', { n: roundNo }) : t('start')
  const steps = [1, 2, 3, 4, 5].map(i => ({ h: t(('how' + i) as any), d: t(('how' + i + 'd') as any), m: t(('how' + i + 'm') as any, { n: s.rounds.length, m: s.timerMin }) }))
  const built = new Date(__BUILD__.time)
  const version = `${built.toISOString().slice(0, 16).replace('T', ' ')} UTC${__BUILD__.sha ? ' · ' + __BUILD__.sha : ''}`
  return (
    <div class="setup">
      <div class="setup-top">
        <div class="setup-inner">
          {updateReady.value && (
            <div class="update-bar" role="status">
              <span>{t('updateReady')} {t('updateKept')}</span>
              <button class="primary" onClick={() => updater.apply()}>{t('updateReload')}</button>
            </div>
          )}
          <header class="setup-head">
            <div class="seg" role="group" aria-label="Language">
              <button aria-pressed={lang.value === 'en'} onClick={() => (lang.value = 'en')}>English</button>
              <button aria-pressed={lang.value === 'es'} onClick={() => (lang.value = 'es')}>Español</button>
            </div>
            <h1>{t('appTitle')}</h1>
            <p class="lede">{t('appSub')}</p>
            <div class="home-actions">
              {resumable ? (
                <div class="resume-card">
                  <p class="rc-k">{t('inProgress')}</p>
                  <p class="rc-v">{atReveal ? t('inReveal', { d: nd }) : t('inProgressD', { r: roundNo, n: s.rounds.length, d: nd })}</p>
                  <div class="rc-row">
                    <button class="primary big" onClick={start}>{startLabel}</button>
                    <button class="link" onClick={startOver}>{t('startOver')}</button>
                  </div>
                </div>
              ) : <button class="primary big start-btn" onClick={start}>{startLabel} <span aria-hidden="true">→</span></button>}
              <button class="play-opening" onClick={() => (introOn.value = true)}><svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true"><path d="M2 1l9 5-9 5z" fill="currentColor" /></svg>{t('playOpening1')}</button>
            </div>
            {offline.value !== 'unknown' && <p class={'offline ' + offline.value}>{offline.value === 'ready' ? t('offReady') : offline.value === 'saving' ? t('offSaving') : t('offNo')}</p>}
          </header>

          <section class="how" aria-labelledby="how-h">
            <h2 id="how-h">{t('howTitle')}</h2>
            <ol class="how-steps">
              {steps.map((st, i) => <li><span class="how-n">{i + 1}</span><h3>{st.h}</h3><p>{st.d}</p><small>{st.m}</small></li>)}
            </ol>
            <p class="how-roles">{t('howRoles')}</p>
          </section>
        </div>
      </div>

      <div class="setup-inner">
        <h2 class="before-h">{t('beforeTitle')}</h2>
        <p class="before-note">{t('beforeNote')}</p>
        <div class="setup-grid">
          <section>
            <label class="field"><span>{t('sessionTitle')}</span>
              <input value={s.title} onInput={(e) => update(x => { x.title = (e.target as HTMLInputElement).value })} /></label>
            <label class="field"><span>{t('codename')}</span>
              <input value={s.codename} maxLength={24} onInput={(e) => update(x => { x.codename = (e.target as HTMLInputElement).value })} />
              <small>{t('codenameNote')}</small></label>
            <label class="check budget"><input type="checkbox" checked={!!s.budget} onChange={(e) => update(x => { x.budget = (e.target as HTMLInputElement).checked ? { ...DEFAULT_BUDGET } : null })} /> <b>{t('budget')}</b></label>
            <p class="note budget-note">{t('budgetNote')}</p>
            <label class="field narrow"><span>{t('minutes')}</span>
              <input type="number" min={2} max={30} value={s.timerMin} onInput={(e) => update(x => { x.timerMin = Math.max(1, +(e.target as HTMLInputElement).value || 8) })} /></label>

            <h3>{t('tables')}</h3>
            <p class="note">{t('tablesNote')}</p>
            <ol class="tables-edit">
              {s.tables.map((tb, i) => (
                <li>
                  <span class="swatch" style={{ background: tb.color }}>{i + 1}</span>
                  <input value={tb.name} aria-label={`${t('table')} ${i + 1}`} onInput={(e) => update(x => { x.tables[i].name = (e.target as HTMLInputElement).value })} />
                  {s.tables.length > 1 && !s.decisions.some(d => d.table === tb.id) && <button class="ghost x" aria-label={t('remove')} onClick={() => update(x => { x.tables.splice(i, 1) })}>×</button>}
                </li>
              ))}
            </ol>
            {s.tables.length < 6 && <button class="link" onClick={() => update(x => {
              const used = new Set(x.tables.map(t => t.color))
              const color = TABLE_COLORS.find(c => !used.has(c)) ?? TABLE_COLORS[x.tables.length % 6]
              let n = x.tables.length + 1; while (x.tables.some(t => t.id === 't' + n)) n++
              x.tables.push({ id: 't' + n, name: `${t('table')} ${x.tables.length + 1}`, color })
            })}>+ {t('addTable')}</button>}
          </section>

          <section>
            <h3>{t('rounds')}</h3>
            <p class="note">{t('roundsNote')}</p>
            <ul class="rounds-edit">
              {S.advisories.filter(a => a.issued < S.landfall.t).map(a => {
                const on = s.rounds.includes(a.num)
                const h = Math.round((S.landfall.t - a.issued) / 3600e3)
                return (
                  <li class={on ? 'on' : ''}>
                    <label>
                      <input type="checkbox" checked={on} disabled={s.started && s.round > 0} onChange={() => update(x => {
                        x.rounds = on ? x.rounds.filter(n => n !== a.num) : [...x.rounds, a.num].sort((p, q) => p - q)
                        if (!x.rounds.length) x.rounds = [...DEFAULT_ROUNDS]
                      })} />
                      <span class="rn">{a.num}</span>
                      <span class="rt">{when(a.issued)} AST</span>
                      <StatusChip code={prStatus(a)} size="sm" />
                      <span class="rh">{t('hoursBefore', { h })}</span>
                    </label>
                  </li>
                )
              })}
            </ul>
          </section>
        </div>

        <details class="guide">
          <summary>{t('facNotes')}</summary>
          <ol class="guide-steps">
            {(lang.value === 'es' ? GUIDE_ES : GUIDE_EN).map(([h, p]) => <li><h3>{h}</h3><p>{p}</p></li>)}
          </ol>
        </details>

        <footer class="setup-foot">
          <button class="primary big" onClick={start}>{startLabel}</button>
          <button class="link" onClick={() => file.current?.click()}>{t('importFile')}</button>
          {s.started && <button class="link" onClick={startOver}>{t('newSessionBtn')}</button>}
          <button class="link" onClick={() => (about.value = true)}>{t('about')}</button>
          <span class="version" title={__BUILD__.time}>{t('version', { v: version })}</span>
          <input ref={file} type="file" accept=".json,application/json" hidden onChange={async (e) => {
            const f = (e.target as HTMLInputElement).files?.[0]
            if (f) { try { await importSession(f) } catch (err) { alert(String(err)) } }
          }} />
        </footer>
        <p class="fine">{S.sources.nhc_text}. {S.sources.hls}. {lang.value === 'es' ? 'Lugares, personas e instalaciones: datos públicos actuales recopilados por Garita (webgpu-demos.github.io/garita). Demostrador independiente; no es para uso operacional.' : 'Places, people and facilities: current public data compiled by Garita (webgpu-demos.github.io/garita). An independent demonstrator; not for operational use.'}</p>
      </div>
    </div>
  )
}
