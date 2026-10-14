import { useEffect, useRef, useState } from 'preact/hooks'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { data, loadAdv } from '../data'
import { lang, introOn, updateReady, updater } from '../state'
import { t } from '../i18n'
import { num, mph, when, dayTime } from '../lib/format'
import { muted } from '../fx/sound'
import { reduced } from '../fx/fx'
import { SatLoop, type SatMeta } from './sat'
import { Director, TITLE_AT, END, TERRAIN_AT } from './director'
import { Ambience } from './audio'
import type { BestTrack } from '../types'
import { Speaker } from '../ui/common'

// The opening: about a minute, before the session is set up. Real GOES-16 infrared imagery of the storm forming, the
// best track up to the first round, the first advisory's cone reaching Puerto Rico, then down onto the island in 3D
// with what is at stake there today. The storm is never named and nothing after the first round is shown, so the
// reveal at the end of the session still lands.

const BASE = location.href.replace(/[?#].*$/, '').replace(/[^/]*$/, '')
const FIRST_ADV = 6

interface Beat { t0: number; t1: number; eyebrow: () => string; head: () => string; sub?: () => string }

const ast = (ms: number) => `${when(ms)} AST`

export function Intro() {
  const box = useRef<HTMLDivElement>(null)
  const clockEl = useRef<HTMLSpanElement>(null)
  const barEl = useRef<HTMLDivElement>(null)
  const dir = useRef<Director | null>(null)
  const amb = useRef(new Ambience())
  const T = useRef({ t: 0, playing: false, last: 0, beat: -1, resolved: false, swell: 0, late: false, clockMin: -1 })
  const idle = useRef(-43)
  const warming = useRef(true)
  const [phase, setPhase] = useState<'title' | 'play'>('title')
  const [ready, setReady] = useState(false)
  const [beat, setBeat] = useState(-1)
  const [paused, setPaused] = useState(false)
  const [late, setLate] = useState(false)       // over Puerto Rico: other credits, no satellite clock
  const [ending, setEnding] = useState(false)   // the title card
  const [leaving, setLeaving] = useState(false)
  const still = reduced()

  const P = data.places.value!
  const S = data.scenario.value!
  const adv = S.advisories.find(a => a.num === FIRST_ADV)!
  const best = useRef<BestTrack | null>(null)

  const beats: Beat[] = [
    { t0: 0.8, t1: 7.6, eyebrow: () => t('introAtlantic'), head: () => t('intro0'), sub: () => t('intro0s') },
    { t0: 8.3, t1: 15.0, eyebrow: () => ast(best.current?.points[0].t ?? 0), head: () => t('intro1'), sub: () => t('intro1s', { w: mph(best.current?.points[0].wind_kt ?? 25) }) },
    { t0: 15.3, t1: 22.6, eyebrow: () => ast(best.current?.points.find(p => p.status === 'TS')?.t ?? 0), head: () => t('intro2'), sub: () => t('intro2s') },
    { t0: 23.0, t1: 30.4, eyebrow: () => t('introAtlantic'), head: () => t('intro3'), sub: () => t('intro3s') },
    { t0: 31.0, t1: 38.4, eyebrow: () => `${t('introAdv', { n: FIRST_ADV })} · ${ast(adv.issued)}`, head: () => t('intro4'), sub: () => t('intro4s', { w: mph(adv.wind_kt) }) },
    { t0: 43.0, t1: 47.0, eyebrow: () => t('introToday'), head: () => t('intro5', { n: num(P.municipios.reduce((a, m) => a + (m.pop ?? 0), 0) / 1e6, 2), m: P.municipios.length }) },
    { t0: 47.0, t1: 51.4, eyebrow: () => t('introToday'), head: () => t('intro6', { s: num(P.points.filter(p => p.kind === 'shelter').length), h: num(P.points.filter(p => p.kind === 'hospital').length) }), sub: () => t('intro6s') },
    { t0: 51.4, t1: 55.4, eyebrow: () => t('introToday'), head: () => t('intro7', { n: num(P.municipios.reduce((a, m) => a + (m.empower?.dme ?? 0), 0)) }), sub: () => t('intro7s') },
    { t0: 55.4, t1: 60.2, eyebrow: () => t('introToday'), head: () => t('intro8', { n: num(P.municipios.reduce((a, m) => a + ((m as any).roads?.kmSlide ?? 0), 0)) }), sub: () => t('intro8s') },
  ]
  const beatAt = (x: number) => beats.findIndex(b => x >= b.t0 && x < b.t1)

  // ---------------------------------------------------------------------------------------- map and assets
  useEffect(() => {
    let alive = true
    const map = new maplibregl.Map({
      container: box.current!,
      style: { version: 8, projection: { type: ['interpolate', ['linear'], ['zoom'], 6, 'vertical-perspective', 7.5, 'mercator'] }, glyphs: BASE + 'glyphs/{fontstack}/{range}.pbf', sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#0A1422' } }] } as any,
      center: [-43, 13], zoom: 2, interactive: false, attributionControl: false, maxPitch: 70, fadeDuration: 0,
      // keep the warmed-up tiles for the descent while the globe shots play
      maxTileCacheSize: 600,
    })
    ;(window as any).__introMap = map
    const ro = new ResizeObserver(() => { map.resize(); dir.current?.resize() })
    ro.observe(box.current!)
    const j = (p: string) => fetch(p).then(r => { if (!r.ok) throw new Error(p); return r.json() })
    const assets = Promise.all([
      j('data/intro/intro.json') as Promise<SatMeta>, j('data/intro/world.json'),
      data.bestTrack.value ? Promise.resolve(data.bestTrack.value) : j('data/geo/besttrack.json'),
      loadAdv(FIRST_ADV),
    ])
    const loaded = new Promise<void>(r => map.once('load', () => r()))
    Promise.all([assets, loaded]).then(async ([[meta, world, bt, advGeo]]) => {
      if (!alive) return
      best.current = bt
      const sat = new SatLoop(meta, BASE + 'data/intro/sat/')
      const d = new Director(map, {
        sat, world, land: data.land.value!, municipios: data.municipios.value!, places: P, best: bt, adv: advGeo, t0: adv.issued,
        roads: data.roads.value ? Promise.resolve(data.roads.value) : j('data/geo/roads.json').catch(() => null),
      })
      d.build()
      dir.current = d
      await Promise.all([sat.ready, d.d.roads])
      if (!alive) return
      // Warm-up, out of sight: visit the descent and the shots over Puerto Rico once so their elevation, relief and
      // map tiles are loaded and cached before the opening plays (otherwise they load mid-flight and the dive stutters).
      // At most ~8 s in all; on a slow machine whatever is left loads during the opening, as before.
      const budget = performance.now() + 8000
      const settle = () => new Promise<void>(r => { const t0 = performance.now(); const check = () => !alive || performance.now() - t0 > 1500 || performance.now() > budget || (map.areTilesLoaded() && map.loaded()) ? r() : setTimeout(check, 100); setTimeout(check, 150) })
      for (const x of [36.5, 38.5, 40, 41.5, 43, 45, 52, 58]) { if (performance.now() > budget) break; render(x); await settle(); if (!alive) return }
      warming.current = false
      render(2.8, idle.current)
      setReady(true)
    }).catch(e => { console.error('intro', e); if (alive) finish() })
    return () => { alive = false; ro.disconnect(); amb.current.stop(0.4); map.remove(); dir.current = null }
  }, [])

  // ---------------------------------------------------------------------------------------- the clock
  const labels = { td: '', ts: '', mph, when: dayTime }
  const render = (x: number, idleLon?: number) => {
    const d = dir.current
    if (!d) return
    labels.td = t('introTD'); labels.ts = t('introTS')
    const f = d.apply(x, labels, still, idleLon != null ? { center: [idleLon, 12], zoom: d.camera(0).zoom, pitch: 0, bearing: 0 } : undefined)
    const minute = Math.floor(f.clock / 60000)
    if (clockEl.current && minute !== T.current.clockMin) { T.current.clockMin = minute; clockEl.current.textContent = ast(f.clock) }
    if (barEl.current) barEl.current.style.transform = `scaleX(${Math.min(1, x / TITLE_AT)})`
  }

  useEffect(() => {
    let raf = 0
    const t0 = performance.now()
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick)
      const s = T.current
      if (warming.current) return
      if (phase === 'title') { if (dir.current && !still) { idle.current = -43 + 8 * Math.sin((now - t0) / 14000); render(2.8, idle.current) } return }
      const dt = Math.min(0.1, (now - (s.last || now)) / 1000); s.last = now
      if (s.playing) s.t = Math.min(END, s.t + dt)
      render(s.t)
      const b = beatAt(s.t)
      if (b !== s.beat) { s.beat = b; setBeat(b); if (b >= 0 && s.playing) amb.current.accent(b >= 5) }
      const late = s.t >= TERRAIN_AT + 2
      if (late !== s.late) { s.late = late; setLate(late) }
      if (s.t >= 31 && s.swell < 1) { s.swell = 1; amb.current.swell(0.45) }
      if (s.t >= 38 && s.swell < 2) { s.swell = 2; amb.current.swell(1, 2.5) }
      if (s.t >= 44 && s.swell < 3) { s.swell = 3; amb.current.swell(0.3, 4) }
      if (s.t >= TITLE_AT && !s.resolved) { s.resolved = true; setEnding(true); amb.current.resolve() }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [phase])

  const begin = () => {
    if (!ready) return
    T.current = { t: 0, playing: true, last: 0, beat: -1, resolved: false, swell: 0, late: false, clockMin: -1 }
    setEnding(false); setPaused(false); setBeat(-1)
    amb.current.stop(0.2); amb.current = new Ambience(); amb.current.start()
    if (dir.current) dir.current.lonOffset = phase === 'title' ? idle.current + 43 : 0
    setPhase('play')
  }
  const togglePause = () => { const s = T.current; s.playing = !s.playing; s.last = 0; setPaused(!s.playing) }
  const finish = () => {
    amb.current.stop(0.8)
    setLeaving(true)
    setTimeout(() => (introOn.value = false), still ? 0 : 650)
  }
  const nextBeat = () => { const s = T.current; const n = beats.find(b => b.t0 > s.t + 0.05); s.t = n ? n.t0 - 0.2 : TITLE_AT }

  // a newer version downloaded while the title is up: take it now, nothing has started
  useEffect(() => { if (updateReady.value && phase === 'title') updater.apply() }, [updateReady.value, phase])

  // keys
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); finish() }
      else if (phase === 'title' && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); begin() }
      else if (phase === 'play' && e.key === ' ') { e.preventDefault(); if (T.current.t < END) togglePause() }
      else if (phase === 'play' && e.key === 'ArrowRight') nextBeat()
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [phase, ready])

  // test and review hook: jump to any moment, paused
  useEffect(() => {
    ;(globalThis as any).__intro = {
      seek: (x: number) => { setPhase('play'); const s = T.current; s.t = x; s.playing = false; s.resolved = x >= TITLE_AT; setEnding(x >= TITLE_AT); render(x) },
      get t() { return T.current.t }, get ready() { return !!dir.current && ready },
    }
  }, [ready])

  const b = beat >= 0 ? beats[beat] : null
  return (
    <div class={'opening' + (leaving ? ' leaving' : '') + (phase === 'title' ? ' at-title' : '')}>
      <div ref={box} class={'intro-map' + (ready ? ' shown' : '')} aria-hidden="true" />
      <div class="intro-vignette" />
      <div class="intro-scrim" />

      {phase === 'title' && (
        <div class="intro-title start">
          <div class="seg intro-lang" role="group" aria-label="Language">
            <button aria-pressed={lang.value === 'en'} onClick={() => (lang.value = 'en')}>English</button>
            <button aria-pressed={lang.value === 'es'} onClick={() => (lang.value = 'es')}>Español</button>
          </div>
          <h1>{t('appTitle')}</h1>
          <p class="intro-sub">{t('appSub')}</p>
          <div class="intro-actions">
            <button class="primary big intro-go" disabled={!ready} onClick={begin}>{ready ? t('introBegin') : t('introLoading')}</button>
            <button class="link intro-skip-setup" onClick={finish}>{t('introSkipSetup')}</button>
          </div>
          <p class="intro-note">
            <button class="ghost sound-toggle" aria-pressed={!muted.value} onClick={() => (muted.value = !muted.value)}><Speaker off={muted.value} /> {muted.value ? t('soundOff') : t('soundOn')}</button>
          </p>
        </div>
      )}

      {phase === 'play' && (
        <>
          {!late && (
            <div class="intro-hud">
              <span class="hud-src"><i class="live" /><span>{t('introSat')}</span></span>
              <span ref={clockEl} class="hud-clock" />
            </div>
          )}
          {b && !ending && (
            <div class="intro-cap" key={beat + lang.value}>
              <p class="cap-eyebrow">{b.eyebrow()}</p>
              <h2>{b.head()}</h2>
              {b.sub && <p class="cap-sub">{b.sub()}</p>}
            </div>
          )}
          {ending && (
            <div class="intro-title end">
              <h1>{t('appTitle')}</h1>
              <p class="intro-sub">{t('introTag')}</p>
              <div class="intro-actions">
                <button class="primary big intro-go" onClick={finish} autoFocus>{t('introSetUp')}</button>
                <button class="link intro-replay" onClick={begin}>{t('introReplay')}</button>
              </div>
            </div>
          )}
          <div class="intro-ctl">
            {!ending && <span class="intro-keys">{t('introHint')}</span>}
            <button class="ghost sound" aria-pressed={!muted.value} onClick={() => (muted.value = !muted.value)} title={muted.value ? t('soundOff') : t('soundOn')} aria-label={muted.value ? t('soundOff') : t('soundOn')}><Speaker off={muted.value} /></button>
            {!ending && <button class="ghost" onClick={togglePause}>{paused ? t('introResume') : t('introPause')}</button>}
            {!ending && <button class="ghost intro-skip" onClick={finish}>{t('introSkip')} ›</button>}
          </div>
          <p class="intro-cred">{late ? t('introCredPR') : t('introCredSat')}</p>
          <div class="intro-bar"><div ref={barEl} /></div>
        </>
      )}
    </div>
  )
}
