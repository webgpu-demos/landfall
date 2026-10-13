import { useEffect, useRef } from 'preact/hooks'
import { signal } from '@preact/signals'

// Visual rewards: floating "+N" labels, confetti, and pulse rings on the map. Everything is skipped when the viewer
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

// ------------------------------------------------------------------------------------------------- confetti

interface Bit { x: number; y: number; vx: number; vy: number; r: number; vr: number; w: number; h: number; c: string; life: number }
let bits: Bit[] = []
let raf = 0
let canvas: HTMLCanvasElement | null = null

export function confetti(x: number, y: number, colors: string[] = ['#E8112D', '#F2C500', '#2563C9', '#0E7C86', '#6B4FBB', '#D9730D', '#4E8A1E'], n = 90, spread = 1) {
  if (reduced() || !canvas) return
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.9 * spread
    const v = 7 + Math.random() * 9
    bits.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4,
      w: 6 + Math.random() * 6, h: 3 + Math.random() * 4, c: colors[i % colors.length], life: 1 })
  }
  if (!raf) raf = requestAnimationFrame(step)
}

export function confettiAt(sel: string, colors?: string[], n?: number) {
  const el = document.querySelector(sel)
  if (!el) return
  const r = el.getBoundingClientRect()
  confetti(r.left + r.width / 2, r.top + r.height / 2, colors, n)
}

let lastT = 0
function step(now: number) {
  const c = canvas
  if (!c) { raf = 0; lastT = 0; return }
  // time-based, so a slow projector laptop shows the same ~2 s burst rather than a long drizzle
  const k = lastT ? Math.min(4, (now - lastT) / 16.7) : 1
  lastT = now
  const g = c.getContext('2d')!
  if (c.width !== innerWidth * devicePixelRatio) { c.width = innerWidth * devicePixelRatio; c.height = innerHeight * devicePixelRatio }
  g.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0)
  g.clearRect(0, 0, innerWidth, innerHeight)
  const drag = Math.pow(0.985, k)
  for (const b of bits) {
    b.vy += 0.32 * k; b.vx *= drag; b.vy *= drag
    b.x += b.vx * k; b.y += b.vy * k; b.r += b.vr * k; b.life -= 0.009 * k
    g.save(); g.translate(b.x, b.y); g.rotate(b.r); g.globalAlpha = Math.max(0, Math.min(1, b.life * 2))
    g.fillStyle = b.c; g.fillRect(-b.w / 2, -b.h / 2, b.w, b.h * Math.abs(Math.cos(b.r * 2)) + 1); g.restore()
  }
  bits = bits.filter(b => b.life > 0 && b.y < innerHeight + 40)
  if (bits.length) raf = requestAnimationFrame(step)
  else { raf = 0; lastT = 0; g.clearRect(0, 0, innerWidth, innerHeight) }
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
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => { canvas = ref.current; return () => { canvas = null } }, [])
  return (
    <>
      <canvas ref={ref} class="fx-confetti" aria-hidden="true" />
      <div class="fx-floats" aria-hidden="true">
        {floats.value.map(f => <span key={f.id} class={'fx-float' + (f.big ? ' big' : '')} style={{ left: f.x + 'px', top: f.y + 'px', color: f.color }}>{f.text}</span>)}
      </div>
    </>
  )
}
