import { session, tableById, stateAt, view, lang, exportSession } from '../state'
import { data, muni, point } from '../data'
import { t } from '../i18n'
import { dayTime } from '../lib/format'
import { QUESTIONS, lensText } from '../lib/lens'
import { TableDot, download } from './common'
import { KindGlyph } from './Decisions'
import type { Decision, DecisionKind } from '../types'

const FRAME: { q: number; en: string[]; es: string[] }[] = [
  { q: 1, en: ['Name the hazard, not the category: wind, rain, landslides, surge, each on its own map.', 'Read probabilities, not the line: a 30 % chance of damaging wind is a planning number.'],
    es: ['Nombren el peligro, no la categoría: viento, lluvia, deslizamientos, marejada, cada uno en su mapa.', 'Lean probabilidades, no la línea: 30 % de probabilidad de viento dañino es un número para planificar.'] },
  { q: 2, en: ['Work back from the arrival of tropical-storm winds: outdoor work, deliveries and evacuations end there.', 'Expect warnings to come late when a storm strengthens fast; the clock is the arrival, not the warning.'],
    es: ['Planifiquen hacia atrás desde la llegada de los vientos de tormenta tropical: ahí termina el trabajo afuera, las entregas y los desalojos.', 'Esperen avisos tardíos cuando una tormenta se intensifica rápido; el reloj es la llegada, no el aviso.'] },
  { q: 3, en: ['Find the people the averages hide: tracts, not municipios; people on electric medical equipment; households without a car.'],
    es: ['Busquen a las personas que los promedios esconden: sectores, no municipios; personas con equipo médico eléctrico; hogares sin carro.'] },
  { q: 4, en: ['Check the places people depend on against every hazard map: shelters, hospitals, water, the bridges that connect them.'],
    es: ['Revisen los lugares de los que depende la gente contra cada mapa de peligro: refugios, hospitales, agua y los puentes que los conectan.'] },
  { q: 5, en: ['Write the trigger next to each decision: the number that would make you change it. Then watch for it.'],
    es: ['Escriban el detonante junto a cada decisión: el número que les haría cambiarla. Luego vigílenlo.'] },
]

const SAY: [string, string][] = [
  ['What: the hazard and what it will do ("flooding rain that can trigger landslides").', 'Qué: el peligro y lo que hará ("lluvia que puede provocar deslizamientos").'],
  ['Where: places people recognize, not the cone.', 'Dónde: lugares que la gente reconoce, no el cono.'],
  ['When: a window, in local time, and when it closes for preparations.', 'Cuándo: una ventana, en hora local, y cuándo se cierra para prepararse.'],
  ['How sure: a range or a likelihood, said plainly, and that it may change.', 'Qué tan seguro: un rango o una probabilidad, dicho claro, y que puede cambiar.'],
  ['What to do: one action for each audience.', 'Qué hacer: una acción para cada público.'],
]

