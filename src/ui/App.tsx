import { useEffect } from 'preact/hooks'
import { data } from '../data'
import { view, session, activeTable, selected, lens, pinMode, focusMap, bigText, textDrawer, startTimer, pauseTimer, leftTab, isReveal, flash } from '../state'
import { t } from '../i18n'
import { TopBar } from './TopBar'
import { MapView } from '../map/MapView'
import { Brief } from './Brief'
import { Ask } from './Ask'
import { Decisions } from './Decisions'
import { Inspector } from './Inspector'
import { Timeline } from './Timeline'
import { LayerPanel } from './LayerPanel'
import { Legend } from './Legend'
import { TextDrawer } from './TextDrawer'
import { Setup } from './Setup'
import { RevealPanel, Outcomes } from './Reveal'
import { Debrief } from './Debrief'
import { About } from './About'
import { requestAdvance } from './TopBar'
import { RoundCard } from './Game'

export function App() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.metaKey || e.ctrlKey || e.altKey) return
      if (view.value !== 'exercise' && view.value !== 'reveal') return
      if (flash.value != null) return
      const k = e.key
      if (/^[1-6]$/.test(k)) { const tb = session.value.tables[+k - 1]; if (tb) activeTable.value = tb.id }
      else if (k === 'n' || k === 'N') requestAdvance()
      else if (k === 't' || k === 'T') { session.value.timerEnd ? pauseTimer() : startTimer() }
      else if (k === 'p' || k === 'P') pinMode.value = !pinMode.value
      else if (k === 'm' || k === 'M') focusMap.value = !focusMap.value
      else if (k === 'Escape') { if (textDrawer.value) textDrawer.value = null; else if (pinMode.value) pinMode.value = false; else if (selected.value) selected.value = null; else lens.value = null }
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => { document.documentElement.classList.toggle('big', bigText.value) }, [bigText.value])

  if (data.error.value) return <div class="fatal"><p>{t('loadError', { e: data.error.value })}</p></div>
  if (!data.ready.value) return <div class="loading"><div class="loading-mark" /><p>{t('loading')}</p></div>
  ;(globalThis as any).__landfall.ready = true

  const v = view.value
  if (v === 'setup') return <><Setup /><About /></>
  if (v === 'debrief') return <><Debrief /><About /></>
  const reveal = isReveal.value
  return (
    <div class={'shell' + (focusMap.value ? ' focus' : '')}>
      <TopBar />
      <aside class="left">
        {reveal ? <RevealPanel /> : (
          <>
            <div class="tabs" role="tablist">
              <button role="tab" aria-selected={leftTab.value === 'brief'} onClick={() => { leftTab.value = 'brief'; lens.value = null }}>{t('tabBrief')}</button>
              <button role="tab" aria-selected={leftTab.value === 'ask'} onClick={() => (leftTab.value = 'ask')}>{t('tabAsk')}</button>
            </div>
            {leftTab.value === 'brief' ? <Brief /> : <Ask />}
          </>
        )}
      </aside>
      <main class="center">
        <MapView />
        <LayerPanel />
        <Legend />
        <Inspector />
      </main>
      <aside class="right">{reveal ? <Outcomes /> : <Decisions />}</aside>
      <Timeline />
      <TextDrawer />
      <About />
      <RoundCard />
    </div>
  )
}
