import { render } from 'preact'
import '@fontsource/public-sans/400.css'
import '@fontsource/public-sans/500.css'
import '@fontsource/public-sans/600.css'
import '@fontsource/public-sans/700.css'
import '@fontsource/public-sans/800.css'
import '@fontsource/ibm-plex-mono/400.css'
import './styles.css'
import { App } from './ui/App'
import { loadAll, data } from './data'
import * as state from './state'

// test hook: screenshots and checks drive the app through this (no effect on normal use)
;(globalThis as any).__landfall = { ready: false, state, data }
loadAll()
render(<App />, document.getElementById('app')!)