function csv(ds: Decision[]) {
  const s = session.value
  const tb = tableById.value
  const rows = [['table', 'kind', 'target_type', 'target_id', 'target_name', 'municipio', 'lon', 'lat', 'reasons', 'note', 'revisit_if', 'added_round', 'history', 'standing']]
  for (const d of ds) {
    rows.push([tb[d.table]?.name ?? d.table, d.kind, d.target.type, d.target.id, d.target.name, muni(d.target.muni)?.name ?? '', String(d.target.lon), String(d.target.lat),
      d.reasons.join(' '), d.note, d.trigger, String(d.history[0].round + 1), d.history.map(h => `${h.round + 1}:${h.action}`).join(' '), String(stateAt(d, s.rounds.length - 1).active)])
  }
  return new Blob([rows.map(r => r.map(c => /[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c).join(',')).join('\n')], { type: 'text/csv' })
}

export function Debrief() {
  const s = session.value
  const tb = tableById.value
  const es = lang.value === 'es'
  const last = s.rounds.length - 1
  const S = data.scenario.value!
  const standing = s.decisions.filter(d => stateAt(d, last).active)
  const kinds: DecisionKind[] = ['outreach', 'staging', 'closer']
  return (
    <div class="debrief">
      <header class="db-head">
        <div>
          <h1>{s.title}</h1>
          <p class="lede">{t('debrief')}. {S.storm.name} {S.storm.year}, {es ? 'advertencias' : 'advisories'} {s.rounds.join(', ')}.</p>
        </div>
        <div class="btnrow noprint">
          <button onClick={() => (view.value = session.value.round >= session.value.rounds.length ? 'reveal' : 'exercise')}>{t('backToExercise')}</button>
          <button onClick={() => print()}>{t('print')}</button>
          <button onClick={() => download(csv(s.decisions), 'landfall-decisions.csv')}>{t('exportCsv')}</button>
          <button onClick={() => download(exportSession(), 'landfall-session.json')}>{t('exportFile')}</button>
        </div>
      </header>

      <section class="db-plan">
        <h2>{t('plan')}</h2>
        <p class="note">{t('planNote')}</p>
        <div class="db-cols">
          {kinds.map(k => (
            <div>
              <h3><KindGlyph kind={k} /> {t(('kind_' + k) as any)}</h3>
              <ul>
                {standing.filter(d => d.kind === k).sort((a, b) => s.tables.findIndex(x => x.id === a.table) - s.tables.findIndex(x => x.id === b.table)).map(d => (
                  <li><TableDot color={tb[d.table]?.color ?? '#999'} /> <b>{d.target.type === 'point' ? point(d.target.id)?.name ?? d.target.name : d.target.name}</b>
                    <span class="db-meta">{tb[d.table]?.name}{d.reasons.length ? `; ${d.reasons.map(r => t(('r_' + r) as any)).join(', ')}` : ''}</span>
                    {d.note && <span class="db-note">{d.note}</span>}
                    {d.trigger && <span class="db-note"><i>{t('trigger')}:</i> {d.trigger}</span>}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section class="db-journey">
        <h2>{t('journey')}</h2>
        <table>
          <thead><tr><th />{s.rounds.map((n, i) => <th>{i + 1}<small>{dayTime(S.advisories.find(a => a.num === n)!.issued)}</small></th>)}</tr></thead>
          <tbody>
            {s.tables.map(x => (
              <tr>
                <th scope="row"><TableDot color={x.color} /> {x.name}</th>
                {s.rounds.map((_, r) => {
                  const hs = s.decisions.filter(d => d.table === x.id).flatMap(d => d.history.filter(h => h.round === r))
                  const c = (a: string) => hs.filter(h => h.action === a).length
                  return <td>{(['add', 'keep', 'change', 'drop'] as const).filter(a => c(a)).map(a => <span class={'jb ' + a} title={a}>{a === 'add' ? '+' : a === 'keep' ? '=' : a === 'change' ? '~' : '−'}{c(a)}</span>)}</td>
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <p class="note">{es ? '+ añadidas, = mantenidas, ~ cambiadas, − descartadas' : '+ added, = kept, ~ changed, − dropped'}</p>
      </section>

      <section class="db-frame">
        <h2>{t('framework')}</h2>
        <ol class="frame">
          {FRAME.map(f => (
            <li><h3>{lensText(QUESTIONS[f.q])}</h3>{(es ? f.es : f.en).map(p => <p>{p}</p>)}</li>
          ))}
        </ol>
        <div class="say">
          <h3>{es ? 'Cómo decirlo' : 'How to say it'}</h3>
          <ul>{SAY.map(p => <li>{es ? p[1] : p[0]}</li>)}</ul>
        </div>
        {Object.keys(s.messages).length > 0 && (
          <div class="msgs">
            <h3>{t('message')}</h3>
            {s.tables.map(x => {
              const m = s.messages[x.id] ?? {}
              const rs = Object.keys(m).map(Number).filter(r => m[r]?.trim()).sort((a, b) => a - b)
              if (!rs.length) return null
              return <div class="msg"><p class="lbl"><TableDot color={x.color} /> {x.name}</p>{rs.map(r => <blockquote><small>{t('round', { n: r + 1, m: s.rounds.length })}</small> {m[r]}</blockquote>)}</div>
            })}
          </div>
        )}
      </section>
      <p class="fine">{S.sources.nhc_text}. {S.sources.tcr}.</p>
    </div>
  )
}
