import type { Target, Muni, Tract, Pt, PointKind } from '../types'
import { data, muni } from '../data'
import { lang } from '../state'
import { band, num, pct, dayTime, hoursLeft } from './format'

// "Ask the data": five questions to put to any hurricane forecast, each answered for the advisory on screen with
// the places, people and facilities of today's Puerto Rico. Rankings are screens, not verdicts; each says how it ranks.

export interface Row { target: Target; value: string; detail: string; score: number }
export interface LensResult { rows: Row[]; map: { level: 'muni' | 'tract' | 'point'; ids: string[] }; note?: string }
export interface Lens { id: string; q: 1 | 2 | 3 | 4 | 5; title: [string, string]; method: [string, string]; run: (n: number, prev: number | null) => LensResult }

export const QUESTIONS: Record<number, [string, string]> = {
  1: ['What is the hazard, and how likely is it here?', '¿Cuál es el peligro y qué tan probable es aquí?'],
  2: ['When does it arrive, and what can\'t wait?', '¿Cuándo llega y qué no puede esperar?'],
  3: ['Who will have the hardest time preparing or coping?', '¿Quién tendrá más dificultad para prepararse o resistir?'],
  4: ['What could fail, or cut people off?', '¿Qué podría fallar o dejar a la gente aislada?'],
  5: ['What changed, and what would change our minds?', '¿Qué cambió y qué nos haría cambiar de opinión?'],
}

const L = (en: string, es: string): [string, string] => [en, es]
const tx = (p: [string, string]) => p[lang.value === 'es' ? 1 : 0]

function idx(num: number) { return data.places.value!.advisories.indexOf(num) }
const mT = (m: Muni): Target => ({ type: 'municipio', id: m.id, name: m.name, lon: m.lon, lat: m.lat, muni: m.id })
const tT = (t: Tract): Target => ({ type: 'tract', id: t.id, name: tractName(t), lon: t.lon, lat: t.lat, muni: t.muni })
const pT = (p: Pt): Target => ({ type: 'point', id: p.id, name: p.name, lon: p.lon, lat: p.lat, muni: p.muni, kind: p.kind })

export function tractName(t: Tract) {
  const m = muni(t.muni)
  const n = t.id.slice(5).replace(/^0+/, '')
  const label = n.length > 2 ? `${n.slice(0, -2)}.${n.slice(-2)}`.replace(/\.00$/, '') : n
  return (lang.value === 'es' ? 'Sector ' : 'Tract ') + label + (m ? `, ${m.name}` : '')
}

const SFHA = (z: string | null) => !!z && /^(A|V)/.test(z)
const HIGH = (s: string | null | undefined) => !!s && /high|alta/i.test(s) && !/^moderate/i.test(s)

