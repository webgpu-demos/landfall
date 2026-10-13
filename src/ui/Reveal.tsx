import { session, stateAt, selected, lang } from '../state'
import { data, muni, point } from '../data'
import { t } from '../i18n'
import { when, mph, num, dayTime, usd } from '../lib/format'
import { inGeometry, km } from '../lib/geo'
import { prStatus } from '../lib/conditions'
import { flyTo } from '../map/MapView'
import { Src, TableDot, StatusChip } from './common'
import { KindGlyph } from './Decisions'
import type { Decision, Observed } from '../types'

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

export function RevealPanel() {
  const S = data.scenario.value!
  const ob = data.observed.value
  const s = session.value
  const lf = S.landfall
  const advs = s.rounds.map(n => S.advisories.find(a => a.num === n)!)
  const es = lang.value === 'es'
  const hwr = S.advisories.find(a => prStatus(a) === 'HWR')
  const tsOnset = Date.UTC(2022, 8, 18, 10) // TCR: sustained tropical-storm-force winds reached Puerto Rico around 1000 UTC 18 Sep
  return (
    <div class="reveal scroll">
      <p class="issued">{es ? 'Revelación' : 'Reveal'}</p>
      <h1 class="headline"><span>{t('revealTitle')}</span></h1>
      <p class="lede">{t('revealSub')}</p>

      <section class="facts">
        <dl>
          <div><dt>{t('landfall')}</dt><dd><strong>{when(lf.t)} AST</strong>, {es ? 'cerca de Punta Tocón' : lf.place}</dd></div>
          <div><dt>{t('maxWind')}</dt><dd><strong>{mph(lf.wind_kt)} mph</strong> <span class="quiet">{lf.wind_kt} kt, {lf.pressure_mb} mb</span></dd></div>
          {hwr && <div><dt>{t('HWR')}</dt><dd>{when(hwr.issued)} AST: {Math.round((tsOnset - hwr.issued) / 3600e3)} h {es ? 'antes de los vientos de tormenta tropical (≈ 6 AM dom.)' : 'before tropical-storm winds arrived (about 6 AM Sunday)'}</dd></div>}
        </dl>
        <p class="cite">{lf.source}</p>
      </section>

      <section class="fvo">
        <h2>{t('rainForecastVsObs')}</h2>
        <RainVs advs={advs} ob={ob} />
      </section>

      <section class="fvo">
        <h2>{t('windForecastVsObs')}</h2>
        <div class="wvo">
          {advs.map((a, i) => (
            <div class="wrow"><span class="rlabel">{i + 1}. {dayTime(a.issued)}</span>
              <span class="wtrack"><span class="wdot" style={{ left: `${(mph(a.nearPR.wind_kt) / 120) * 100}%` }} /><span class="wval" style={{ left: `${(mph(a.nearPR.wind_kt) / 120) * 100}%` }}>{mph(a.nearPR.wind_kt)}</span></span>
              <StatusChip code={prStatus(a)} size="sm" /></div>
          ))}
          <div class="wrow obs"><span class="rlabel">{t('observedMax')}</span>
            <span class="wtrack"><span class="wdot obs" style={{ left: `${(mph(lf.wind_kt) / 120) * 100}%` }} /><span class="wval" style={{ left: `${(mph(lf.wind_kt) / 120) * 100}%` }}>{mph(lf.wind_kt)}</span></span><span /></div>
          <div class="raxis"><span>0</span><span>40</span><span>80</span><span>120 mph</span></div>
        </div>
        <p class="note">{es ? 'Pronóstico: viento máximo en la hora más cercana a Puerto Rico (interpolado aquí). Real: al tocar tierra (HURDAT2).' : 'Forecast: maximum wind at the forecast hour closest to Puerto Rico (interpolated here). Actual: at landfall (HURDAT2).'}</p>
      </section>

      <section class="record">
        <h2>{t('record')}</h2>
        <ul>{(ob?.facts ?? []).map(f => <li>{es ? f.es : f.en} <span class="cite">{f.src.replace(/^NHC Tropical Cyclone Report, Hurricane Fiona \(AL072022\), Pasch, Reinhart and Alaka, 23 March 2023/, 'NHC TCR')}</span></li>)}</ul>
        <p class="cite"><Src href="https://www.nhc.noaa.gov/data/tcr/AL072022_Fiona.pdf">NHC Tropical Cyclone Report, Hurricane Fiona (Pasch, Reinhart and Alaka, 2023)</Src></p>
      </section>

      {ob && (
        <section class="record">
          <h2>{es ? 'Sobre las capas medidas' : 'About the measured layers'}</h2>
          <p class="note">{ob.warnings.source}. {ob.warnings.note}</p>
          <p class="note">{ob.rain.source}. {ob.rain.note}</p>
          <p class="note">{ob.rivers.source}. {ob.rivers.note}</p>
        </section>
      )}
    </div>
  )
}

