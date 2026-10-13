import { useEffect, useRef, useState } from 'preact/hooks'
import { signal, effect } from '@preact/signals'
import { play, muted } from '../fx/sound'
import { session, advisory, isReveal, advance, startTimer, pauseTimer, resetTimer, lang, bigText, view, exportSession, importSession, resetSession, focusMap, peek, pendingReview, about, armed, flash } from '../state'
import { data } from '../data'
import { t } from '../i18n'
import { when } from '../lib/format'
import { prStatus } from '../lib/conditions'
import { StatusChip, download } from './common'

const now = signal(Date.now())
setInterval(() => (now.value = Date.now()), 250)

// the last ten seconds of a running timer count down out loud, and time's up buzzes once
let lastSec = -1
effect(() => {
  const s = session.value
  if (!s.timerEnd) { lastSec = -1; return }
  const left = Math.ceil((s.timerEnd - now.value) / 1000)
  if (left === lastSec) return
  lastSec = left
  if (left > 0 && left <= 10) play('countdown')
  if (left === 0) play('timeup')
})

let armTimer: ReturnType<typeof setTimeout> | undefined
/** Two taps release the next advisory: the first arms the button for four seconds, the second releases. */
export function requestAdvance() {
  const s = session.value
  if (s.round >= s.rounds.length) { view.value = 'debrief'; return }
  if (flash.value != null) return
  if (!armed.value) {
    armed.value = true
    clearTimeout(armTimer); armTimer = setTimeout(() => (armed.value = false), 4000)
    return
  }
  clearTimeout(armTimer)
  advance()
}

