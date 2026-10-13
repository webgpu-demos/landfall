import type maplibregl from 'maplibre-gl'

// Pictograms for places, drawn once on a canvas: ink on white, so colour stays reserved for hazards, forecasts and
// the tables' marks. 2x pixel ratio for crisp edges on projectors and retina screens.

export const INK = '#14213D'
const S = 22, R = 2

type Draw = (c: CanvasRenderingContext2D) => void

function make(map: maplibregl.Map, name: string, draw: Draw, shape: 'disc' | 'square' | 'none' = 'disc', size = S) {
  if (map.hasImage(name)) return
  const cv = document.createElement('canvas')
  cv.width = cv.height = size * R
  const c = cv.getContext('2d')!
  c.scale(R, R)
  c.lineJoin = 'round'; c.lineCap = 'round'
  if (shape !== 'none') {
    c.fillStyle = '#fff'; c.strokeStyle = INK; c.lineWidth = 1.4
    c.beginPath()
    if (shape === 'disc') c.arc(size / 2, size / 2, size / 2 - 1.2, 0, Math.PI * 2)
    else roundRect(c, 1.2, 1.2, size - 2.4, size - 2.4, 4)
    c.fill(); c.stroke()
  }
  c.fillStyle = INK; c.strokeStyle = INK
  c.save(); c.translate(size / 2, size / 2); draw(c); c.restore()
  map.addImage(name, c.getImageData(0, 0, size * R, size * R), { pixelRatio: R })
}

function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath()
}

export function addIcons(map: maplibregl.Map) {
  // shelter: a house
  make(map, 'i-shelter', c => {
    c.beginPath(); c.moveTo(-6, -0.5); c.lineTo(0, -6); c.lineTo(6, -0.5); c.lineTo(4.4, -0.5); c.lineTo(4.4, 5.5); c.lineTo(-4.4, 5.5); c.lineTo(-4.4, -0.5); c.closePath(); c.fill()
    c.fillStyle = '#fff'; c.fillRect(-1.4, 1.6, 2.8, 3.9)
  }, 'square')
  // hospital: a cross
  make(map, 'i-hospital', c => { c.fillRect(-1.9, -6, 3.8, 12); c.fillRect(-6, -1.9, 12, 3.8) })
  make(map, 'i-clinic', c => { c.fillRect(-1.3, -4.2, 2.6, 8.4); c.fillRect(-4.2, -1.3, 8.4, 2.6) }, 'disc', 16)
  // water: a drop
  make(map, 'i-water', c => {
    c.beginPath(); c.moveTo(0, -6.5); c.bezierCurveTo(4.5, -1, 5.2, 1.5, 5.2, 2.4); c.arc(0, 2.4, 5.2, 0, Math.PI); c.bezierCurveTo(-5.2, 1.5, -4.5, -1, 0, -6.5); c.fill()
  })
  // power: a bolt
  const bolt: Draw = c => { c.beginPath(); c.moveTo(1.6, -7); c.lineTo(-4.6, 1); c.lineTo(-0.4, 1); c.lineTo(-1.6, 7); c.lineTo(4.6, -1); c.lineTo(0.4, -1); c.closePath(); c.fill() }
  make(map, 'i-power', bolt)
  make(map, 'i-substation', c => { c.scale(0.7, 0.7); bolt(c) }, 'disc', 15)
  // airport: a plane
  make(map, 'i-airport', c => {
    c.beginPath(); c.moveTo(0, -7); c.lineTo(1.3, -2.4); c.lineTo(7, 1); c.lineTo(7, 2.6); c.lineTo(1.3, 0.9); c.lineTo(1, 4.6); c.lineTo(3, 6); c.lineTo(3, 7)
    c.lineTo(0, 6.2); c.lineTo(-3, 7); c.lineTo(-3, 6); c.lineTo(-1, 4.6); c.lineTo(-1.3, 0.9); c.lineTo(-7, 2.6); c.lineTo(-7, 1); c.lineTo(-1.3, -2.4); c.closePath(); c.fill()
  })
  // seaport: an anchor
  make(map, 'i-seaport', c => {
    c.lineWidth = 1.8
    c.beginPath(); c.arc(0, -4.6, 1.6, 0, Math.PI * 2); c.stroke()
    c.beginPath(); c.moveTo(0, -3); c.lineTo(0, 6); c.moveTo(-3.6, -0.6); c.lineTo(3.6, -0.6); c.stroke()
    c.beginPath(); c.arc(0, 0.6, 5.4, 0.25 * Math.PI, 0.75 * Math.PI); c.stroke()
  })
  // housing: an apartment block
  make(map, 'i-housing', c => {
    c.fillRect(-5, -6, 10, 12); c.fillStyle = '#fff'
    for (const y of [-4, -0.8, 2.4]) for (const x of [-3.2, 0.8]) c.fillRect(x, y, 2.2, 2)
  }, 'square', 18)
  // venue: an arena seen from above
  make(map, 'i-venue', c => {
    c.lineWidth = 1.8; c.beginPath(); c.ellipse(0, 0, 6.2, 4.4, 0, 0, Math.PI * 2); c.stroke()
    c.beginPath(); c.ellipse(0, 0, 3, 1.8, 0, 0, Math.PI * 2); c.fill()
  }, 'square')
  // responders: a shield (police) and a flame-ish chevron (fire), kept small
  make(map, 'i-police', c => { c.beginPath(); c.moveTo(0, -5); c.lineTo(4.4, -3.4); c.lineTo(3.8, 1.4); c.lineTo(0, 5); c.lineTo(-3.8, 1.4); c.lineTo(-4.4, -3.4); c.closePath(); c.fill() }, 'disc', 16)
  make(map, 'i-fire', c => {
    c.beginPath(); c.moveTo(0, -5.2); c.bezierCurveTo(4.6, -1, 4.4, 4.8, 0, 5); c.bezierCurveTo(-4.4, 4.8, -4, 0, -1.4, -1.4); c.bezierCurveTo(-1, 0.6, 0.4, 0.8, 0, -5.2); c.fill()
  }, 'disc', 16)
  // storm symbols: NHC-style. Tropical storm = open spiral; hurricane = filled.
  for (const [name, filled, color] of [['s-ts', false, INK], ['s-hu', true, '#C8102E'], ['s-td', false, '#5C6B7E']] as const) {
    make(map, name, c => {
      c.strokeStyle = color; c.fillStyle = color; c.lineWidth = 2.6
      c.beginPath(); c.arc(0, 0, 5.2, 0, Math.PI * 2)
      if (filled) c.fill(); else c.stroke()
      c.lineWidth = 2.6
      c.beginPath(); c.arc(-1.2, -5.4, 6.4, Math.PI * 0.15, Math.PI * 0.72); c.stroke()
      c.beginPath(); c.arc(1.2, 5.4, 6.4, Math.PI * 1.15, Math.PI * 1.72); c.stroke()
      c.fillStyle = '#fff'; c.beginPath(); c.arc(0, 0, filled ? 1.8 : 0, 0, Math.PI * 2); c.fill()
    }, 'none', 26)
  }
  // landfall: a star
  make(map, 'landfall', c => {
    c.fillStyle = '#C8102E'; c.strokeStyle = '#fff'; c.lineWidth = 1.5
    c.beginPath()
    for (let k = 0; k < 10; k++) { const r = k % 2 ? 4 : 9.5, a = -Math.PI / 2 + k * Math.PI / 5; c.lineTo(r * Math.cos(a), r * Math.sin(a)) }
    c.closePath(); c.fill(); c.stroke()
  }, 'none', 24)
}

