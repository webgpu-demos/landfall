import { lang } from '../state'

const TZ = 'America/Puerto_Rico' // AST, UTC-4, no daylight saving

function loc() { return lang.value === 'es' ? 'es-PR' : 'en-US' }

/** "Thu 15 Sep, 5:00 PM" / "jue. 15 sept., 5:00 p. m." */
export function when(t: number, opts: { day?: boolean; date?: boolean } = { day: true, date: true }) {
  const d = new Date(t)
  const day = opts.day !== false ? new Intl.DateTimeFormat(loc(), { weekday: 'short', timeZone: TZ }).format(d) : ''
  const date = opts.date !== false ? new Intl.DateTimeFormat(loc(), { day: 'numeric', month: 'short', timeZone: TZ }).format(d) : ''
  const time = new Intl.DateTimeFormat(loc(), { hour: 'numeric', minute: '2-digit', timeZone: TZ }).format(d)
  return [day, date].filter(Boolean).join(' ') + (day || date ? ', ' : '') + time
}

export function dayTime(t: number) {
  const d = new Date(t)
  const day = new Intl.DateTimeFormat(loc(), { weekday: 'short', timeZone: TZ }).format(d)
  const time = new Intl.DateTimeFormat(loc(), { hour: 'numeric', timeZone: TZ }).format(d)
  return `${day} ${time}`
}

export function clock(t: number) {
  return new Intl.DateTimeFormat(loc(), { hour: 'numeric', minute: '2-digit', timeZone: TZ }).format(new Date(t))
}

export function weekdayLong(t: number) {
  return new Intl.DateTimeFormat(loc(), { weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ }).format(new Date(t))
}

export const mph = (kt: number) => Math.round(kt * 1.15078 / 5) * 5
export const kmh = (kt: number) => Math.round(kt * 1.852 / 5) * 5

export function num(n: number | null | undefined, digits = 0) {
  if (n == null || Number.isNaN(n)) return '–'
  return new Intl.NumberFormat(loc(), { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(n)
}

export function pct(n: number | null | undefined, digits = 0) {
  if (n == null) return '–'
  return num(n, digits) + ' %'
}

export function usd(n: number | null | undefined) {
  if (n == null) return '–'
  if (n >= 1e9) return '$' + num(n / 1e9, 1) + (lang.value === 'es' ? ' mil M' : ' B')
  if (n >= 1e6) return '$' + num(n / 1e6, 1) + ' M'
  return '$' + num(n)
}

const NEXT: Record<number, number> = { 0: 5, 5: 10, 10: 20, 20: 30, 30: 40, 40: 50, 50: 60, 60: 70, 70: 80, 80: 90, 90: 100 }

/** NHC band lower bound -> "40–50 %", "under 5 %", "over 90 %". */
export function band(lo: number) {
  if (lo <= 0) return lang.value === 'es' ? 'menos de 5 %' : 'under 5 %'
  if (lo >= 90) return lang.value === 'es' ? 'más de 90 %' : 'over 90 %'
  return `${lo}–${NEXT[lo]} %`
}

export function hoursLeft(h: number) {
  if (h < 0) return lang.value === 'es' ? 'no en 72 h' : 'not within 72 h'
  if (h === 0) return lang.value === 'es' ? 'ya' : 'now'
  return lang.value === 'es' ? `en ${h} h` : `in ${h} h`
}

/** Replace the storm's name in NHC text with the session's codename, preserving the text's own casing. */
export function redact(s: string, name: string, codename: string, show: boolean) {
  if (show || !s) return s
  return s.replace(new RegExp(`\\b${name}(?:'s)?\\b`, 'gi'), m => {
    const poss = /'s$/i.test(m)
    const base = poss ? m.slice(0, -2) : m
    let out = codename
    if (base === base.toUpperCase()) out = codename.toUpperCase()
    else if (base[0] === base[0].toUpperCase()) out = codename[0].toUpperCase() + codename.slice(1)
    return out + (poss ? (m.endsWith("'S") ? "'S" : "'s") : '')
  })
}