export function TopBar() {
  const s = session.value
  const a = advisory.value
  const reveal = isReveal.value
  const [menu, setMenu] = useState(false)
  const file = useRef<HTMLInputElement>(null)
  const left = s.timerEnd ? Math.max(0, s.timerEnd - now.value) : s.timerLeft ?? s.timerMin * 60000
  const running = !!s.timerEnd
  const up = running && left === 0
  const mm = Math.floor(left / 60000), ss = Math.floor((left % 60000) / 1000)
  useEffect(() => {
    if (!menu) return
    const off = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest('.menu')) setMenu(false) }
    addEventListener('click', off)
    return () => removeEventListener('click', off)
  }, [menu])

  return (
    <header class="top">
      <div class="brand">
        <span class="brand-mark" aria-hidden="true" />
        <span class="brand-name">{s.title}</span>
      </div>
      <div class="when">
        {reveal ? <span class="round-label">{t('reveal')}</span> : (
          <>
            <span class="round-label">{t('round', { n: s.round + 1, m: s.rounds.length })}</span>
            {a && <span class="clock">{when(a.issued)} <small>AST</small></span>}
            {a && <span class="adv-num">{t('advisory', { n: a.num })}</span>}
            {peek.value != null && <button class="peek-back" onClick={() => (peek.value = null)}>{t('backToNow')}</button>}
          </>
        )}
      </div>
      {!reveal && a && <div class="pr-status"><StatusChip code={prStatus(a)} size="lg" /><span class="for-pr">{t('forPR')}</span></div>}
      <div class="controls">
        {!reveal && (
          <div class={'timer' + (up ? ' up' : '') + (running ? ' running' : '') + (running && left > 0 && left <= 10000 ? ' last' : '')}>
            <span class="timer-val" aria-live="off">{up ? t('timeUp') : `${mm}:${String(ss).padStart(2, '0')}`}</span>
            <button class="ghost" onClick={() => running ? pauseTimer() : startTimer()} aria-label={running ? t('timerPause') : t('timerStart')}>
              {running ? <svg viewBox="0 0 16 16" width="14" height="14"><rect x="3" y="2" width="3.5" height="12" fill="currentColor" /><rect x="9.5" y="2" width="3.5" height="12" fill="currentColor" /></svg>
                : <svg viewBox="0 0 16 16" width="14" height="14"><path d="M4 2l10 6-10 6z" fill="currentColor" /></svg>}
            </button>
            {(running || s.timerLeft != null) && <button class="ghost" onClick={resetTimer} aria-label={t('timerReset')}>
              <svg viewBox="0 0 16 16" width="14" height="14"><path d="M8 3a5 5 0 1 1-4.6 3" fill="none" stroke="currentColor" stroke-width="1.8" /><path d="M2 2v4.4h4.4" fill="none" stroke="currentColor" stroke-width="1.8" /></svg>
            </button>}
          </div>
        )}
        {!reveal && (
          <button class={'primary next' + (armed.value ? ' armed' : '')} onClick={requestAdvance} disabled={peek.value != null}>
            {armed.value ? (s.round === s.rounds.length - 1 ? t('revealSure') : t('releaseSure')) : s.round === s.rounds.length - 1 ? t('toReveal') : t('release', { n: s.rounds[s.round + 1] })}
            {pendingReview.value.length > 0 && <span class="badge" title={t('review', { n: pendingReview.value.length })}>{pendingReview.value.length}</span>}
          </button>
        )}
        {reveal && <button class="primary" onClick={() => (view.value = 'debrief')}>{t('toDebrief')}</button>}
        <button class="ghost sound" aria-pressed={!muted.value} title={muted.value ? t('soundOff') : t('soundOn')} aria-label={muted.value ? t('soundOff') : t('soundOn')} onClick={() => { muted.value = !muted.value; if (!muted.value) play('coin') }}>
          <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M3 7.5h3.2L10.5 4v12L6.2 12.5H3z" fill="currentColor" />
            {muted.value ? <path d="M13 7.5l5 5M18 7.5l-5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /> : <><path d="M13 7a4 4 0 0 1 0 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /><path d="M15.5 4.8a7 7 0 0 1 0 10.4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></>}</svg>
        </button>
        <div class="menu">
          <button class="ghost menu-btn" aria-expanded={menu} onClick={(e) => { e.stopPropagation(); setMenu(!menu) }}>{t('menu')}</button>
          {menu && (
            <div class="menu-pop" role="menu">
              <div class="seg" role="group" aria-label="Language">
                <button aria-pressed={lang.value === 'en'} onClick={() => (lang.value = 'en')}>English</button>
                <button aria-pressed={lang.value === 'es'} onClick={() => (lang.value = 'es')}>Español</button>
              </div>
              <label class="check"><input type="checkbox" checked={bigText.value} onChange={(e) => (bigText.value = (e.target as HTMLInputElement).checked)} /> {t('bigText')}</label>
              <label class="check"><input type="checkbox" checked={focusMap.value} onChange={(e) => (focusMap.value = (e.target as HTMLInputElement).checked)} /> {t('mapOnly')}</label>
              <hr />
              <button onClick={() => { setMenu(false); view.value = 'setup' }}>{t('setup')}</button>
              <button onClick={() => { setMenu(false); view.value = 'debrief' }}>{t('debrief')}</button>
              <button onClick={() => download(exportSession(), `landfall-session-${new Date().toISOString().slice(0, 16).replace(':', '')}.json`)}>{t('exportFile')}</button>
              <button onClick={() => file.current?.click()}>{t('importFile')}</button>
              <button onClick={() => { if (confirm(t('confirmNew'))) { setMenu(false); resetSession() } }}>{t('newSessionBtn')}</button>
              <button onClick={() => { setMenu(false); about.value = true }}>{t('about')}</button>
              <hr />
              <p class="menu-note">{t('shortcuts')}</p>
              <p class="menu-note">{data.scenario.value && `NHC ${data.scenario.value.storm.id}`}{data.garita.value && `; Garita ${data.garita.value.seedVersion}`}</p>
              <input ref={file} type="file" accept="application/json,.json" hidden onChange={async (e) => {
                const f = (e.target as HTMLInputElement).files?.[0]
                if (f) { try { await importSession(f); setMenu(false) } catch (err) { alert(String(err)) } }
              }} />
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