export const LENSES: Lens[] = [
  {
    id: 'wind', q: 1,
    title: L('Where are damaging winds most likely?', '¿Dónde son más probables los vientos dañinos?'),
    method: L('Municipios by NHC\'s chance of 58+ mph winds (then 74+, then 39+), the highest band touching the municipio. Population shown for scale.',
      'Municipios según la probabilidad del NHC de vientos de 58+ mph (luego 74+, luego 39+), la banda más alta que toca el municipio. Población como referencia.'),
    run(n) {
      const i = idx(n)
      const ms = data.places.value!.municipios.map(m => ({ m, s: m.w.p50[i] * 1000 + m.w.p64[i] * 10 + m.w.p34[i] / 10 }))
        .sort((a, b) => b.s - a.s || b.m.pop - a.m.pop)
      return {
        rows: ms.map(({ m }) => ({ target: mT(m), score: m.w.p50[i], value: band(m.w.p50[i]),
          detail: `${lang.value === 'es' ? '74+ mph' : '74+ mph'}: ${band(m.w.p64[i])}   ${num(m.pop)} ${lang.value === 'es' ? 'hab.' : 'people'}` })),
        map: { level: 'muni', ids: ms.filter(x => x.m.w.p50[i] > 0).map(x => x.m.id) },
      }
    },
  },
  {
    id: 'rain', q: 1,
    title: L('Where would heavy rain do the most harm?', '¿Dónde haría más daño la lluvia intensa?'),
    method: L('Municipios by buildings on or within 25 m of High or greater landslide susceptibility (USGS) plus buildings in the FEMA 1 % flood zone. Rain itself is forecast for the island as a whole: read NHC\'s words for where it will be heaviest.',
      'Municipios según los edificios en o a 25 m de susceptibilidad Alta o mayor a deslizamientos (USGS) más los edificios en la zona inundable 1 % de FEMA. La lluvia se pronostica para toda la isla: lee el texto del NHC para saber dónde será más fuerte.'),
    run(n) {
      const a = data.scenario.value!.advisories.find(x => x.num === n)
      const ms = [...data.places.value!.municipios].map(m => ({ m, s: (m.slideHigh25 ?? 0) + (m.bldSfha ?? 0) })).sort((x, y) => y.s - x.s)
      return {
        rows: ms.map(({ m, s }) => ({ target: mT(m), score: s, value: num(s),
          detail: lang.value === 'es' ? `${num(m.slideHigh25)} por deslizamientos, ${num(m.bldSfha)} en zona inundable` : `${num(m.slideHigh25)} landslide, ${num(m.bldSfha)} flood zone` })),
        map: { level: 'muni', ids: ms.slice(0, 15).map(x => x.m.id) },
        note: a?.rainPR?.text,
      }
    },
  },
  {
    id: 'arrival', q: 2,
    title: L('How much time is left before tropical-storm winds?', '¿Cuánto tiempo queda antes de los vientos de tormenta tropical?'),
    method: L('Municipios by when NHC\'s forecast 39-mph wind radius first reaches them (radii interpolated hourly; computed here). Outdoor work, evacuations and deliveries need to finish before then.',
      'Municipios según cuándo el radio de vientos de 39 mph pronosticado por el NHC los alcanza (radios interpolados por hora; calculado aquí). El trabajo afuera, los desalojos y las entregas deben terminar antes.'),
    run(n) {
      const i = idx(n)
      const adv = data.scenario.value!.advisories.find(x => x.num === n)!
      const ms = data.places.value!.municipios.filter(m => m.w.a34[i] >= 0).sort((a, b) => a.w.a34[i] - b.w.a34[i] || b.pop - a.pop)
      return {
        rows: ms.map(m => ({ target: mT(m), score: -m.w.a34[i], value: hoursLeft(m.w.a34[i]),
          detail: dayTime(adv.issued + m.w.a34[i] * 3600e3) + ' AST' + (m.w.a64[i] >= 0 ? (lang.value === 'es' ? `; huracán ${hoursLeft(m.w.a64[i])}` : `; hurricane force ${hoursLeft(m.w.a64[i])}`) : '') })),
        map: { level: 'muni', ids: ms.slice(0, 20).map(m => m.id) },
      }
    },
  },
  {
    id: 'people', q: 3,
    title: L('Which neighborhoods will find it hardest to prepare?', '¿Qué vecindarios tendrán más dificultad para prepararse?'),
    method: L('Census tracts in the top quarter of social vulnerability (CDC SVI 2022) where NHC gives at least a 30 % chance of 39+ mph winds, by number of residents. Older adults, disability and households without a car shown.',
      'Sectores censales en el cuarto más alto de vulnerabilidad social (CDC SVI 2022) donde el NHC da al menos 30 % de probabilidad de vientos de 39+ mph, por número de residentes. Se muestran personas mayores, discapacidad y hogares sin carro.'),
    run(n) {
      const i = idx(n)
      const ts = data.places.value!.tracts.filter(t => (t.svi ?? 0) >= 0.75 && t.w.p34[i] >= 30).sort((a, b) => b.pop - a.pop)
      return {
        rows: ts.map(t => ({ target: tT(t), score: t.pop, value: `SVI ${(t.svi! * 100).toFixed(0)}`,
          detail: lang.value === 'es' ? `${num(t.pop)} hab.; 65+ ${pct(t.age65)}; discap. ${pct(t.disab)}; sin carro ${pct(t.noveh)}` : `${num(t.pop)} people; 65+ ${pct(t.age65)}; disability ${pct(t.disab)}; no car ${pct(t.noveh)}` })),
        map: { level: 'tract', ids: ts.map(t => t.id) },
      }
    },
  },
  {
    id: 'power', q: 3,
    title: L('Who needs electricity to stay healthy?', '¿Quién necesita electricidad para mantenerse sano?'),
    method: L('Municipios by Medicare beneficiaries who use electricity-dependent medical equipment (HHS emPOWER, today\'s counts), with the share of all Medicare beneficiaries. A long outage turns these into emergencies.',
      'Municipios según los beneficiarios de Medicare que usan equipo médico eléctrico (HHS emPOWER, datos de hoy), con su proporción del total de Medicare. Un apagón largo convierte estos casos en emergencias.'),
    run(n) {
      const i = idx(n)
      const ms = data.places.value!.municipios.filter(m => m.empower?.dme).sort((a, b) => b.empower!.dme - a.empower!.dme)
      return {
        rows: ms.map(m => ({ target: mT(m), score: m.empower!.dme, value: num(m.empower!.dme),
          detail: (lang.value === 'es' ? `${pct(100 * m.empower!.dme / m.empower!.benes, 1)} de Medicare; 39+ mph ${band(m.w.p34[i])}` : `${pct(100 * m.empower!.dme / m.empower!.benes, 1)} of Medicare; 39+ mph ${band(m.w.p34[i])}`) })),
        map: { level: 'muni', ids: ms.slice(0, 15).map(m => m.id) },
      }
    },
  },
  {
    id: 'access', q: 4,
    title: L('Where could communities be cut off?', '¿Dónde podrían quedar aisladas las comunidades?'),
    method: L('Municipios by kilometres of main road (OpenStreetMap, tertiary and above) crossing High or greater landslide susceptibility, plus bridges on public roads whose ends sit on that ground or whose middle is in a FEMA flood zone. Computed here.',
      'Municipios según los kilómetros de carretera principal (OpenStreetMap, terciaria o mayor) que cruzan susceptibilidad Alta o mayor a deslizamientos, más los puentes de vías públicas con extremos en ese terreno o con su centro en zona inundable de FEMA. Calculado aquí.'),
    run() {
      const ms = data.places.value!.municipios.filter(m => m.roads).map(m => ({ m, s: m.roads!.kmSlide + 0.5 * (m.roads!.bridgesSlide + m.roads!.bridgesSfha) }))
        .sort((a, b) => b.s - a.s)
      return {
        rows: ms.map(({ m, s }) => ({ target: mT(m), score: s, value: `${num(m.roads!.kmSlide, 0)} km`,
          detail: lang.value === 'es' ? `${m.roads!.bridgesSlide} puentes en terreno inestable, ${m.roads!.bridgesSfha} en zona inundable` : `${m.roads!.bridgesSlide} bridges on unstable ground, ${m.roads!.bridgesSfha} in a flood zone` })),
        map: { level: 'muni', ids: ms.slice(0, 15).map(x => x.m.id) },
      }
    },
  },
  {
    id: 'shelters', q: 4,
    title: L('Which shelters need a second look?', '¿Qué refugios hay que revisar?'),
    method: L('Listed 2026 shelters with at least one flag: in a FEMA 1 % flood zone, inside a mapped surge area (Category 1 to 3), High or greater landslide susceptibility within 25 m, or ground at 3 m or lower. More flags first, then the chance of 58+ mph winds.',
      'Refugios de la lista 2026 con al menos una señal: en zona inundable 1 % de FEMA, dentro del área de marejada (Categoría 1 a 3), susceptibilidad Alta o mayor a 25 m, o terreno a 3 m o menos. Primero los de más señales, luego la probabilidad de vientos de 58+ mph.'),
    run(n) {
      const i = idx(n)
      const rows = data.places.value!.points.filter(p => p.kind === 'shelter').map(p => ({ p, f: flags(p) }))
        .filter(x => x.f.length).sort((a, b) => b.f.length - a.f.length || b.p.w.p50[i] - a.p.w.p50[i])
      return {
        rows: rows.map(({ p, f }) => ({ target: pT(p), score: f.length, value: f.join(', '), detail: `${muni(p.muni)?.name ?? ''}; 58+ mph ${band(p.w.p50[i])}` })),
        map: { level: 'point', ids: rows.map(x => x.p.id) },
      }
    },
  },
  {
    id: 'facilities', q: 4,
    title: L('Which critical facilities sit in harm\'s way?', '¿Qué instalaciones críticas están en peligro?'),
    method: L('Hospitals, water and power plants, airports and seaports with a flood, surge, landslide or low-ground flag (as for shelters), by number of flags.',
      'Hospitales, plantas de agua y energía, aeropuertos y puertos con señal de inundación, marejada, deslizamiento o terreno bajo (como en los refugios), por número de señales.'),
    run(n) {
      const i = idx(n)
      const K: PointKind[] = ['hospital', 'water', 'power', 'airport', 'seaport']
      const rows = data.places.value!.points.filter(p => K.includes(p.kind)).map(p => ({ p, f: flags(p) }))
        .filter(x => x.f.length).sort((a, b) => b.f.length - a.f.length || b.p.w.p50[i] - a.p.w.p50[i])
      return {
        rows: rows.map(({ p, f }) => ({ target: pT(p), score: f.length, value: f.join(', '), detail: `${kindName(p.kind)}, ${muni(p.muni)?.name ?? ''}` })),
        map: { level: 'point', ids: rows.map(x => x.p.id) },
      }
    },
  },
  {
    id: 'moved', q: 5,
    title: L('Where did the forecast move most since last round?', '¿Dónde cambió más el pronóstico desde la ronda anterior?'),
    method: L('Municipios by the change in NHC\'s chance of 58+ mph winds since the previous round, then 74+ mph. Decisions tied to these places are worth a second look.',
      'Municipios según el cambio en la probabilidad de vientos de 58+ mph del NHC desde la ronda anterior, luego 74+ mph. Las decisiones ligadas a estos lugares merecen una segunda mirada.'),
    run(n, prev) {
      if (prev == null) return { rows: [], map: { level: 'muni', ids: [] }, note: lang.value === 'es' ? 'Disponible desde la segunda ronda.' : 'Available from the second round.' }
      const i = idx(n), j = idx(prev)
      const ms = data.places.value!.municipios.map(m => ({ m, d: m.w.p50[i] - m.w.p50[j], d64: m.w.p64[i] - m.w.p64[j] }))
        .filter(x => x.d || x.d64).sort((a, b) => Math.abs(b.d) - Math.abs(a.d) || Math.abs(b.d64) - Math.abs(a.d64))
      return {
        rows: ms.map(({ m, d, d64 }) => ({ target: mT(m), score: d, value: `${d > 0 ? '▲' : d < 0 ? '▼' : '•'} ${band(m.w.p50[j])} → ${band(m.w.p50[i])}`,
          detail: `74+ mph: ${band(m.w.p64[j])} → ${band(m.w.p64[i])}${d64 ? (d64 > 0 ? ' ▲' : ' ▼') : ''}` })),
        map: { level: 'muni', ids: ms.slice(0, 20).map(x => x.m.id) },
      }
    },
  },
]

