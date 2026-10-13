import { textDrawer, advisory } from '../state'
import { t } from '../i18n'
import { useRedact, Src } from './common'

// NHC and NWS products exactly as issued (teletype text, monospaced), with the storm's name masked until the reveal.

export function TextDrawer() {
  const k = textDrawer.value
  const a = advisory.value
  const R = useRedact()
  if (!k || !a) return null
  const text = k === 'hls' ? a.hls?.text ?? '' : a.texts[k]
  const href = k === 'public' ? a.source.public : k === 'discussion' ? a.source.discussion : k === 'probabilities' ? a.source.probabilities : null
  const title = k === 'hls' ? t('hls') : t(k)
  return (
    <div class="drawer-scrim" onClick={(e) => { if (e.target === e.currentTarget) textDrawer.value = null }}>
      <section class="drawer" role="dialog" aria-label={title}>
        <header>
          <h2>{title}</h2>
          <span class="drawer-src">{href ? <Src href={href}>nhc.noaa.gov</Src> : a.hls?.source}</span>
          <button class="ghost x" onClick={() => (textDrawer.value = null)} aria-label={t('close')}>×</button>
        </header>
        <pre class="teletype">{R(text)}</pre>
      </section>
    </div>
  )
}
