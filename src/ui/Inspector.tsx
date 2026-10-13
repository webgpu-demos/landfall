import { selected, activeTable, session, addDecision, activeDecisions, tableById, advNum, isReveal, editDecision, removeDecision } from '../state'
import { REASONS } from './Decisions'
import { muni, tract, point, data } from '../data'
import { t } from '../i18n'
import { band, num, pct, hoursLeft, dayTime } from '../lib/format'
import { windAt } from '../lib/conditions'
import { tractName, kindName, flags } from '../lib/lens'
import { TableDot, Src } from './common'
import type { DecisionKind, Target } from '../types'

function allowed(tg: Target): DecisionKind[] {
  if (tg.type === 'municipio') return ['outreach', 'staging']
  if (tg.type === 'tract') return ['outreach']
  if (tg.type === 'pin') return ['staging']
  const k = tg.kind
  if (k === 'airport' || k === 'seaport' || k === 'venue') return ['staging', 'closer']
  if (k === 'housing') return ['outreach', 'closer']
  return ['closer']
}

export function Inspector() {
  const tg = selected.value
  if (!tg) return null
  const n = advNum.value
  const w = windAt(tg, n)
  const adv = data.scenario.value!.advisories.find(a => a.num === n)!
  const here = activeDecisions.value.filter(d => d.target.id === tg.id)
  const tb = tableById.value
  const act = tb[activeTable.value]
  const reveal = isReveal.value
  const m = muni(tg.muni ?? (tg.type === 'municipio' ? tg.id : null))

  let title = tg.name, sub = ''
  if (tg.type === 'municipio') sub = t('municipio')
  if (tg.type === 'tract') { const x = tract(tg.id); title = x ? tractName(x) : tg.name; sub = t('tract') }
  if (tg.type === 'point') { const p = point(tg.id); sub = p ? (p.kind === 'housing' ? (p.htype === 'public' ? t('k_public') : t('k_housing')) : kindName(p.kind)) + (m ? `, ${m.name}` : '') : '' }
  if (tg.type === 'pin') sub = `${tg.lat.toFixed(4)}°N ${Math.abs(tg.lon).toFixed(4)}°W`

  return (
    <div class="inspector" role="dialog" aria-label={title}>
      <header>
        <div><h2>{title}</h2><p class="sub">{sub}</p></div>
        <button class="ghost x" onClick={() => (selected.value = null)} aria-label={t('close')}>×</button>
      </header>

      {w && !reveal && (
        <div class="wind-now">
          <p class="lbl">{tg.type === 'municipio' ? t('windHereMuni') : t('windHere')}<span class="derived" title={data.places.value?.derived.p}>NHC 5 km</span></p>
          <div class="bands">
            <span><small>{t('ts')}</small><b>{band(w.p34)}</b></span>
            <span><small>{t('dmg')}</small><b>{band(w.p50)}</b></span>
            <span><small>{t('hu')}</small><b>{band(w.p64)}</b></span>
          </div>
          <p class="arr">{t('arrivesHere')}: <b>{w.a34 >= 0 ? `${hoursLeft(w.a34)}, ${dayTime(adv.issued + w.a34 * 3600e3)} AST` : hoursLeft(-1)}</b></p>
        </div>
      )}

      <div class="facts-grid">
        {tg.type === 'municipio' && m && <MuniFacts id={m.id} />}
        {tg.type === 'tract' && <TractFacts id={tg.id} />}
        {tg.type === 'point' && <PointFacts id={tg.id} />}
        {tg.type === 'pin' && m && <p>{t('municipio')}: <b>{m.name}</b></p>}
      </div>

      {here.length > 0 && (
        <div class="here">
          <p class="lbl">{t('already')}</p>
          <ul>{here.map(d => {
            const fresh = d.history.length === 1 && d.history[0].round === session.value.round
            return (
              <li class={fresh ? 'fresh' : ''}>
                <span class="here-line"><TableDot color={tb[d.table]?.color ?? '#999'} /> <b>{tb[d.table]?.name}</b>: {t(('kind_' + d.kind) as any)}
                  {fresh && <button class="link danger" onClick={() => removeDecision(d.id)}>{t('remove')}</button>}</span>
                {fresh && !reveal && (
                  <div class="reasons inline" aria-label={t('why')}>
                    <span class="why">{t('why')}</span>
                    {REASONS.map(r => (
                      <button aria-pressed={d.reasons.includes(r)} onClick={() => editDecision(d.id, x => { x.reasons = x.reasons.includes(r) ? x.reasons.filter(y => y !== r) : [...x.reasons, r] })}>{t(('r_' + r) as any)}</button>
                    ))}
                  </div>
                )}
              </li>
            )
          })}</ul>
        </div>
      )}

      {!reveal && act && (
        <div class="add">
          <p class="lbl"><TableDot color={act.color} /> {t('forTable', { t: act.name })}</p>
          <div class="btnrow">
            {allowed(tg).map(k => (
              <button class="add-btn" style={{ '--tc': act.color } as any} onClick={() => { addDecision(k, tg); }}>
                + {t(('add_' + k) as any)}
              </button>
            ))}
          </div>
          {session.value.tables.length > 1 && (
            <div class="table-pick" role="group" aria-label={t('table')}>
              {session.value.tables.map((x, i) => (
                <button aria-pressed={x.id === activeTable.value} title={x.name} style={{ '--tc': x.color } as any} onClick={() => (activeTable.value = x.id)}>{i + 1}</button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Row({ k, v, note }: { k: string; v: any; note?: string }) {
  return <div class="fr"><span class="k">{k}</span><span class="v">{v}{note && <small> {note}</small>}</span></div>
}

function MuniFacts({ id }: { id: string }) {
  const m = muni(id)!
  return (
    <>
      <Row k={t('population')} v={num(m.pop)} />
      <Row k={t('svi')} v={t('sviPct', { p: Math.round(m.svi * 100) })} />
      <Row k={t('age65')} v={pct(m.age65)} />
      <Row k={t('disab')} v={pct(m.disab)} />
      <Row k={t('noveh')} v={pct(m.noveh)} />
      {m.empower && <Row k={t('dme')} v={num(m.empower.dme)} />}
      <Row k={t('buildings')} v={num(m.bld)} />
      <Row k={'  ' + t('bldSfha')} v={num(m.bldSfha)} />
      <Row k={'  ' + t('bldSlide')} v={num(m.slideHigh25)} />
      {m.surge1 > 0 && <Row k={'  ' + t('bldSurge')} v={num(m.surge1)} />}
      {m.roads && <Row k={t('access')} v={<>{t('roadKm', { k: num(m.roads.kmSlide, 0) })}<br />{t('bridgesSlide', { n: m.roads.bridgesSlide })}; {t('bridgesFlood', { n: m.roads.bridgesSfha })}</>} />}
    </>
  )
}

function TractFacts({ id }: { id: string }) {
  const x = tract(id)!
  return (
    <>
      <Row k={t('population')} v={num(x.pop)} />
      {x.svi != null && <Row k={t('svi')} v={t('sviPct', { p: Math.round(x.svi * 100) })} />}
      <Row k={t('age65')} v={pct(x.age65)} />
      <Row k={t('disab')} v={pct(x.disab)} />
      <Row k={t('noveh')} v={pct(x.noveh)} />
      <Row k={t('pov')} v={pct(x.pov)} />
    </>
  )
}

function PointFacts({ id }: { id: string }) {
  const p = point(id)!
  const f = flags(p)
  return (
    <>
      {p.kind === 'shelter' && <p class="note">{t('listed2026')}{p.addr ? `. ${p.addr}` : ''}</p>}
      {p.kind === 'housing' && <Row k={p.htype === 'public' ? t('k_public') : t('k_housing')} v={[p.units && t('units', { n: num(p.units) }), p.residents && t('residents', { n: num(p.residents) }), p.elderly != null && t('elderly', { p: num(p.elderly) }), p.disabled != null && t('disabled', { p: num(p.disabled) })].filter(Boolean).join('; ')} />}
      <Row k={t('floodZone')} v={p.flood ?? '–'} />
      <Row k={t('slide')} v={p.slide ?? '–'} note={p.slide25 && p.slide25 !== p.slide ? `(${p.slide25} ${t('slide25')})` : undefined} />
      {p.elev != null && <Row k={t('elev')} v={`${num(p.elev, 1)} m`} />}
      <Row k={t('surge')} v={p.surge ? t('surgeCat', { c: p.surge }) : t('surgeNone')} />
      {f.length > 0 && <p class="flags">{f.map(x => <span class="flag">{x}</span>)}</p>}
      {p.osm && <p class="note"><Src href={p.osm}>OpenStreetMap</Src></p>}
    </>
  )
}
