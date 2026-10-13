import type { Advisory } from '../types'
import { lang } from '../state'
import { earliestArrival, prStatus } from './conditions'
import { mph } from './format'

// Questions for the tables, built from what actually changed in the forecast this round. Facilitation, not data.

const STATUS: Record<string, [string, string]> = {
  TWA: ['a tropical storm watch', 'vigilancia de tormenta tropical'], TWR: ['a tropical storm warning', 'aviso de tormenta tropical'],
  HWA: ['a hurricane watch', 'vigilancia de huracán'], HWR: ['a hurricane warning', 'aviso de huracán'],
}

export function prompts(a: Advisory, prev: Advisory | null, isLast: boolean): string[] {
  const es = lang.value === 'es'
  const out: string[] = []
  const arr = earliestArrival(a.num)
  const h = arr ? Math.round((arr - a.issued) / 3600e3) : null
  if (!prev) {
    out.push(es ? 'Para cada decisión, nombren el peligro que la motiva: viento, lluvia, deslizamientos o marejada.' : 'For each decision, name the hazard behind it: wind, rain, landslides or surge.')
    out.push(es ? '¿Qué harían hoy si el pronóstico empeora mañana, y qué esperarían a ver?' : 'What would you do today in case the forecast gets worse tomorrow, and what would you wait to see?')
  } else {
    const s0 = prStatus(prev), s1 = prStatus(a)
    if (s1 && s1 !== s0) out.push(es ? `El NHC puso a Puerto Rico bajo ${STATUS[s1][1]}. ¿Qué se vuelve urgente ahora?` : `NHC put Puerto Rico under ${STATUS[s1][0]}. What becomes urgent now?`)
    const r0 = prev.rainPR, r1 = a.rainPR
    if (r0 && r1 && (r1.max_in ?? r1.high_in) >= 1.4 * (r0.max_in ?? r0.high_in)) out.push(es
      ? `La lluvia pronosticada pasó de ${r0.low_in}–${r0.high_in} a ${r1.low_in}–${r1.high_in} pulgadas. ¿Qué decisiones eran solo por el viento? Miren deslizamientos y carreteras.`
      : `The rain forecast went from ${r0.low_in}–${r0.high_in} to ${r1.low_in}–${r1.high_in} inches. Which decisions were about wind alone? Look at landslides and roads.`)
    if (a.nearPR.wind_kt > prev.nearPR.wind_kt) out.push(es ? `El viento pronosticado cerca de Puerto Rico subió a ${mph(a.nearPR.wind_kt)} mph. ¿Cambia algo para refugios e instalaciones?` : `Forecast wind near Puerto Rico rose to ${mph(a.nearPR.wind_kt)} mph. Does that change anything for shelters and facilities?`)
    if (prev.nearPR.km - a.nearPR.km >= 25) out.push(es ? 'El centro pronosticado se acercó a la isla. ¿Qué lugares que descartaron hay que volver a mirar?' : 'The forecast center moved closer to the island. Which places you set aside need another look?')
  }
  if (h != null && h > 0 && h <= 24) out.push(es ? `Los vientos de tormenta tropical podrían empezar en unas ${h} horas. ¿Qué tiene que terminar antes: entregas, apertura de refugios, alcance a pie?` : `Tropical-storm winds could start in about ${h} hours. What has to finish before then: deliveries, shelter openings, outreach on foot?`)
  if (h === 0) out.push(es ? 'Los vientos ya llegan a partes de la isla. ¿Qué se puede hacer todavía sin poner a nadie en riesgo?' : 'Winds are already reaching parts of the island. What can still be done without putting anyone at risk?')
  if (isLast) out.push(es ? 'Última advertencia antes de revelar. Escriban el mensaje al público que darían ahora.' : 'Last advisory before the reveal. Write the public message you would give now.')
  return out.slice(0, 3)
}
