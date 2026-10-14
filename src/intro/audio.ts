import { effect } from '@preact/signals'
import { audioOut, muted } from '../fx/sound'

// The opening's sound: a low ocean-and-wind bed (filtered noise that breathes), a quiet drone under it, a soft
// low accent when a new line of the story appears, a swell on the descent to Puerto Rico and a settling chord at the
// title. Synthesised, nothing to download; follows the mute switch.

export class Ambience {
  private a: { ctx: AudioContext; out: GainNode } | null = null
  private bus: GainNode | null = null
  private filter: BiquadFilterNode | null = null
  private nodes: AudioScheduledSourceNode[] = []
  private stopMute: (() => void) | null = null

  start() {
    this.a = audioOut()
    if (!this.a) return
    const { ctx, out } = this.a
    const t = ctx.currentTime
    const bus = ctx.createGain(); bus.gain.setValueAtTime(0.0001, t); bus.gain.exponentialRampToValueAtTime(1, t + 3)
    bus.connect(out); this.bus = bus
    // brown noise, looped
    const len = ctx.sampleRate * 6, buf = ctx.createBuffer(2, len, ctx.sampleRate)
    for (let ch = 0; ch < 2; ch++) { const d = buf.getChannelData(ch); let last = 0; for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.2 } }
    const n = ctx.createBufferSource(); n.buffer = buf; n.loop = true
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420; f.Q.value = 0.4; this.filter = f
    const ng = ctx.createGain(); ng.gain.value = 0.55
    // slow breathing on the noise
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.09
    const lg = ctx.createGain(); lg.gain.value = 0.22; lfo.connect(lg); lg.connect(ng.gain)
    n.connect(f); f.connect(ng); ng.connect(bus)
    // drone: a low fifth, barely there
    const dg = ctx.createGain(); dg.gain.value = 0.05; dg.connect(bus)
    for (const [hz, det] of [[55, -4], [82.4, 3], [110, 0]] as const) { const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = hz; o.detune.value = det; o.connect(dg); o.start(t); this.nodes.push(o) }
    n.start(t); lfo.start(t); this.nodes.push(n, lfo)
    this.stopMute = effect(() => { if (muted.value) this.stop(0.3) })
  }

  /** 0..1: how much wind. */
  swell(x: number, sec = 3) {
    if (!this.a || !this.filter) return
    const t = this.a.ctx.currentTime
    this.filter.frequency.cancelScheduledValues(t)
    this.filter.frequency.setTargetAtTime(380 + x * 1400, t, sec / 3)
  }

  /** A soft low accent for a new line of the story. */
  accent(high = false) {
    if (!this.a || !this.bus) return
    const { ctx } = this.a, t = ctx.currentTime + 0.01
    const o = ctx.createOscillator(), g = ctx.createGain()
    o.type = 'sine'; o.frequency.setValueAtTime(high ? 220 : 98, t); o.frequency.exponentialRampToValueAtTime(high ? 196 : 82, t + 1.2)
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.32, t + 0.04); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6)
    o.connect(g); g.connect(this.bus); o.start(t); o.stop(t + 1.7)
    const b = ctx.createOscillator(), bg = ctx.createGain()
    b.type = 'sine'; b.frequency.value = high ? 1320 : 880
    bg.gain.setValueAtTime(0.0001, t); bg.gain.exponentialRampToValueAtTime(0.05, t + 0.02); bg.gain.exponentialRampToValueAtTime(0.0001, t + 1.4)
    b.connect(bg); bg.connect(this.bus); b.start(t); b.stop(t + 1.5)
  }

  /** The title: a settled major chord. */
  resolve() {
    if (!this.a || !this.bus) return
    const { ctx } = this.a, t = ctx.currentTime + 0.01
    for (const [hz, v] of [[130.8, 0.14], [196, 0.1], [261.6, 0.09], [329.6, 0.07], [392, 0.05]] as const) {
      const o = ctx.createOscillator(), g = ctx.createGain()
      o.type = 'sine'; o.frequency.value = hz
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.6); g.gain.exponentialRampToValueAtTime(0.0001, t + 6)
      o.connect(g); g.connect(this.bus); o.start(t); o.stop(t + 6.1)
    }
    this.swell(0.05, 5)
  }

  stop(fade = 1.2) {
    this.stopMute?.(); this.stopMute = null
    if (!this.a || !this.bus) return
    const { ctx } = this.a, t = ctx.currentTime, bus = this.bus, nodes = this.nodes
    bus.gain.cancelScheduledValues(t); bus.gain.setValueAtTime(Math.max(bus.gain.value, 0.0001), t); bus.gain.exponentialRampToValueAtTime(0.0001, t + fade)
    setTimeout(() => { nodes.forEach(n => { try { n.stop() } catch { /* already */ } }); bus.disconnect() }, fade * 1000 + 100)
    this.a = null; this.bus = null; this.filter = null; this.nodes = []
  }
}