function RainVs({ advs, ob }: { advs: any[]; ob: Observed | null }) {
  const max = 40
  const g = ob?.rain.gauges.filter(r => r.complete >= 0.9) ?? []
  const sorted = [...g].map(r => r.in).sort((a, b) => a - b)
  const q = (p: number) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : 0
  const top = ob?.rain.gauges[0]
  return (
    <div class="rbars">
      {advs.map((a, i) => a.rainPR && (
        <div class="rbar"><span class="rlabel">{i + 1}. {dayTime(a.issued)}</span>
          <span class="rtrack"><span class="rrange" style={{ left: `${(a.rainPR.low_in / max) * 100}%`, width: `${((a.rainPR.high_in - a.rainPR.low_in) / max) * 100}%` }} />
            {a.rainPR.max_in && <span class="rmax" style={{ left: `${(a.rainPR.max_in / max) * 100}%` }} />}</span></div>
      ))}
      {sorted.length > 0 && (
        <div class="rbar obs"><span class="rlabel">{t('observedMax')}</span>
          <span class="rtrack"><span class="rrange obs" style={{ left: `${(q(0.25) / max) * 100}%`, width: `${((q(0.75) - q(0.25)) / max) * 100}%` }} />
            <span class="rmax obs" style={{ left: `${((top?.in ?? 0) / max) * 100}%` }} /></span></div>
      )}
      <div class="raxis"><span>0</span><span>10</span><span>20</span><span>30</span><span>40 in</span></div>
      {top && <p class="note">{lang.value === 'es'
        ? `Barra medida: la mitad central de ${sorted.length} pluviómetros completos del USGS (${num(q(0.25), 1)}–${num(q(0.75), 1)} pulg); marca: el máximo, ${num(top.in, 1)} pulg en ${top.name}. Pronóstico: rango y máximo local del NHC para Puerto Rico.`
        : `Measured bar: the middle half of ${sorted.length} complete USGS gauges (${num(q(0.25), 1)}–${num(q(0.75), 1)} in); tick: the highest, ${num(top.in, 1)} in at ${top.name}. Forecast: NHC's range and local maximum for Puerto Rico.`}</p>}
    </div>
  )
}

// ----------------------------------------------------------------------------------------------- outcomes

function ffwByMuni(ob: Observed | null) {
  const m = new Map<string, number>()
  for (const f of ob?.warnings.features ?? []) {
    if ((f.properties as any).kind !== 'FF.W') continue
    for (const part of String((f.properties as any).where).split(',')) {
      const k = fold(part.replace(/\[PR\]/, ''))
      m.set(k, (m.get(k) ?? 0) + 1)
    }
  }
  return m
}

function iaRank() {
  // FEMA housing aid approved per household: registrations alone are near one per household island-wide
  const ms = [...data.places.value!.municipios].filter(m => m.ia && m.hh).map(m => ({ id: m.id, r: m.ia!.approved / m.hh }))
  ms.sort((a, b) => b.r - a.r)
  return new Map(ms.map((x, i) => [x.id, { rank: i + 1, rate: x.r }]))
}

