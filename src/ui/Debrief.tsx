import { session, tableById, stateAt, view, lang, exportSession } from '../state'
import { DebriefMap } from './DebriefMap'
import { data, muni, point } from '../data'
import { t } from '../i18n'
import { dayTime, num } from '../lib/format'
import { QUESTIONS, lensText } from '../lib/lens'
import { TableDot, download } from './common'
import { KindGlyph } from './Decisions'
import { FinalBoard } from './Game'
import { targetBonus, reveal, live, RIGHT_CALL } from '../lib/score'
import type { Decision, DecisionKind, Session } from '../types'

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
  const rows = [['table', 'kind', 'target_type', 'target_id', 'target_name', 'municipio', 'lon', 'lat', 'reasons', 'note', 'revisit_if', 'added_round', 'history', 'standing', 'outcome_bonus']]
  for (const d of ds) {
    rows.push([tb[d.table]?.name ?? d.table, d.kind, d.target.type, d.target.id, d.target.name, muni(d.target.muni)?.name ?? '', String(d.target.lon), String(d.target.lat),
      d.reasons.join(' '), d.note, d.trigger, String(d.history[0].round + 1), d.history.map(h => `${h.round + 1}:${h.action}`).join(' '), String(stateAt(d, s.rounds.length - 1).active), String(stateAt(d, s.rounds.length - 1).active ? targetBonus(d).pts : 0)])
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
  const st = stats(s)
  const anyPoints = s.tables.some(x => live(s, x.id, s.rounds.length).total > 0)
  const nameOf = (d: Decision) => d.target.type === 'point' ? point(d.target.id)?.name ?? d.target.name : d.target.name
  return (
    <div class="debrief">
      <div class="db-top">
        <div class="db-inner">
          <header class="db-head">
            <div>
              <p class="db-eyebrow">{t('debrief')}</p>
              <h1>{s.title}</h1>
              <p class="lede">{t('dbStorm', { name: S.storm.name, year: S.storm.year, adv: s.rounds.join(', '), n: s.tables.length })}</p>
            </div>
            <div class="btnrow noprint">
              <button onClick={() => (view.value = session.value.round >= session.value.rounds.length ? 'reveal' : 'exercise')}>{t('backToExercise')}</button>
              <button onClick={() => print()}>{t('print')}</button>
              <button onClick={() => download(csv(s.decisions), 'landfall-decisions.csv')}>{t('exportCsv')}</button>
              <button onClick={() => download(exportSession(), 'landfall-session.json')}>{t('exportFile')}</button>
            </div>
          </header>
          <ul class="db-stats">
            <li><span class="st-k">{t('stDecisions')}</span><b>{num(st.total)}</b><span class="st-s">{t('stDecisionsSub', { n: st.standing })}</span></li>
            <li><span class="st-k">{t('stReviewed')}</span><b>{num(st.reviewed)}</b><span class="st-s">{t('stReviewedSub', { c: st.moved })}</span></li>
            <li><span class="st-k">{t('stFirst')}</span><b>{st.firstH == null ? '–' : `${st.firstH} h`}</b><span class="st-s">{t('stFirstSub')}</span></li>
            <li><span class="st-k">{t('stHit')}</span><b>{st.targets ? t('ofN', { a: st.hits, b: st.targets }) : '–'}</b><span class="st-s">{t('stHitSub')}</span></li>
            <li><span class="st-k">{t('stRain')}</span><b>{st.calls ? t('ofN', { a: st.rain, b: st.calls }) : '–'}</b><span class="st-s">{t('stRainSub')}</span></li>
          </ul>
        </div>
      </div>

      <div class="db-inner">
        <section class="db-hero">
          <div class="db-hero-map">
            <h2>{t('dbMapTitle')}</h2>
            <DebriefMap />
          </div>
          <div class="db-score">
            <FinalBoard />
            {!anyPoints && <p class="note">{t('pointsNone')}</p>}
          </div>
        </section>

        <section class="db-journey">
          <h2>{t('journey')}</h2>
          <p class="note">{t('lifeNote')}</p>
          <Lifelines />
        </section>

        <section class="db-plan">
          <h2>{t('plan')}</h2>
          <p class="note">{t('planNote')}</p>
          <div class="db-cols">
            {kinds.map(k => {
              const ds = standing.filter(d => d.kind === k).sort((a, b) => s.tables.findIndex(x => x.id === a.table) - s.tables.findIndex(x => x.id === b.table))
              return (
                <div>
                  <h3><KindGlyph kind={k} /> {t(('kind_' + k) as any)} <span class="db-count">{ds.length}</span></h3>
                  {ds.length ? (
                    <ul>
                      {ds.map(d => {
                        const b = targetBonus(d)
                        return (
                          <li class="db-card" style={{ '--tc': tb[d.table]?.color ?? '#999' } as any}>
                            <div class="db-card-top"><b>{nameOf(d)}</b><span class={'evchip ' + (b.pts ? 'hit' : 'miss')}>{b.pts ? `+${b.pts}` : t('miss')}</span></div>
                            <span class="db-meta"><TableDot color={tb[d.table]?.color ?? '#999'} /> {tb[d.table]?.name}</span>
                            {d.reasons.length > 0 && <span class="db-tags">{d.reasons.map(r => <i>{t(('r_' + r) as any)}</i>)}</span>}
                            {d.note && <span class="db-note">{d.note}</span>}
                            {d.trigger && <span class="db-note"><em>{t('trigger')}:</em> {d.trigger}</span>}
                          </li>
                        )
                      })}
                    </ul>
                  ) : <p class="db-empty">{t('planEmpty')}</p>}
                </div>
              )
            })}
          </div>
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
    </div>
  )
}

