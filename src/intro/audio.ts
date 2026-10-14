import { effect } from '@preact/signals'
import { audioOut, muted } from '../fx/sound'

// The opening's sound, synthesised (nothing to download), following the mute switch:
//   wind: noise through a band-pass that wanders between ~400 and ~1,100 Hz, breathing slowly (sea and wind)
//   air: a faint hiss above 3 kHz
//   pad: an open fifth on A (110, 165, 220 Hz) through a soft low-pass, with a slow tremolo
//   sub: 55 Hz, felt on room speakers, harmless on a laptop
//   accents: a low bell (fundamental + inharmonic partials) on each new line of the story
//   swell: the wind rises on the descent to Puerto Rico; resolve: an A-major chord at the title
// Levels are set for laptop and projector speakers, which play little below 200 Hz: everything that carries the
// mood sits between 150 Hz and 2 kHz. A compressor keeps the peaks in check. About -20 dBFS overall.

type Target = { ctx: BaseAudioContext; dest: AudioNode }

export class Ambience {
  private ctx: BaseAudioContext | null = null
  private bus: GainNode | null = null
  private wind: BiquadFilterNode | null = null
  private windGain: GainNode | null = null
  private nodes: AudioScheduledSourceNode[] = []
  private stopMute: (() => void) | null = null

  get running() { return !!this.bus }

  /** Start the bed. `target` is for tests (an OfflineAudioContext); the app uses the shared context. */
  start(target?: Target) {
    let tg = target
    if (!tg) { const a = audioOut(); if (!a) return; tg = { ctx: a.ctx, dest: a.ctx.destination } }
    const { ctx } = tg
    this.ctx = ctx
    const t = ctx.currentTime
    const comp = ctx.createDynamicsCompressor()
    comp.threshold.value = -16; comp.knee.value = 10; comp.ratio.value = 3; comp.attack.value = 0.02; comp.release.value = 0.4
    comp.connect(tg.dest)
    const bus = ctx.createGain(); bus.gain.setValueAtTime(0.0001, t); bus.gain.exponentialRampToValueAtTime(0.8, t + 3.5)
    bus.connect(comp); this.bus = bus

    // noise, stereo, looped (pinkish: white through a gentle low shelf)
    const len = Math.floor(ctx.sampleRate * 5), buf = ctx.createBuffer(2, len, ctx.sampleRate)
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch); let b0 = 0, b1 = 0, b2 = 0
      for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; b0 = 0.997 * b0 + 0.029591 * w; b1 = 0.985 * b1 + 0.032534 * w; b2 = 0.95 * b2 + 0.048056 * w; d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.9 }
    }
    const noise = () => { const n = ctx.createBufferSource(); n.buffer = buf; n.loop = true; n.loopStart = Math.random() * 2; n.start(t); this.nodes.push(n); return n }

    // wind
    const wind = ctx.createBiquadFilter(); wind.type = 'bandpass'; wind.frequency.value = 520; wind.Q.value = 0.8; this.wind = wind
    const wg = ctx.createGain(); wg.gain.value = 0.55; this.windGain = wg
    noise().connect(wind); wind.connect(wg); wg.connect(bus)
    const lfo = (hz: number, depth: number, param: AudioParam) => { const o = ctx.createOscillator(); o.frequency.value = hz; const g = ctx.createGain(); g.gain.value = depth; o.connect(g); g.connect(param); o.start(t); this.nodes.push(o) }
    lfo(0.07, 0.22, wg.gain)            // breathing
    lfo(0.045, 160, wind.frequency)     // gusts move the colour
    // air
    const air = ctx.createBiquadFilter(); air.type = 'highpass'; air.frequency.value = 3200
    const ag = ctx.createGain(); ag.gain.value = 0.05
    noise().connect(air); air.connect(ag); ag.connect(bus)

    // pad: open fifth on A, gently filtered, slow tremolo
    const pad = ctx.createBiquadFilter(); pad.type = 'lowpass'; pad.frequency.value = 900; pad.Q.value = 0.4
    const pg = ctx.createGain(); pg.gain.setValueAtTime(0.0001, t); pg.gain.exponentialRampToValueAtTime(0.16, t + 6)
    pad.connect(pg); pg.connect(bus)
    lfo(0.11, 0.035, pg.gain)
    for (const [hz, det] of [[110, -5], [110, 6], [164.81, -3], [220, 4]] as const) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz; o.detune.value = det
      const g = ctx.createGain(); g.gain.value = 0.22; o.connect(g); g.connect(pad); o.start(t); this.nodes.push(o)
    }
    // sub
    const sub = ctx.createOscillator(); sub.frequency.value = 55
    const sg = ctx.createGain(); sg.gain.value = 0.12; sub.connect(sg); sg.connect(bus); sub.start(t); this.nodes.push(sub)

    if (!target) this.stopMute = effect(() => { if (muted.value) this.stop(0.3) })
  }

  /** 0..1: how much wind. */
  swell(x: number, sec = 3) {
    if (!this.ctx || !this.wind || !this.windGain) return
    const t = this.ctx.currentTime
    this.wind.frequency.cancelScheduledValues(t); this.wind.frequency.setTargetAtTime(480 + x * 700, t, sec / 3)
    this.windGain.gain.cancelScheduledValues(t); this.windGain.gain.setTargetAtTime(0.5 + x * 0.45, t, sec / 3)
  }

  /** A low bell for a new line of the story; `high` a fifth up (the shots over Puerto Rico). */
  accent(high = false) {
    if (!this.ctx || !this.bus) return
    const ctx = this.ctx, t = ctx.currentTime + 0.01
    const f0 = high ? 330 : 220
    for (const [ratio, v, dur] of [[1, 0.28, 3.2], [2.0, 0.1, 2.2], [2.76, 0.07, 1.6], [5.4, 0.03, 0.9]] as const) {
      const o = ctx.createOscillator(), g = ctx.createGain()
      o.type = 'sine'; o.frequency.value = f0 * ratio
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
      o.connect(g); g.connect(this.bus); o.start(t); o.stop(t + dur + 0.05)
    }
  }

  /** The title: an A-major chord that settles. */
  resolve() {
    if (!this.ctx || !this.bus) return
    const ctx = this.ctx, t = ctx.currentTime + 0.01
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800; lp.connect(this.bus)
    for (const [hz, v] of [[110, 0.12], [164.81, 0.1], [220, 0.1], [277.18, 0.09], [329.63, 0.08], [440, 0.05]] as const) {
      const o = ctx.createOscillator(), g = ctx.createGain()
      o.type = 'triangle'; o.frequency.value = hz
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.9); g.gain.exponentialRampToValueAtTime(0.0001, t + 7)
      o.connect(g); g.connect(lp); o.start(t); o.stop(t + 7.1)
    }
    this.swell(0.05, 5)
  }

  stop(fade = 1.2) {
    this.stopMute?.(); this.stopMute = null
    if (!this.ctx || !this.bus) return
    const t = this.ctx.currentTime, bus = this.bus, nodes = this.nodes
    bus.gain.cancelScheduledValues(t); bus.gain.setValueAtTime(Math.max(bus.gain.value, 0.0001), t); bus.gain.exponentialRampToValueAtTime(0.0001, t + fade)
    setTimeout(() => { nodes.forEach(n => { try { n.stop() } catch { /* already */ } }); bus.disconnect() }, fade * 1000 + 100)
    this.ctx = null; this.bus = null; this.wind = null; this.windGain = null; this.nodes = []
  }
}
