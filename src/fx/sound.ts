import { signal, effect } from '@preact/signals'

// Synthesised sounds (Web Audio, no files). Short, soft sine tones that read as "done" or "noted", nothing arcade. One master volume
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
      master = ctx.createGain(); master.gain.value = 0.18; master.connect(ctx.destination)
    }
    if (ctx.state === 'suspended') ctx.resume()
    return ctx
  } catch { return null }
}
addEventListener('pointerdown', () => { if (!muted.value) ac() }, { once: true, capture: true })

/** The shared audio context and master gain, for longer pieces (the opening's ambience); null when muted. */
export function audioOut(): { ctx: AudioContext; out: GainNode } | null {
  const c = ac()
  return c && master ? { ctx: c, out: master } : null
}

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

export type Sfx = 'click' | 'coin' | 'deploy' | 'tick' | 'complete' | 'release' | 'hit' | 'miss' | 'resolve' | 'timeup' | 'countdown' | 'whoosh'

let last = 0
export function play(k: Sfx, pitch = 0) {
  const c = ac()
  if (!c) return
  const t = c.currentTime + 0.01
  // points in quick succession step up slightly in pitch
  const up = (n: number) => n * Math.pow(2, pitch / 12)
  switch (k) {
    case 'click': tone(1320, t, 0.04, 'sine', 0.18); break
    case 'tick': tone(1568, t, 0.06, 'sine', 0.2); break
    case 'coin': tone(up(880), t, 0.08, 'sine', 0.2); tone(up(1319), t + 0.05, 0.16, 'sine', 0.12); break
    case 'deploy': noise(t, 0.12, 0.12, 300, 1600, 1.2); tone(523, t, 0.16, 'sine', 0.28); tone(784, t + 0.06, 0.2, 'sine', 0.16); break
    case 'complete': tone(659, t, 0.3, 'sine', 0.24); tone(988, t + 0.09, 0.45, 'sine', 0.18); break
    case 'release': noise(t, 0.4, 0.1, 200, 2400, 0.6); tone(880, t + 0.15, 0.6, 'sine', 0.22); tone(1320, t + 0.15, 0.4, 'sine', 0.08); break
    case 'whoosh': noise(t, 0.3, 0.12, 500, 4000, 0.7); break
    case 'hit': tone(up(880), t, 0.12, 'sine', 0.24); tone(up(1319), t + 0.05, 0.26, 'sine', 0.14); break
    case 'miss': tone(220, t, 0.16, 'sine', 0.2, 185); break
    case 'resolve': [523, 659, 784].forEach(f => tone(f, t, 1.1, 'sine', 0.12)); break
    case 'countdown': tone(880, t, 0.06, 'sine', 0.14); break
    case 'timeup': [0, 0.25].forEach(d => tone(659, t + d, 0.2, 'sine', 0.22)); break
  }
  last = performance.now()
}
export function lastPlayed() { return last }