export function flags(p: Pt): string[] {
  const es = lang.value === 'es'
  const f: string[] = []
  if (SFHA(p.flood)) f.push(es ? `zona ${p.flood}` : `flood zone ${p.flood}`)
  if (p.surge && p.surge <= 3) f.push(es ? `marejada Cat ${p.surge}` : `surge Cat ${p.surge}`)
  if (HIGH(p.slide25 ?? p.slide)) f.push(es ? 'deslizamiento' : 'landslide')
  if (p.elev != null && p.elev <= 3) f.push(es ? `${num(p.elev, 1)} m` : `${num(p.elev, 1)} m ground`)
  return f
}

const KINDS: Record<string, [string, string]> = {
  shelter: ['Shelter', 'Refugio'], hospital: ['Hospital', 'Hospital'], clinic: ['Clinic', 'Clínica'], fire: ['Fire station', 'Bomberos'],
  police: ['Police', 'Policía'], power: ['Power plant', 'Planta de energía'], substation: ['Substation', 'Subestación'], water: ['Water plant', 'Planta de agua'],
  airport: ['Airport', 'Aeropuerto'], seaport: ['Seaport', 'Puerto'], housing: ['Housing', 'Vivienda'], venue: ['Coliseum or stadium', 'Coliseo o estadio'],
}
export function kindName(k: string) { return tx(KINDS[k] ?? [k, k]) }
export function lensText(p: [string, string]) { return tx(p) }
