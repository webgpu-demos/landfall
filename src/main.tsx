import { render } from 'preact'
import '@fontsource/public-sans/400.css'
import '@fontsource/public-sans/500.css'
import '@fontsource/public-sans/600.css'
import '@fontsource/public-sans/700.css'
import '@fontsource/public-sans/800.css'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
import './styles.css'
import { App } from './ui/App'
import { loadAll, data } from './data'
import * as state from './state'
import { startFx } from './fx/watch'
import * as fx from './fx/fx'
import { Ambience } from './intro/audio'

// test hook: screenshots and checks drive the app through this (no effect on normal use)
;(globalThis as any).__landfall = { ready: false, state, data, fx, Ambience }
loadAll()
startFx()

// Offline: the service worker precaches the app, data, tiles and fonts; the setup page says when that is done.
// Updates never reload the page by themselves (that could happen mid-session): a newer version downloads in the
// background, then the setup page and the Session menu offer to reload into it. It is applied on its own only on the
// opening's title screen, before anything has started. Checked on load, every 20 minutes, and on return to the tab.
import('virtual:pwa-register').then(({ registerSW }) => {
  const update = registerSW({
    immediate: true,
    onNeedRefresh() { state.updateReady.value = true },
    onOfflineReady() { state.offline.value = 'ready' },
    onRegisteredSW(_url, r) {
      state.offline.value = r?.active && navigator.serviceWorker.controller ? 'ready' : 'saving'
      if (!r) return
      const check = () => { if (navigator.onLine) r.update().catch(() => {}) }
      setInterval(check, 20 * 60e3)
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check() })
    },
    onRegisterError() { state.offline.value = 'unavailable' },
  })
  state.updater.apply = () => update(true)
}).catch(() => { state.offline.value = 'unavailable' })
render(<App />, document.getElementById('app')!)