export const KIND_ICON: Record<string, string> = {
  shelter: 'i-shelter', hospital: 'i-hospital', clinic: 'i-clinic', water: 'i-water', power: 'i-power', substation: 'i-substation',
  airport: 'i-airport', seaport: 'i-seaport', housing: 'i-housing', venue: 'i-venue', police: 'i-police', fire: 'i-fire',
}

// Decision marks: the table's colour, with the kind as a white pictogram (megaphone, crate, magnifier).
export function decisionIcon(map: maplibregl.Map, kind: string, color: string): string {
  const name = `d-${kind}-${color.slice(1)}`
  if (map.hasImage(name)) return name
  const size = 26
  const cv = document.createElement('canvas'); cv.width = cv.height = size * R
  const c = cv.getContext('2d')!; c.scale(R, R); c.lineJoin = 'round'; c.lineCap = 'round'
  c.fillStyle = color; c.strokeStyle = '#fff'; c.lineWidth = 2
  c.beginPath(); c.arc(size / 2, size / 2, size / 2 - 1.5, 0, Math.PI * 2); c.fill(); c.stroke()
  c.translate(size / 2, size / 2); c.fillStyle = '#fff'; c.strokeStyle = '#fff'
  if (kind === 'outreach') {
    c.beginPath(); c.moveTo(-6, -2); c.lineTo(-2.5, -2); c.lineTo(4.5, -6); c.lineTo(4.5, 6); c.lineTo(-2.5, 2); c.lineTo(-6, 2); c.closePath(); c.fill()
    c.fillRect(-4.6, 2, 2.4, 4)
  } else if (kind === 'staging') {
    c.fillRect(-6, -4, 12, 9); c.fillStyle = color; c.fillRect(-6, -1.2, 12, 1.4); c.fillRect(-0.7, -4, 1.4, 9)
  } else {
    c.lineWidth = 2.2; c.beginPath(); c.arc(-1.2, -1.2, 4.2, 0, Math.PI * 2); c.stroke()
    c.lineWidth = 3; c.beginPath(); c.moveTo(2, 2); c.lineTo(6, 6); c.stroke()
  }
  map.addImage(name, c.getImageData(0, 0, size * R, size * R), { pixelRatio: R })
  return name
}
