import { session, update, view, lang, TABLE_COLORS, DEFAULT_ROUNDS, resetSession, importSession, activeTable } from '../state'
import { data } from '../data'
import { t } from '../i18n'
import { when } from '../lib/format'
import { prStatus } from '../lib/conditions'
import { StatusChip } from './common'
import { useRef } from 'preact/hooks'

export function Setup() {
  const s = session.value
  const S = data.scenario.value!
  const file = useRef<HTMLInputElement>(null)
  const inProgress = s.started && s.decisions.length > 0
  const start = () => {
    update(x => { x.started = true; if (!inProgress) { x.round = 0 } })
    activeTable.value = session.value.tables[0]?.id ?? 't1'
    view.value = session.value.round >= session.value.rounds.length ? 'reveal' : 'exercise'
  }
  return (
    <div class="setup">
      <div class="setup-inner">
        <header class="setup-head">
          <div class="seg" role="group" aria-label="Language">
            <button aria-pressed={lang.value === 'en'} onClick={() => (lang.value = 'en')}>English</button>
            <button aria-pressed={lang.value === 'es'} onClick={() => (lang.value = 'es')}>Español</button>
          </div>
          <h1>{t('appTitle')}</h1>
          <p class="lede">{t('appSub')}</p>
          <p>{t('setupIntro')}</p>
        </header>

        <div class="setup-grid">
          <section>
            <h2>{t('setupTitle')}</h2>
            <label class="field"><span>{t('sessionTitle')}</span>
              <input value={s.title} onInput={(e) => update(x => { x.title = (e.target as HTMLInputElement).value })} /></label>
            <label class="field"><span>{t('codename')}</span>
              <input value={s.codename} maxLength={24} onInput={(e) => update(x => { x.codename = (e.target as HTMLInputElement).value })} />
              <small>{t('codenameNote')}</small></label>
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

        <footer class="setup-foot">
          <button class="primary big" onClick={start}>{s.started && s.round > 0 ? t('resume', { n: Math.min(s.round + 1, s.rounds.length) }) : t('start')}</button>
          <button class="link" onClick={() => file.current?.click()}>{t('importFile')}</button>
          {s.started && <button class="link" onClick={() => { if (confirm(t('confirmNew'))) resetSession() }}>{t('newSessionBtn')}</button>}
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
