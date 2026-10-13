// Colour tokens shared by the map and the panels. Warning colours follow NHC's own convention so practitioners read
// them without a legend; the probability ramp is a single plum hue so it never reads as a warning.

export const C = {
  ink: '#14213D',
  inkSoft: '#3D4B63',
  muted: '#6A7686',
  rule: '#C9D1D9',
  paper: '#FFFFFF',
  panel: '#F4F6F7',
  sea: '#D5E2E8',
  seaDeep: '#C8D8E0',
  land: '#ECEDE7',
  landPR: '#F6F6F2',
  graticule: '#B4C5CF',
  boundary: '#8C99A8',
  HWR: '#E8112D',
  HWA: '#F28CBF',
  TWR: '#2563C9',
  TWA: '#F2C500',
  cone: '#FFFFFF',
  track: '#14213D',
}

/** NHC probability bands (lower bounds) -> plum ramp. 0 = under 5 %, not drawn. */
export const PROB: [number, string][] = [
  [5, '#F1E6EF'], [10, '#E6CFE2'], [20, '#D8B4D1'], [30, '#C996BF'], [40, '#B878AC'],
  [50, '#A65C98'], [60, '#924384'], [70, '#7C2E70'], [80, '#68205F'], [90, '#4F1347'],
]

export const PR_STATUS_COLOR: Record<string, string> = { HWR: C.HWR, HWA: C.HWA, TWR: C.TWR, TWA: C.TWA }

/** Sequential ramp for community choropleths (tracts, municipios): blue-grey ink. */
export const COMMUNITY: [number, string][] = [
  [0, '#F2F4F7'], [0.2, '#D9E1EA'], [0.4, '#B7C6D6'], [0.6, '#8EA4BD'], [0.8, '#5D7899'], [1, '#2D4769'],
]

export const FLOOD_LEVEL: Record<string, string> = { action: '#E6C200', minor: '#F28C28', moderate: '#D7263D', major: '#8E3BA8' }
export const RAIN: [number, string][] = [[0, '#E3EEF6'], [4, '#B6D3EA'], [8, '#7FB2DA'], [12, '#4A8DC6'], [16, '#2468AA'], [20, '#0E4A86'], [28, '#06305D']]
