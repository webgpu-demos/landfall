import { signal, effect } from '@preact/signals'

// Synthesised sounds (Web Audio, no files). Short, soft, pitched to read as "good" or "neutral". One master volume
// and a mute that persists in the browser. The context starts on the first user gesture, as browsers require.

export const muted = signal<boolean>((() => { try { return localStorage.getItem('landfall.sound') === 'off' } catch { return false } })())
effect(() => { try { localStorage.setItem('landfall.sound', muted.value ? 'off' : 'on') } catch { /* ignore */ } })

let ctx: AudioContext | null = null
let master: GainNode | null = null

function ac(): AudioContext | null {
  if (muted.value) return null
  try {
    if (!ctx) {
      const C = (window as any).AudioContext || (window as any).webkitAudioContext
      if (!C) return null
      ctx = new C() as AudioContext
      master = ctx.createGain(); master.gain.value = 0.22; master.connect(ctx.destination)
    }
    if (ctx.state === 'suspended') ctx.resume()
    return ctx
  } catch { return null }
}
addEventListener('pointerdown', () => { if (!muted.value) ac() }, { once: true, capture: true })

function tone(f: number, t0: number, dur: number, type: OscillatorType = 'triangle', vol = 0.5, f2?: number) {
  const c = ctx!, o = c.createOscillator(), g = c.createGain()
  o.type = type; o.frequency.setValueAtTime(f, t0)
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + dur)
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.008)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  o.connect(g); g.connect(master!)
  o.start(t0); o.stop(t0 + dur + 0.02)
}

function noise(t0: number, dur: number, vol = 0.3, from = 400, to = 4000, q = 0.8) {
  const c = ctx!, n = Math.floor(c.sampleRate * dur)
  const b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0)
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1
  const s = c.createBufferSource(); s.buffer = b
  const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = q
  f.frequency.setValueAtTime(from, t0); f.frequency.exponentialRampToValueAtTime(to, t0 + dur)
  const g = c.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + dur * 0.3); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  s.connect(f); f.connect(g); g.connect(master!)
  s.start(t0); s.stop(t0 + dur)
}

export type Sfx = 'click' | 'coin' | 'deploy' | 'tick' | 'complete' | 'release' | 'hit' | 'miss' | 'fanfare' | 'badge' | 'drop' | 'timeup' | 'countdown' | 'whoosh'

let last = 0
export function play(k: Sfx, pitch = 0) {
  const c = ac()
  if (!c) return
  const t = c.currentTime + 0.01
  // coins in quick succession climb in pitch, the way a combo should
  const up = (n: number) => n * Math.pow(2, pitch / 12)
  switch (k) {
    case 'click': tone(up(1320), t, 0.05, 'sine', 0.25); break
    case 'tick': tone(up(1760), t, 0.06, 'triangle', 0.3); tone(up(2637), t + 0.03, 0.06, 'sine', 0.15); break
    case 'coin': tone(up(988), t, 0.07, 'square', 0.12); tone(up(1319), t + 0.06, 0.22, 'square', 0.12); break
    case 'deploy': noise(t, 0.16, 0.25, 300, 2400, 1.2); tone(up(392), t, 0.09, 'sine', 0.4, up(784)); tone(up(784), t + 0.09, 0.18, 'triangle', 0.3); break
    case 'drop': tone(up(660), t, 0.12, 'sine', 0.3, up(330)); break
    case 'complete': [523, 659, 784, 1047].forEach((f, i) => tone(up(f), t + i * 0.07, 0.18, 'triangle', 0.4)); tone(up(1568), t + 0.3, 0.4, 'sine', 0.2); break
    case 'badge': [784, 988, 1175].forEach((f, i) => tone(up(f), t + i * 0.05, 0.25, 'sine', 0.35)); break
    case 'release': noise(t, 0.5, 0.18, 200, 3000, 0.6); tone(1175, t + 0.18, 0.7, 'sine', 0.35); tone(1760, t + 0.18, 0.5, 'sine', 0.12); tone(1175, t + 0.55, 0.5, 'sine', 0.12); break
    case 'whoosh': noise(t, 0.35, 0.2, 500, 5000, 0.7); break
    case 'hit': tone(up(1047), t, 0.12, 'triangle', 0.4); tone(up(1568), t + 0.06, 0.35, 'sine', 0.3); break
    case 'miss': tone(196, t, 0.18, 'sine', 0.35, 150); break
    case 'fanfare': [[523, 0], [659, 0.12], [784, 0.24], [1047, 0.36], [784, 0.5], [1047, 0.62]].forEach(([f, d]) => tone(f, t + d, 0.22, 'square', 0.12));
      [523, 659, 784, 1047].forEach(f => tone(f, t + 0.78, 0.9, 'triangle', 0.22)); break
    case 'countdown': tone(880, t, 0.08, 'square', 0.12); break
    case 'timeup': [0, 0.22, 0.44].forEach(d => tone(440, t + d, 0.16, 'square', 0.16)); break
  }
  last = performance.now()
}
export function lastPlayed() { return last }
