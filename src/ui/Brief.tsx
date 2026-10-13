import { session, advisory, peek, textDrawer, lang } from '../state'
import { whereLine } from '../lib/where'
import { prompts } from '../lib/prompts'
import { data } from '../data'
import { t } from '../i18n'
import { when, mph, kmh, dayTime } from '../lib/format'
import { advDeltas, earliestArrival } from '../lib/conditions'
import { StatusChip, useRedact, sentence, Src } from './common'
import type { Advisory, Kt } from '../types'

const STATIONS = ['Vieques', 'San Juan', 'Ponce', 'Aguadilla']

export function Brief() {
  const a = advisory.value
  const S = data.scenario.value!
  const s = session.value
  const R = useRedact()
  if (!a) return null
  const shownRound = peek.value ?? Math.min(s.round, s.rounds.length - 1)
  const prevNum = shownRound > 0 ? s.rounds[shownRound - 1] : null
  const prev = prevNum ? S.advisories.find(x => x.num === prevNum)! : null
  const history = s.rounds.slice(0, shownRound + 1).map(n => S.advisories.find(x => x.num === n)!)
  const dl = prev ? advDeltas(prev, a) : []
  const arr = earliestArrival(a.num)
  const loc = whereLine(a.summary, lang.value === 'es')

  return (
    <div class="brief scroll">
      {peek.value != null && <div class="peek-note">{t('peeking', { n: a.num })} <button class="link" onClick={() => (peek.value = null)}>{t('backToNow')}</button></div>}
      <p class="issued">{t('advisory', { n: a.num })}, {t('issued', { t: when(a.issued) })}</p>
      <h1 class="headline">{a.headline.map(h => <span>{R(sentence(h))}</span>)}</h1>

      {(() => { const ps = prompts(a, prev, shownRound === s.rounds.length - 1); return ps.length > 0 && (
        <section class="prompts" aria-label={t('forDiscussion')}>
          <h2>{t('forDiscussion')}</h2>
          <ul>{ps.map(p => <li>{p}</li>)}</ul>
        </section>
      ) })()}

      <section class="changed">
        <h2>{prev ? t('changed', { t: dayTime(prev.issued) }) : t('firstRound')}</h2>
        {prev && (dl.length ? (
          <ul class="deltas">
            {dl.map(d => (
              <li class={d.worse ? 'worse' : 'better'}>
                <span class="arrow" aria-hidden="true">{d.worse ? '▲' : '▼'}</span>
                {d.kind === 'warning' && <span><StatusChip code={d.from as string | null} size="sm" /> → <StatusChip code={d.to as string | null} size="sm" /></span>}
                {d.kind === 'rain' && <span>{t('dRain', { from: d.from!, to: d.to! })}</span>}
                {d.kind === 'intensity' && <span>{t('dIntensity', { from: mph(d.from as number), to: mph(d.to as number) })}</span>}
                {d.kind === 'track' && <span>{t('dTrack', { from: d.from!, to: d.to! })}</span>}
              </li>
            ))}
          </ul>
        ) : <p class="quiet">{t('noChange')}</p>)}
      </section>

      <section class="facts">
        <dl>
          <div><dt>{t('maxWind')}</dt><dd><strong>{mph(a.wind_kt)} mph</strong> <span class="quiet">{kmh(a.wind_kt)} km/h, {a.wind_kt} kt</span></dd></div>
          <div><dt>{t('where')}</dt><dd>{loc.map(l => <span class="loc">{l}</span>)}</dd></div>
          {arr && <div><dt>{t('arrival')}</dt><dd>{arr - a.issued < 3600e3 ? t('arrivalNow') : t('arrivalVal', { t: when(arr) + ' AST', h: Math.round((arr - a.issued) / 3600e3) })}<span class="derived" title={t('arrivalNote')}>{t('derived')}</span></dd></div>}
          <div><dt>{t('closest')}</dt><dd>{t('closestVal', { t: dayTime(a.nearPR.t) + ' AST', km: a.nearPR.km, mph: mph(a.nearPR.wind_kt) })}<span class="derived" title={a.nearPR.derived}>{t('derived')}</span></dd></div>
        </dl>
      </section>

      <WindTable a={a} history={history} />
      <Rain a={a} history={history} />

      {a.hls && (
        <section class="local">
          <h2>{t('local')}</h2>
          <ul class="impacts">
            {(['WIND', 'FLOODING RAIN', 'SURGE', 'TORNADOES'] as const).filter(k => a.hls!.impacts[k]).map(k => (
              <li><span class="hz">{hazardName(k)}</span> {R(firstSentences(a.hls!.impacts[k], 2))}</li>
            ))}
          </ul>
          <p class="cite">{a.hls.label}, {a.hls.number && `#${a.hls.number}`} <button class="link" onClick={() => (textDrawer.value = 'hls')}>{t('readAsIssued')}</button></p>
        </section>
      )}

      {a.keyMessages.length > 0 && (
        <section class="km">
          <h2>{t('keyMessages')}</h2>
          <ol>{a.keyMessages.map(m => <li>{R(m)}</li>)}</ol>
        </section>
      )}

      <section class="asissued">
        <h2>{t('readAsIssued')}</h2>
        <div class="btnrow">
          <button onClick={() => (textDrawer.value = 'public')}>{t('public')}</button>
          <button onClick={() => (textDrawer.value = 'discussion')}>{t('discussion')}</button>
          <button onClick={() => (textDrawer.value = 'probabilities')}>{t('probabilities')}</button>
          {a.hls && <button onClick={() => (textDrawer.value = 'hls')}>{t('hls')}</button>}
        </div>
        <p class="cite">NOAA National Hurricane Center, {a.label}. <Src href={a.source.public} /></p>
      </section>
    </div>
  )
}

