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
