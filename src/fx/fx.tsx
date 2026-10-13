import { signal } from '@preact/signals'

// Visual feedback: floating "+N" labels, a brief glow, and pulse rings on the map. Everything is skipped when the viewer
// asks for reduced motion (sounds follow the mute switch on their own).

export const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

interface Float { id: number; x: number; y: number; text: string; color: string; big: boolean }
export const floats = signal<Float[]>([])
let fid = 0

/** Show `text` rising from an element (or a point) for a moment. */
export function floatAt(at: Element | { x: number; y: number } | null, text: string, color = '#2F6B3B', big = false) {
  if (!at || reduced()) return
  let x: number, y: number
  if ('getBoundingClientRect' in at) {
    const r = (at as Element).getBoundingClientRect()
    if (!r.width && !r.height) return
    x = r.left + r.width / 2; y = r.top + r.height * 0.35
  } else ({ x, y } = at)
  const f = { id: ++fid, x, y, text, color, big }
  floats.value = [...floats.value, f]
  setTimeout(() => (floats.value = floats.value.filter(v => v.id !== f.id)), big ? 1700 : 1150)
}

export function floatAtSelector(sel: string, text: string, color?: string, big = false) {
  floatAt(document.querySelector(sel), text, color, big)
}

/** Briefly scale an element up and back (CSS class), to show it changed. */
export function bump(sel: string) {
  if (reduced()) return
  document.querySelectorAll(sel).forEach(el => { el.classList.remove('bump'); void (el as HTMLElement).offsetWidth; el.classList.add('bump') })
}

/** A short ring of light around an element: a round complete, the leading table at the reveal. */
export function glow(sel: string) {
  if (reduced()) return
  document.querySelectorAll(sel).forEach(el => { el.classList.remove('glow'); void (el as HTMLElement).offsetWidth; el.classList.add('glow') })
}

// ------------------------------------------------------------------------------------------------- map pulse

export interface Pulse { lon: number; lat: number; color: string; t0: number }
export const mapPulses = signal<Pulse[]>([])
export function pulseMap(lon: number, lat: number, color: string) {
  if (reduced()) return
  mapPulses.value = [...mapPulses.value, { lon, lat, color, t0: performance.now() }]
}

// ------------------------------------------------------------------------------------------------- layer

export function FxLayer() {
  return (
    <div class="fx-floats" aria-hidden="true">
      {floats.value.map(f => <span key={f.id} class={'fx-float' + (f.big ? ' big' : '')} style={{ left: f.x + 'px', top: f.y + 'px', color: f.color }}>{f.text}</span>)}
    </div>
  )
}
