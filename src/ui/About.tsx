import { about, lang } from '../state'
import { data } from '../data'
import { t } from '../i18n'
import { Src } from './common'

// What is real, what is today's, what is computed here, and what is missing. Shown from the session menu and setup.

export function About() {
  if (!about.value) return null
  const es = lang.value === 'es'
  const S = data.scenario.value
  const L = (en: string, sp: string) => (es ? sp : en)
  return (
    <div class="drawer-scrim" onClick={(e) => { if (e.target === e.currentTarget) about.value = false }}>
      <section class="drawer about" role="dialog" aria-label={t('about')}>
        <header><h2>{t('about')}</h2><button class="ghost x" onClick={() => (about.value = false)} aria-label={t('close')}>×</button></header>
        <div class="about-body">
          <h3>{L('As issued in September 2022', 'Tal como se emitió en septiembre de 2022')}</h3>
          <ul>
            <li>{L('Every advisory, cone, track, wind radius, watch and warning, and wind speed probability: NOAA National Hurricane Center, Hurricane Fiona (AL072022), advisories 4 to 18.', 'Cada advertencia, cono, trayectoria, radio de viento, vigilancia, aviso y probabilidad de viento: Centro Nacional de Huracanes de NOAA, huracán Fiona (AL072022), advertencias 4 a 18.')} <Src href="https://www.nhc.noaa.gov/archive/2022/FIONA.shtml" /></li>
            <li>{L('Local impacts text: NWS San Juan hurricane local statements, through the Iowa Environmental Mesonet archive.', 'Texto de impactos locales: comunicados locales del NWS de San Juan, del archivo del Iowa Environmental Mesonet.')} <Src href="https://mesonet.agron.iastate.edu/wx/afos/" /></li>
            <li>{L('What happened: HURDAT2 best track; NHC Tropical Cyclone Report (2023), with its rainfall table; NWS flood warnings; USGS river gauges; FEMA housing assistance (DR-4671-PR).', 'Lo que pasó: trayectoria HURDAT2; Informe de Ciclón Tropical del NHC (2023), con su tabla de lluvia; avisos de inundaciones del NWS; ríos del USGS; asistencia de vivienda de FEMA (DR-4671-PR).')} <Src href="https://www.nhc.noaa.gov/data/tcr/AL072022_Fiona.pdf" /></li>
          </ul>
          <h3>{L('Today\'s Puerto Rico', 'El Puerto Rico de hoy')}</h3>
          <ul>
            <li>{L('Shelters are the Departamento de la Vivienda\'s 2026 list (the list gives no capacities). Facilities and roads: OpenStreetMap. Housing: HUD. People: CDC/ATSDR SVI 2022 and ACS. Electricity-dependent Medicare users: HHS emPOWER. Flood zones, surge and landslide maps: FEMA, NOAA, USGS.', 'Los refugios son la lista 2026 del Departamento de la Vivienda (sin capacidades). Instalaciones y carreteras: OpenStreetMap. Vivienda: HUD. Personas: CDC/ATSDR SVI 2022 y ACS. Usuarios de Medicare con equipo eléctrico: HHS emPOWER. Zonas inundables, marejada ciclónica y deslizamientos: FEMA, NOAA, USGS.')}</li>
            <li>{L('These were compiled for Garita, a digital twin of Puerto Rico; this exercise reuses them.', 'Se recopilaron para Garita, un gemelo digital de Puerto Rico; este ejercicio los reutiliza.')} <Src href="https://webgpu-demos.github.io/garita/">Garita</Src></li>
            <li>{L('The storm is 2022\'s; the places are today\'s. A shelter on the 2026 list may not have existed in 2022.', 'La tormenta es de 2022; los lugares son de hoy. Un refugio de la lista 2026 pudo no existir en 2022.')}</li>
          </ul>
          <h3>{L('Computed here (marked on screen)', 'Calculado aquí (marcado en pantalla)')}</h3>
          <ul>
            <li>{L('Chance of wind at a place: the NHC 5-km probability band the place falls in; for a municipio, the highest band touching it. NHC\'s own table for named places can read a few points different.', 'Probabilidad de viento en un lugar: la banda de probabilidad de 5 km del NHC donde cae el lugar; para un municipio, la banda más alta que lo toca. La tabla del NHC para lugares con nombre puede diferir unos puntos.')}</li>
            <li>{L('Arrival of 39 mph and 74 mph winds: when NHC\'s forecast wind radii, interpolated hour by hour, first reach the place. NHC publishes its own arrival-time graphics; this stands in for them.', 'Llegada de vientos de 39 y 74 mph: cuándo los radios de viento pronosticados por el NHC, interpolados hora a hora, alcanzan el lugar. El NHC publica sus propios gráficos de llegada; esto los sustituye.')}</li>
            <li>{L('Roads and bridges: OpenStreetMap main roads sampled every 40 m against the USGS landslide map, and bridges on public roads in a FEMA flood zone or on High or greater landslide ground.', 'Carreteras y puentes: carreteras principales de OpenStreetMap muestreadas cada 40 m contra el mapa de deslizamientos del USGS, y puentes de vías públicas en zona inundable de FEMA o en terreno de susceptibilidad Alta o mayor.')}</li>
            <li>{L('Shelter and facility flags: FEMA flood zone, surge category, landslide class and ground elevation at the point, as computed for Garita.', 'Señales de refugios e instalaciones: zona inundable de FEMA, categoría de marejada ciclónica, clase de deslizamiento y elevación del terreno en el punto, calculadas para Garita.')}</li>
            <li>{L('Closest approach: the official forecast points interpolated hourly.', 'Paso más cercano: los puntos del pronóstico oficial interpolados por hora.')}</li>
            <li>{L('Questions for the tables are generated from what changed between advisories; they are prompts, not forecasts.', 'Las preguntas para las mesas se generan a partir de lo que cambió entre advertencias; son guías, no pronósticos.')}</li>
          </ul>
          <h3>{L('The game layer', 'La capa de juego')}</h3>
          <ul>
            <li>{L('Teams: each table has 3 outreach teams, 2 supply caches and 2 inspection crews (can be switched off in setup). Dropping a decision frees its team.', 'Equipos: cada mesa tiene 3 equipos de alcance, 2 depósitos de suministros y 2 brigadas de inspección (se puede apagar en la preparación). Descartar una decisión libera su equipo.')}</li>
            <li>{L('Points during play, all knowable at the time: +1 per team deployed, +1 for a reason, +1 for a "revisit if" trigger, +1 per advisory a decision is held through, +1 per review, +1 per threat call, +3 when a round\'s four goals are met (threat call, a team deployed, every decision reviewed, a public message). Bonus at the reveal, against what happened: +3 per standing decision on target (15+ inches of rain nearby by the NHC report\'s stations, or a municipio in the top third for FEMA housing aid per household; supplies: a usable site near people hit hard), +2 per round a table called rain and landslides the biggest threat. Points are a game; outcomes carry luck.', 'Puntos durante el juego, todos conocibles en el momento: +1 por equipo desplegado, +1 por una razón, +1 por un detonante para revisar, +1 por cada advertencia que una decisión se mantiene, +1 por revisión, +1 por amenaza escogida, +3 cuando se cumplen las cuatro metas de la ronda (amenaza, un equipo desplegado, cada decisión revisada, un mensaje público). Bono en la revelación, contra lo que pasó: +3 por decisión vigente en el blanco (15+ pulgadas de lluvia cerca según las estaciones del informe del NHC, o un municipio en el tercio con más ayuda de vivienda de FEMA por hogar; suministros: un sitio utilizable cerca de gente muy afectada), +2 por cada ronda en que la mesa escogió lluvia y deslizamientos como mayor amenaza. Los puntos son un juego; los resultados tienen suerte.')}</li>
          </ul>
          <h3>{L('Not here', 'Lo que no está')}</h3>
          <ul>
            <li>{L('No rainfall forecast map: NHC words the rain for the island as a whole. No shelter capacities, staffing or status. No live data: the exercise runs entirely from files and works offline.', 'No hay mapa de lluvia pronosticada: el NHC describe la lluvia para toda la isla. No hay capacidades, personal ni estado de refugios. No hay datos en vivo: el ejercicio corre desde archivos y funciona sin conexión.')}</li>
          </ul>
          <p class="fine">{S?.built && `Scenario built ${S.built}.`} {data.garita.value && `Garita data ${data.garita.value.seedVersion}.`} {L('An independent demonstrator; not affiliated with NOAA, FEMA or the Government of Puerto Rico, and not for operational use. Map labels: Open Sans (Apache 2.0).', 'Demostrador independiente; sin afiliación con NOAA, FEMA ni el Gobierno de Puerto Rico, y no es para uso operacional. Etiquetas del mapa: Open Sans (Apache 2.0).')}</p>
        </div>
      </section>
    </div>
  )
}
