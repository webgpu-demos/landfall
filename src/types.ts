// The data contract between pipeline/ (Python, runs on GitHub Actions) and the app. Field names match the JSON.

export type Kt = '34' | '50' | '64'

export interface ForecastPoint {
  tau: number; t: number; lon: number; lat: number
  wind_kt: number; gust_kt: number; type: string; dvlbl: string; label: string
}

export interface Hls {
  t: number; label: string; number: string; headline: string; overview: string
  impacts: Record<string, string>; text: string; source: string
}

export interface Advisory {
  num: number; issued: number; label: string; title: string; headline: string[]
  center: { lat: number; lon: number }; wind_kt: number; gust_kt: number; type: string
  summary: string[]; changes: string; prWarnings: string[]
  hazards: Record<'WIND' | 'RAINFALL' | 'STORM SURGE' | 'SURF' | 'TORNADOES', string | null>
  rainPR: { low_in: number; high_in: number; max_in: number | null; text: string } | null
  outlook: string; keyMessages: string[]; discussion: string; forecaster: string
  points: ForecastPoint[]
  pws: { hours: number[]; rows: Record<string, Partial<Record<Kt, number[]>>> }
  hls: Hls | null
  nearPR: { km: number; t: number; lat: number; lon: number; wind_kt: number; derived: string }
  source: Record<string, string>
  texts: { public: string; discussion: string; probabilities: string }
}

export interface Scenario {
  id: string
  storm: { id: string; name: string; year: number }
  landfall: { t: number; lat: number; lon: number; wind_kt: number; pressure_mb: number; place: string; source: string }
  advisories: Advisory[]
  sources: Record<string, string>
  built: string
}

/** Per advisory (aligned with Places.advisories): NHC probability band lower bound, arrival hour (-1 none). */
export interface Wind { p34: number[]; p50: number[]; p64: number[]; a34: number[]; a64: number[]; cone?: number[] }

export interface Muni {
  id: string; name: string; lon: number; lat: number
  pop: number; hh: number; hu: number; svi: number; age65: number; disab: number; noveh: number; pov150: number; noins: number
  income: number; renter: number
  bld: number; bldAdded: number; bldSfha: number; bldLe2: number; surge1: number; surge3: number; slideHigh: number; slideHigh25: number
  empower: { benes: number; dme: number } | null
  ia: { reg: number; approved: number; inspected: number } | null
  roads?: { km: number; kmSlide: number; bridges: number; bridgesSfha: number; bridgesSlide: number }
  w: Wind
}

export interface Tract {
  id: string; muni: string; pop: number; hh: number; svi: number | null
  age65: number; disab: number; noveh: number; pov: number; mobile: number; noins: number
  lon: number; lat: number; w: Wind
}

export type PointKind = 'shelter' | 'hospital' | 'clinic' | 'fire' | 'police' | 'power' | 'substation' | 'water' | 'airport' | 'seaport' | 'housing' | 'venue'

export interface Pt {
  id: string; kind: PointKind; name: string; lon: number; lat: number; muni: string | null
  flood: string | null; slide: string | null; slide25?: string | null; elev: number | null; surge: number | null
  ftype?: string; addr?: string; osm?: string; htype?: 'public' | 'assisted'; units?: number; residents?: number; elderly?: number; disabled?: number
  w: Wind
}

export interface Places {
  advisories: number[]; bands: number[]
  municipios: Muni[]; tracts: Tract[]; points: Pt[]
  derived: Record<string, string>; sources: Record<string, string>; built: string
}

export interface AdvGeo {
  cone: GeoJSON.Feature[]; track: GeoJSON.Feature[]
  points: GeoJSON.FeatureCollection; warnings: GeoJSON.FeatureCollection; radii: GeoJSON.Feature[]
  prob: Record<Kt, GeoJSON.Feature[]>
}

export interface Observed {
  warnings: GeoJSON.FeatureCollection & { source: string; note: string }
  rain: { gauges: { name: string; id: string | null; network: string; lon: number; lat: number; in: number }[]; source: string; note: string }
  rivers: { gauges: { site: string; name: string; lid: string; lon: number; lat: number; peak_ft: number; peak_t: number; level: string | null; stages_ft: Record<string, number> }[]; source: string; note: string }
  facts: { k: string; en: string; es: string; src: string }[]
}

export interface BestTrack {
  points: { t: number; lat: number; lon: number; status: string; wind_kt: number; pressure_mb: number; record: string }[]
  line: GeoJSON.Feature; landfallPR: Scenario['landfall']; source: string
}

// ----------------------------------------------------------------------------------------------- session

export type DecisionKind = 'outreach' | 'staging' | 'closer'
export type TargetType = 'municipio' | 'tract' | 'point' | 'pin'

export interface Target {
  type: TargetType; id: string; name: string; lon: number; lat: number; muni?: string | null; kind?: PointKind
}

export type Action = 'add' | 'keep' | 'change' | 'drop'

export interface Step { round: number; action: Action; note?: string; t: number }

export interface Decision {
  id: string; table: string; kind: DecisionKind; target: Target
  reasons: string[]; note: string; trigger: string
  history: Step[]
}

export interface Table { id: string; name: string; color: string }

export interface Session {
  v: 1
  title: string
  codename: string
  showName: boolean
  tables: Table[]
  rounds: number[]          // advisory numbers, in order
  round: number             // index into rounds; rounds.length means the reveal
  decisions: Decision[]
  messages: Record<string, Record<number, string>>   // table -> round -> public message draft
  timerMin: number
  timerEnd: number | null   // epoch ms when the running timer ends
  timerLeft: number | null  // ms left when paused
  created: number
  started: boolean
}