function hazardName(k: string) {
  const m: Record<string, [string, string]> = { WIND: ['Wind', 'Viento'], 'FLOODING RAIN': ['Flooding rain', 'Lluvia e inundación'], SURGE: ['Surge', 'Marejada ciclónica'], TORNADOES: ['Tornadoes', 'Tornados'] }
  return (m[k] ?? [k, k])[document.documentElement.lang === 'es' ? 1 : 0]
}

function firstSentences(s: string, n: number) {
  const parts = s.replace(/\s+/g, ' ').split(/(?<=\.)\s+(?=[A-Z])/)
  return parts.slice(0, n).join(' ')
}

function WindTable({ a, history }: { a: Advisory; history: Advisory[] }) {
  const prev = history.length > 1 ? history[history.length - 2] : null
  const last = (adv: Advisory | null, st: string, kt: Kt) => {
    const row = adv?.pws.rows[st]?.[kt]
    return row ? row[row.length - 1] : (adv?.pws.rows[st] ? 0 : null)
  }
  const rows = STATIONS.filter(st => a.pws.rows[st])
  return (
    <section class="winds">
      <h2>{t('winds')}</h2>
      <table class="wt">
        <thead><tr><th /><th>{t('ts')}</th><th>{t('dmg')}</th><th>{t('hu')}</th></tr></thead>
        <tbody>
          {rows.map(st => (
            <tr>
              <th scope="row">{st}</th>
              {(['34', '50', '64'] as Kt[]).map(kt => {
                const v = last(a, st, kt) ?? 0
                const p = prev ? last(prev, st, kt) : null
                const d = p == null ? 0 : v - p
                return (
                  <td>
                    <span class="pv" style={{ '--p': v / 100 } as any}>{v < 1 ? '<1' : v}<small>%</small></span>
                    {p != null && d !== 0 && <span class={'pd ' + (d > 0 ? 'up' : 'down')}>{d > 0 ? '▲' : '▼'}{Math.abs(d)}</span>}
                    {history.length > 1 && <Spark vals={history.map(h => last(h, st, kt) ?? 0)} />}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p class="note">{t('windsNote')} <Src href={a.source.probabilities} /></p>
    </section>
  )
}

function Spark({ vals }: { vals: number[] }) {
  const w = 44, h = 14
  const pts = vals.map((v, i) => [vals.length === 1 ? w : (i / (vals.length - 1)) * w, h - (v / 100) * h])
  return (
    <svg class="spark" width={w} height={h} viewBox={`-1 -1 ${w + 2} ${h + 2}`} aria-hidden="true">
      <line x1="0" y1={h} x2={w} y2={h} />
      <polyline points={pts.map(p => p.join(',')).join(' ')} />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="1.8" />
    </svg>
  )
}

function Rain({ a, history }: { a: Advisory; history: Advisory[] }) {
  const max = 30
  const R = a.rainPR
  if (!R) return null
  const bar = (x: Advisory, cur: boolean) => {
    const r = x.rainPR
    if (!r) return null
    return (
      <div class={'rbar' + (cur ? ' cur' : '')}>
        <span class="rlabel">{cur ? '' : dayTime(x.issued)}</span>
        <span class="rtrack">
          <span class="rrange" style={{ left: `${(r.low_in / max) * 100}%`, width: `${((r.high_in - r.low_in) / max) * 100}%` }} />
          {r.max_in && <span class="rmax" style={{ left: `${(r.max_in / max) * 100}%` }} />}
        </span>
      </div>
    )
  }
  return (
    <section class="rain">
      <h2>{t('rain')}</h2>
      <p class="rain-now"><strong>{t('rainRange', { lo: R.low_in, hi: R.high_in })}</strong>{R.max_in ? <span>, {t('rainMax', { max: R.max_in })}</span> : null}</p>
      <div class="rbars">
        {history.slice(0, -1).map(h => bar(h, false))}
        {bar(a, true)}
        <div class="raxis"><span>0</span><span>10</span><span>20</span><span>30 in</span></div>
      </div>
      <p class="quote">{sentenceKeep(R.text)}</p>
    </section>
  )
}

function sentenceKeep(s: string) { return s.replace(/\s+/g, ' ') }