function outcomeFor(d: Decision, ob: Observed | null, ffw: Map<string, number>, ranks: Map<string, { rank: number; rate: number }>) {
  const es = lang.value === 'es'
  const out: string[] = []
  const tg = d.target
  const mid = tg.type === 'municipio' ? tg.id : tg.muni
  const m = muni(mid)
  if (m) {
    const r = ranks.get(m.id)
    if (r) out.push(es ? `${m.name}: $${num(r.rate)} de ayuda de vivienda de FEMA por hogar (${r.rank}.º de 78)` : `${m.name}: $${num(r.rate)} FEMA housing aid per household (${r.rank} of 78)`)
    const n = ffw.get(fold(m.name)) ?? 0
    out.push(es ? `${n} avisos de inundación repentina` : `${n} flash flood warning${n === 1 ? '' : 's'}`)
  }
  if (tg.type === 'point' || tg.type === 'pin') {
    const inside = (ob?.warnings.features ?? []).filter(f => (f.properties as any).kind === 'FF.W' && inGeometry(tg.lon, tg.lat, f.geometry)).length
    if (inside) out.push(es ? `dentro de ${inside} polígono(s) de aviso de inundación repentina` : `inside ${inside} flash flood warning polygon${inside === 1 ? '' : 's'}`)
  }
  if (ob) {
    let best: { in: number; d: number; name: string } | null = null
    for (const g of ob.rain.gauges) {
      const dk = km(tg.lat, tg.lon, g.lat, g.lon)
      if (!best || dk < best.d) best = { in: g.in, d: dk, name: g.name }
    }
    if (best && best.d < 25) out.push(t('nearRain', { in: num(best.in, 1), km: num(best.d, 0) }))
  }
  return out
}

export function Outcomes() {
  const s = session.value
  const ob = data.observed.value
  const ffw = ffwByMuni(ob)
  const ranks = iaRank()
  const last = s.rounds.length - 1
  const ds = s.decisions.filter(d => stateAt(d, last).active)
  const chosen = new Set(ds.filter(d => d.kind === 'outreach').map(d => d.target.type === 'municipio' ? d.target.id : d.target.muni))
  const missed = [...ranks.entries()].filter(([id]) => !chosen.has(id)).sort((a, b) => a[1].rank - b[1].rank).slice(0, 8)
  const es = lang.value === 'es'
  return (
    <div class="decisions outcomes">
      <div class="dhead"><h2>{t('outcomes')}</h2><p class="note">{t('outcomeNote')}</p></div>
      <div class="scroll dlist">
        {s.tables.map(table => {
          const mine = ds.filter(d => d.table === table.id)
          return (
            <section class="kind">
              <h3><TableDot color={table.color} /> {table.name} <span class="count">{mine.length}</span></h3>
              {mine.length === 0 && <p class="empty">{es ? 'Sin decisiones vigentes.' : 'No standing decisions.'}</p>}
              <ul>
                {mine.map(d => (
                  <li class="drow" style={{ '--tc': table.color } as any}>
                    <div class="dmain">
                      <span class="kgw" title={t(('kind_' + d.kind) as any)}><KindGlyph kind={d.kind} /></span>
                      <button class="dname" onClick={() => { selected.value = d.target; flyTo(d.target) }}><span>{d.target.type === 'point' ? point(d.target.id)?.name ?? d.target.name : d.target.name}</span>
                        <small>{t(('kind_' + d.kind) as any)}{d.history.length > 1 ? `, ${es ? 'revisada' : 'revisited'} ${d.history.length - 1}×` : ''}</small></button>
                    </div>
                    <ul class="dd outcome">{outcomeFor(d, ob, ffw, ranks).map(x => <li>{x}</li>)}</ul>
                  </li>
                ))}
              </ul>
            </section>
          )
        })}
        <section class="kind missed">
          <h3>{t('nobodyChose')}</h3>
          <p class="kq">{t('iaRate')}</p>
          <ol class="rows">
            {missed.map(([id, r]) => {
              const m = muni(id)!
              return <li><button onClick={() => { const tg = { type: 'municipio' as const, id, name: m.name, lon: m.lon, lat: m.lat, muni: id }; selected.value = tg; flyTo(tg) }}>
                <span class="rname">{m.name}</span><span class="rval">${num(r.rate)}</span><span class="rdet">{es ? `${num(m.ia!.reg)} registros, ${usd(m.ia!.approved)} aprobados; ${ffw.get(fold(m.name)) ?? 0} avisos de inundación repentina` : `${num(m.ia!.reg)} registrations, ${usd(m.ia!.approved)} approved; ${ffw.get(fold(m.name)) ?? 0} flash flood warnings`}</span></button></li>
            })}
          </ol>
          <p class="note">{es ? 'OpenFEMA, Asistencia de Vivienda (dueños e inquilinos), DR-4671-PR: ayuda aprobada por hogar (hogares: ACS). Refleja el daño y también el acceso a la ayuda.' : 'OpenFEMA Housing Assistance (owners and renters), DR-4671-PR: aid approved per household (households: ACS). It reflects damage and also access to aid.'}</p>
        </section>
      </div>
    </div>
  )
}