/** The numbers at the top of the debrief. */
function stats(s: Session) {
  const S = data.scenario.value!
  const last = s.rounds.length - 1
  const steps = s.decisions.flatMap(d => d.history.slice(1))
  const first = s.decisions.length ? Math.min(...s.decisions.map(d => d.history[0].round)) : null
  const adv = first != null ? S.advisories.find(a => a.num === s.rounds[first]) : null
  const rev = reveal(s)
  const targets = rev.flatMap(r => r.events.filter(e => e.kind === 'target'))
  const calls = s.tables.flatMap(x => Object.values(s.calls[x.id] ?? {}).filter(Boolean))
  return {
    total: s.decisions.length,
    standing: s.decisions.filter(d => stateAt(d, last).active).length,
    reviewed: steps.length,
    moved: steps.filter(h => h.action === 'change' || h.action === 'drop').length,
    firstH: adv ? Math.round((S.landfall.t - adv.issued) / 3600e3) : null,
    targets: targets.length, hits: targets.filter(e => e.pts > 0).length,
    calls: calls.length, rain: calls.filter(c => c === RIGHT_CALL).length,
  }
}

/** Every decision as a line through the rounds: made, kept, changed, dropped; the outcome at landfall. */
function Lifelines() {
  const s = session.value
  const S = data.scenario.value!
  const n = s.rounds.length, last = n - 1
  if (!s.decisions.length) return <p class="db-empty big">{t('lifeNone')}</p>
  const W = 1000, NAME = 215, LAND = 96, TOP = 46, ROW = 26, HEAD = 30
  const colW = (W - NAME - LAND) / n
  const x = (r: number) => NAME + (r + 0.5) * colW
  const xl = W - LAND / 2
  type Row = { kind: 'table'; name: string; color: string } | { kind: 'none' } | { kind: 'dec'; d: Decision; color: string }
  const rows: Row[] = []
  for (const tb of s.tables) {
    rows.push({ kind: 'table', name: tb.name, color: tb.color })
    const ds = s.decisions.filter(d => d.table === tb.id).sort((a, b) => a.history[0].round - b.history[0].round)
    if (!ds.length) rows.push({ kind: 'none' })
    for (const d of ds) rows.push({ kind: 'dec', d, color: tb.color })
  }
  let y = TOP
  const placed = rows.map(r => { const h = r.kind === 'table' ? HEAD : ROW; const at = y + h / 2; y += h; return { r, at } })
  const H = y + 8
  const name = (d: Decision) => { const v = d.target.type === 'point' ? point(d.target.id)?.name ?? d.target.name : d.target.name; return v.length > 30 ? v.slice(0, 29) + '…' : v }
  return (
    <div class="lifelines-wrap">
      <svg class="lifelines" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('journey')}>
        {s.rounds.map((num, r) => {
          const a = S.advisories.find(q => q.num === num)!
          return (
            <g>
              <line x1={x(r)} x2={x(r)} y1={TOP - 4} y2={H - 6} class="ll-grid" />
              <text x={x(r)} y={16} class="ll-r">{r + 1}</text>
              <text x={x(r)} y={33} class="ll-t">{dayTime(a.issued)}</text>
            </g>
          )
        })}
        <line x1={xl} x2={xl} y1={TOP - 4} y2={H - 6} class="ll-grid land" />
        <text x={xl} y={16} class="ll-r land">{t('landfall')}</text>
        <text x={xl} y={33} class="ll-t land">{dayTime(S.landfall.t)}</text>
        {placed.map(({ r, at }) => {
          if (r.kind === 'table') return <g><circle cx={10} cy={at} r={6} fill={r.color} /><text x={24} y={at + 5} class="ll-table">{r.name}</text></g>
          if (r.kind === 'none') return <text x={24} y={at + 4} class="ll-none">{t('lifeTableNone')}</text>
          const d = r.d, c = r.color
          const drop = d.history.find(h => h.action === 'drop')
          const standing0 = !drop
          const end = drop ? x(drop.round) : xl - 24
          const standing = stateAt(d, last).active
          const hit = standing && targetBonus(d).pts > 0
          return (
            <g>
              <text x={24} y={at + 4} class={'ll-name' + (standing ? '' : ' gone')}>{name(d)}</text>
              <line x1={x(d.history[0].round)} x2={end} y1={at} y2={at} stroke={c} stroke-width={3.5} stroke-linecap="round" opacity={standing ? 1 : 0.45} />
              {d.history.map(h => {
                const cx = x(h.round)
                if (h.action === 'add') return <circle cx={cx} cy={at} r={6.5} fill={c} stroke="#fff" stroke-width={1.5} />
                if (h.action === 'keep') return <circle cx={cx} cy={at} r={5} fill="#fff" stroke={c} stroke-width={2.2} />
                if (h.action === 'change') return <rect x={cx - 5} y={at - 5} width={10} height={10} transform={`rotate(45 ${cx} ${at})`} fill="#fff" stroke={c} stroke-width={2.2} />
                return <g stroke={c} stroke-width={2.6} stroke-linecap="round"><line x1={cx - 5} y1={at - 5} x2={cx + 5} y2={at + 5} /><line x1={cx - 5} y1={at + 5} x2={cx + 5} y2={at - 5} /></g>
              })}
              {standing0 && (hit
                ? <g><rect x={xl - 20} y={at - 10} width={40} height={20} rx={10} class="ll-hit" /><text x={xl} y={at + 4.5} class="ll-hit-t">+3</text></g>
                : <g><rect x={xl - 22} y={at - 10} width={44} height={20} rx={10} class="ll-missbox" /><text x={xl} y={at + 4} class="ll-miss">{t('miss')}</text></g>)}
            </g>
          )
        })}
      </svg>
      <p class="ll-key">
        <span><svg width="14" height="14" viewBox="-7 -7 14 14"><circle r="6" fill="var(--ink)" /></svg>{t('lifeAdd')}</span>
        <span><svg width="14" height="14" viewBox="-7 -7 14 14"><circle r="5" fill="#fff" stroke="var(--ink)" stroke-width="2" /></svg>{t('lifeKeep')}</span>
        <span><svg width="14" height="14" viewBox="-7 -7 14 14"><rect x="-4.5" y="-4.5" width="9" height="9" transform="rotate(45)" fill="#fff" stroke="var(--ink)" stroke-width="2" /></svg>{t('lifeChange')}</span>
        <span><svg width="14" height="14" viewBox="-7 -7 14 14"><path d="M-5-5L5 5M-5 5L5-5" stroke="var(--ink)" stroke-width="2.4" stroke-linecap="round" /></svg>{t('lifeDrop')}</span>
        <span><b class="ll-hit-key">+3</b>{t('lifeHit')}</span>
      </p>
    </div>
  )
}
