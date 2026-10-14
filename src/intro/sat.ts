// The GOES-16 infrared loop for the opening: hourly frames, already coloured by the pipeline (white cloud over a
// transparent sea, edges faded), decoded off the main thread a few at a time around the playhead, cross-faded between
// hours, and drawn into a canvas the map shows as a source. The main thread only draws two bitmaps per frame.

export interface SatMeta {
  bounds: [number, number, number, number]
  width: number; height: number
  tWarmK: number; tColdK: number
  frames: { t: number; f: string }[]
  source: string
}

export class SatLoop {
  readonly canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private blobs: (Blob | null)[] = []
  private bmps = new Map<number, ImageBitmap>()
  private pending = new Set<number>()
  private last = -1
  readonly ready: Promise<void>

  constructor(readonly meta: SatMeta, base: string) {
    this.canvas = document.createElement('canvas')
    this.canvas.width = meta.width; this.canvas.height = meta.height
    this.ctx = this.canvas.getContext('2d')!
    // frames stay compressed (about 3.5 MB in all) until they are near the playhead
    this.ready = Promise.all(meta.frames.map((f, i) => fetch(base + f.f).then(r => (r.ok ? r.blob() : null)).catch(() => null).then(b => { this.blobs[i] = b })))
      .then(() => Promise.all([0, 1, 2].map(i => this.decode(i))))
      .then(() => undefined)
  }

  get count() { return this.meta.frames.length }

  /** Fractional frame index for a time (ms), clamped to the loop. */
  posAt(t: number): number {
    const f = this.meta.frames
    if (t <= f[0].t) return 0
    if (t >= f[f.length - 1].t) return f.length - 1
    let i = 0
    while (i < f.length - 2 && f[i + 1].t <= t) i++
    return i + (t - f[i].t) / (f[i + 1].t - f[i].t)
  }

  private decode(i: number): Promise<void> {
    const b = this.blobs[i]
    if (i < 0 || i >= this.count || !b || this.bmps.has(i) || this.pending.has(i)) return Promise.resolve()
    this.pending.add(i)
    return createImageBitmap(b).then(bmp => { this.bmps.set(i, bmp); this.last = -1 }).catch(() => undefined).finally(() => this.pending.delete(i))
  }

  /** Keep decoded only the frames near i. */
  private around(i: number) {
    for (let j = i - 1; j <= i + 4; j++) this.decode(j)
    for (const [j, bmp] of this.bmps) if (j < i - 2 || j > i + 6) { bmp.close(); this.bmps.delete(j) }
  }

  /** Draw the loop at a fractional frame index. Returns false when nothing changed. */
  draw(pos: number): boolean {
    const q = Math.round(pos * 24) / 24
    if (q === this.last) return false
    const i = Math.min(Math.floor(q), this.count - 1), k = q - i
    this.around(i)
    const a = this.bmps.get(i)
    if (!a) return false   // still decoding: keep what is on screen
    this.last = q
    const b = k > 0.02 && i + 1 < this.count ? this.bmps.get(i + 1) : undefined
    const g = this.ctx
    g.clearRect(0, 0, this.canvas.width, this.canvas.height)
    g.globalAlpha = 1
    g.drawImage(a, 0, 0)
    if (b) { g.globalAlpha = k; g.drawImage(b, 0, 0); g.globalAlpha = 1 }
    return true
  }

  /** Map corners for a canvas source: top-left, top-right, bottom-right, bottom-left. */
  corners(): [[number, number], [number, number], [number, number], [number, number]] {
    const [w, s, e, n] = this.meta.bounds
    return [[w, n], [e, n], [e, s], [w, s]]
  }
}
