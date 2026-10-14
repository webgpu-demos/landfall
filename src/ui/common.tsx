import type { ComponentChildren } from 'preact'
import { t } from '../i18n'
import { PR_STATUS_COLOR } from '../theme'
import { session } from '../state'
import { data } from '../data'
import { redact } from '../lib/format'

export function StatusChip({ code, size = 'md' }: { code: string | null; size?: 'sm' | 'md' | 'lg' }) {
  const c = code ? PR_STATUS_COLOR[code] : null
  const dark = code === 'HWR' || code === 'TWR'
  return (
    <span class={`status status-${size}`} style={c ? { background: c, color: dark ? '#fff' : '#14213D', borderColor: c } : undefined}>
      {code ? t(code as any) : t('none')}
    </span>
  )
}

export function Src({ href, children }: { href: string; children?: ComponentChildren }) {
  return <a class="src" href={href} target="_blank" rel="noopener">{children ?? t('sourceLink')}</a>
}

/** NHC text with the storm's name swapped for the session codename until the reveal. */
export function useRedact() {
  const s = session.value
  const name = data.scenario.value?.storm.name ?? ''
  const show = s.showName || s.round >= s.rounds.length
  return (txt: string) => redact(txt, name, s.codename || 'X', show)
}

const PROPER = ['Puerto Rico', 'Virgin Islands', 'U.S. Virgin Islands', 'British Virgin Islands', 'Leeward Islands', 'Windward Islands', 'Hispaniola', 'Dominican Republic',
  'Vieques', 'Culebra', 'Turks and Caicos', 'Bahamas', 'Caribbean', 'Guadeloupe', 'Haiti', 'Lesser Antilles', 'Sunday', 'Saturday', 'Monday', 'Friday', 'Thursday', 'Ponce', 'San Juan', 'St. Croix']

/** NHC headlines are all capitals; set them in sentence case for reading at a distance (the verbatim text is one click away). */
export function sentence(s: string) {
  let out = s.toLowerCase().replace(/(^\s*\w)/, m => m.toUpperCase())
  for (const p of PROPER) out = out.replace(new RegExp(p.replace(/\./g, '\\.'), 'gi'), p)
  return out.replace(/\bnhc\b/gi, 'NHC').replace(/\bu\.s\./gi, 'U.S.')
}

export function Tags({ items }: { items: string[] }) {
  return <span class="tags">{items.map(x => <span class="tag">{x}</span>)}</span>
}

export function TableDot({ color, title }: { color: string; title?: string }) {
  return <span class="tdot" style={{ background: color }} title={title} />
}

export function download(blob: Blob, name: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob); a.download = name
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}

/** Speaker icon for the sound switch. */
export function Speaker({ off }: { off: boolean }) {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M3 7.5h3.2L10.5 4v12L6.2 12.5H3z" fill="currentColor" />
      {off ? <path d="M13 7.5l5 5M18 7.5l-5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /> : <><path d="M13 7a4 4 0 0 1 0 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /><path d="M15.5 4.8a7 7 0 0 1 0 10.4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></>}</svg>
  )
}
