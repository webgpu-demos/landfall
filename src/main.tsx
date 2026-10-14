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

// test hook: screenshots and checks drive the app through this (no effect on normal use)
;(globalThis as any).__landfall = { ready: false, state, data, fx }
loadAll()
startFx()

// offline: the service worker precaches the app, data, tiles and fonts; the setup page says when that is done
import('virtual:pwa-register').then(({ registerSW }) => registerSW({
  immediate: true,
  onOfflineReady() { state.offline.value = 'ready' },
  onRegisteredSW(_url, r) { state.offline.value = r?.active && navigator.serviceWorker.controller ? 'ready' : 'saving' },
  onRegisterError() { state.offline.value = 'unavailable' },
})).catch(() => { state.offline.value = 'unavailable' })
render(<App />, document.getElementById('app')!)
